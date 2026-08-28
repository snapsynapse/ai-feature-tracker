/**
 * Tests for claims.checkFeatureClaims — talking-point prose cross-checking.
 *
 * The positive cases reproduce the real 2026-08-15 prose defects (issues
 * #618/#617): a "temporary promotional access" claim standing months after
 * verification, and a talking point naming a plan the availability table
 * contradicts or lacks. The negative cases lock in the false-positive
 * fixes from the first repo-wide run: "Free users get [something else]
 * only", ⚠️ limited-free rows on paid-gated features, "HTML preview",
 * "March 2026 beta rollout", and sub-component "deprecated" mentions.
 *
 * Run:  node --test tests/claims.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { checkFeatureClaims, findPlanClaims, planVocabulary } = require('../scripts/lib/claims');

const NOW = new Date('2026-08-28T00:00:00Z');

function makeFeature(overrides = {}) {
    return {
        name: 'Test Feature',
        status: 'ga',
        gating: 'paid',
        verified: '2026-08-15',
        availability: [
            { plan: 'Free', available: '❌', limits: '—', notes: '' },
            { plan: 'Plus', available: '✅', limits: 'Standard', notes: '' },
            { plan: 'Pro', available: '✅', limits: 'Higher', notes: '' }
        ],
        talking_point: '',
        ...overrides
    };
}

const PLATFORM = {
    name: 'TestPlatform',
    pricing: [
        { plan: 'Free', price: '$0' },
        { plan: 'Plus', price: '$20/mo' },
        { plan: 'Pro', price: '$200/mo' }
    ]
};

function check(feature) {
    return checkFeatureClaims(feature, PLATFORM, NOW);
}

function checksOf(issues) {
    return issues.map(i => i.check);
}

// --------------------------------------------------------------------
// Positive cases — the defects the checker exists to catch
// --------------------------------------------------------------------

describe('real defect shapes', () => {

    it('flags "including free" when the Free row is ❌', () => {
        const issues = check(makeFeature({
            talking_point: 'Available on all plans including free with tiered limits.'
        }));
        assert.ok(checksOf(issues).includes('universal-claim'));
        assert.equal(issues[0].severity, 'error');
    });

    it('flags "available on every plan" when the Free row is ❌', () => {
        const issues = check(makeFeature({
            talking_point: 'Now available on every plan.'
        }));
        assert.ok(checksOf(issues).includes('universal-claim'));
    });

    it('flags a named plan claimed available while its row is ❌', () => {
        const issues = check(makeFeature({
            availability: [
                { plan: 'Free', available: '❌' },
                { plan: 'Plus', available: '❌' },
                { plan: 'Pro', available: '✅' }
            ],
            talking_point: 'Available on Plus and above.'
        }));
        assert.ok(checksOf(issues).includes('plan-availability'));
    });

    it('flags a claim about a plan with no availability row (the missing-row blind spot)', () => {
        // The Veo defect class: prose names AI Pro while the table is
        // missing a row the prose implies should exist.
        const issues = check(makeFeature({
            availability: [{ plan: 'Free', available: '❌' }],
            talking_point: 'Requires Plus or higher.'
        }));
        assert.ok(checksOf(issues).includes('plan-unknown'));
    });

    it('flags time-bound wording older than the 60-day verification window', () => {
        // The Codex defect: "temporary promotional access" five months on.
        const issues = check(makeFeature({
            verified: '2026-03-01',
            talking_point: 'Free and Go users have temporary promotional access.'
        }));
        assert.ok(checksOf(issues).includes('time-bound-claim'));
        assert.equal(issues.find(i => i.check === 'time-bound-claim').severity, 'warning');
    });

    it('does not flag time-bound wording with a fresh Verified date', () => {
        const issues = check(makeFeature({
            verified: '2026-08-15',
            talking_point: 'Free users have temporary promotional access.'
        }));
        assert.ok(!checksOf(issues).includes('time-bound-claim'));
    });

    it('flags feature-level "paid-only" when the Free row is ✅', () => {
        const issues = check(makeFeature({
            availability: [{ plan: 'Free', available: '✅' }],
            talking_point: 'This feature is paid-only.'
        }));
        assert.ok(checksOf(issues).includes('paid-only-claim'));
    });

    it('flags "still in beta" when Status is ga', () => {
        const issues = check(makeFeature({
            status: 'ga',
            talking_point: 'The feature is still in beta for most users.'
        }));
        assert.ok(checksOf(issues).includes('status-mismatch'));
    });

    it('flags "generally available" when Status is preview', () => {
        const issues = check(makeFeature({
            status: 'preview',
            talking_point: 'Now generally available to all subscribers.'
        }));
        assert.ok(checksOf(issues).includes('status-mismatch'));
    });
});

// --------------------------------------------------------------------
// Negative cases — first-run false positives that must stay fixed
// --------------------------------------------------------------------

describe('false-positive shapes from the first repo-wide run', () => {

    it('does not flag "Free users get [another product] only" (Gemini Advanced shape)', () => {
        const issues = check(makeFeature({
            talking_point: 'Requires Plus. Free users get standard Gemini only.'
        }));
        assert.ok(!checksOf(issues).includes('universal-claim'));
        assert.ok(!checksOf(issues).some(c => c === 'plan-availability'));
    });

    it('does not flag "including free" when the Free row is ⚠️ limited (DALL-E shape)', () => {
        const issues = check(makeFeature({
            gating: 'paid',
            availability: [
                { plan: 'Free', available: '⚠️', limits: '~2/day' },
                { plan: 'Plus', available: '✅' }
            ],
            talking_point: 'Available on all plans including free with tiered limits.'
        }));
        assert.equal(issues.length, 0);
    });

    it('does not flag surface-scoped "paid-only" (desktop voice shape)', () => {
        const issues = check(makeFeature({
            availability: [{ plan: 'Free', available: '✅' }],
            talking_point: 'Voice in the macOS and Windows desktop apps is paid-only.'
        }));
        assert.ok(!checksOf(issues).includes('paid-only-claim'));
    });

    it('does not flag "HTML preview" as a status claim (Grok Studio shape)', () => {
        const issues = check(makeFeature({
            status: 'ga',
            talking_point: 'Supports Python, JavaScript, and HTML preview.'
        }));
        assert.ok(!checksOf(issues).includes('status-mismatch'));
    });

    it('does not flag "March 2026 beta rollout" of sub-features (Workspace shape)', () => {
        const issues = check(makeFeature({
            status: 'ga',
            talking_point: 'March 2026 beta rollout adds new drafting tools.'
        }));
        assert.ok(!checksOf(issues).includes('status-mismatch'));
    });

    it('does not flag sub-component "deprecated" mentions (Extended Thinking shape)', () => {
        const issues = check(makeFeature({
            status: 'ga',
            talking_point: 'Manual thinking mode is deprecated on Opus 4.6.'
        }));
        assert.ok(!checksOf(issues).includes('status-mismatch'));
    });

    it('does not treat a negated availability phrase as a positive claim', () => {
        const issues = check(makeFeature({
            availability: [{ plan: 'Free', available: '❌' }],
            talking_point: 'Not available on Free.'
        }));
        assert.ok(!checksOf(issues).includes('plan-availability'));
    });

    it('flags a denied plan that the table marks ✅', () => {
        const issues = check(makeFeature({
            availability: [{ plan: 'Free', available: '✅' }],
            talking_point: 'Not available on Free.'
        }));
        assert.ok(checksOf(issues).includes('plan-availability'));
    });

    it('returns nothing for a feature without a talking point', () => {
        assert.equal(check(makeFeature({ talking_point: '' })).length, 0);
    });
});

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

describe('plan matching mechanics', () => {

    it('prefers the longest plan name on substring overlap (AI Pro vs Pro)', () => {
        const claims = findPlanClaims(
            'Requires AI Pro or higher.',
            ['AI Pro', 'Pro', 'Free']
        );
        assert.deepEqual(claims.map(c => c.plan), ['AI Pro']);
    });

    it('builds vocabulary from pricing plus availability plus global fallback', () => {
        const vocab = planVocabulary(
            { availability: [{ plan: 'Enterprise Pro', available: '✅' }] },
            { pricing: [{ plan: 'Max', price: '$200/mo' }] }
        );
        assert.ok(vocab.includes('Enterprise Pro'));
        assert.ok(vocab.includes('Max'));
        assert.ok(vocab.includes('Free'));
    });
});
