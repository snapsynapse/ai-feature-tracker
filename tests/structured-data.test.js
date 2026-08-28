/**
 * Tests for structured-data.js — JSON-LD parsing and shape validation.
 *
 * design/ROADMAP.md: "125 bridge pages embed JSON-LD structured data with
 * no build-time validation. Add a CI check that parses every
 * <script type="application/ld+json"> block to catch regressions before
 * Google Search Console does." These tests lock in both halves: a broken
 * <script> block (the regression class this exists to catch) and the real
 * node shapes build.js emits today (Organization/WebSite/WebPage graphs,
 * FAQPage/Question/Answer, ItemList/ListItem, DefinedTerm/DefinedTermSet)
 * so a future rule change that stops accepting valid output is visible
 * immediately.
 *
 * Run:  node --test tests/structured-data.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { extractJsonLdBlocks, validateDocument, checkHtml } = require('../scripts/lib/structured-data');

function wrap(json) {
    return `<!DOCTYPE html><html><head><script type="application/ld+json">${json}</script></head><body></body></html>`;
}

// --------------------------------------------------------------------
// extractJsonLdBlocks
// --------------------------------------------------------------------

describe('extractJsonLdBlocks', () => {

    it('finds a single block', () => {
        const blocks = extractJsonLdBlocks(wrap('{"@type":"Thing","name":"x"}'));
        assert.equal(blocks.length, 1);
    });

    it('finds multiple blocks in one document', () => {
        const html = wrap('{"@type":"Thing","name":"a"}') + wrap('{"@type":"Thing","name":"b"}');
        assert.equal(extractJsonLdBlocks(html).length, 2);
    });

    it('finds nothing when the page has no JSON-LD (404-page shape)', () => {
        assert.equal(extractJsonLdBlocks('<html><head></head><body>Not found</body></html>').length, 0);
    });
});

// --------------------------------------------------------------------
// checkHtml — the regression class this validator exists to catch
// --------------------------------------------------------------------

describe('checkHtml catches broken JSON-LD', () => {

    it('flags a trailing comma (invalid JSON)', () => {
        const findings = checkHtml(wrap('{"@type":"Thing","name":"x",}'), 'test.html');
        assert.equal(findings.length, 1);
        assert.match(findings[0].message, /invalid JSON/);
    });

    it('flags an unescaped quote breaking the block', () => {
        const findings = checkHtml(wrap('{"@type":"Thing","name":"the "best" tool"}'), 'test.html');
        assert.ok(findings.length >= 1);
        assert.match(findings[0].message, /invalid JSON/);
    });

    it('passes a syntactically valid block with no rule violations', () => {
        assert.equal(checkHtml(wrap('{"@type":"Thing","name":"x"}'), 'test.html').length, 0);
    });

    it('includes the file label and line number in the message', () => {
        const html = '\n\n' + wrap('{"@type":"Thing",}');
        const findings = checkHtml(html, 'docs/example/index.html');
        assert.match(findings[0].message, /docs\/example\/index\.html:3/);
    });
});

// --------------------------------------------------------------------
// validateDocument — required-property rules per @type
// --------------------------------------------------------------------

describe('validateDocument — required properties', () => {

    it('flags Organization missing url', () => {
        const problems = validateDocument({ '@type': 'Organization', name: 'Acme' }, 'root');
        assert.ok(problems.some(p => p.includes('"url"')));
    });

    it('accepts a complete Organization', () => {
        const problems = validateDocument({ '@type': 'Organization', name: 'Acme', url: 'https://acme.example/' }, 'root');
        assert.equal(problems.length, 0);
    });

    it('flags FAQPage with an empty mainEntity array', () => {
        const problems = validateDocument({ '@type': 'FAQPage', mainEntity: [] }, 'root');
        assert.ok(problems.some(p => p.includes('empty "mainEntity"')));
    });

    it('flags a Question missing acceptedAnswer', () => {
        const problems = validateDocument({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Can it?' }] }, 'root');
        assert.ok(problems.some(p => p.includes('acceptedAnswer')));
    });

    it('flags an Answer missing text', () => {
        const doc = {
            '@type': 'FAQPage',
            mainEntity: [{ '@type': 'Question', name: 'Can it?', acceptedAnswer: { '@type': 'Answer' } }]
        };
        const problems = validateDocument(doc, 'root');
        assert.ok(problems.some(p => p.includes('"text"')));
    });

    it('accepts a real build.js-shaped FAQPage (the /can/ bridge pages)', () => {
        const doc = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [{
                '@type': 'Question',
                name: 'Can Gemini write code?',
                acceptedAnswer: { '@type': 'Answer', text: 'Yes, via AI Studio.' }
            }]
        };
        assert.equal(validateDocument(doc, 'root').length, 0);
    });

    it('flags ItemList with an empty itemListElement array', () => {
        const problems = validateDocument({ '@type': 'ItemList', itemListElement: [] }, 'root');
        assert.ok(problems.some(p => p.includes('empty "itemListElement"')));
    });

    it('accepts a real build.js-shaped ItemList (the /best-for/ bridge pages)', () => {
        const doc = {
            '@type': 'ItemList',
            name: 'Best AI for Working with Files',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'A', url: 'https://aitool.watch/capability/a/' },
                { '@type': 'ListItem', position: 2, name: 'B', url: 'https://aitool.watch/capability/b/' }
            ]
        };
        assert.equal(validateDocument(doc, 'root').length, 0);
    });

    it('flags duplicate ListItem positions', () => {
        const doc = {
            '@type': 'ItemList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'A' },
                { '@type': 'ListItem', position: 1, name: 'B' }
            ]
        };
        const problems = validateDocument(doc, 'root');
        assert.ok(problems.some(p => p.includes('duplicate position')));
    });

    it('flags a gap in ListItem positions', () => {
        const doc = {
            '@type': 'ItemList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'A' },
                { '@type': 'ListItem', position: 3, name: 'B' }
            ]
        };
        const problems = validateDocument(doc, 'root');
        assert.ok(problems.some(p => p.includes('not a contiguous')));
    });

    it('does not require positions on non-ListItem itemListElement entries (the /compare/ shape)', () => {
        // docs/compare/*/index.html uses SoftwareApplication items directly,
        // with no ListItem wrapper and no position — this is valid
        // schema.org and must not be flagged.
        const doc = {
            '@type': 'ItemList',
            itemListElement: [
                { '@type': 'SoftwareApplication', name: 'A' },
                { '@type': 'SoftwareApplication', name: 'B' }
            ]
        };
        assert.equal(validateDocument(doc, 'root').length, 0);
    });

    it('accepts a real build.js-shaped DefinedTerm (the /capability/ bridge pages)', () => {
        const doc = {
            '@type': 'DefinedTerm',
            name: 'See Images and Screens',
            description: 'Can interpret images and screenshots.',
            termCode: 'see-images-and-screens',
            inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'AI Capabilities', url: 'https://aitool.watch/' }
        };
        assert.equal(validateDocument(doc, 'root').length, 0);
    });

    it('flags DefinedTerm missing description', () => {
        const problems = validateDocument({ '@type': 'DefinedTerm', name: 'X' }, 'root');
        assert.ok(problems.some(p => p.includes('"description"')));
    });

    it('walks @graph and validates every node (the homepage/about-page shape)', () => {
        const doc = {
            '@context': 'https://schema.org',
            '@graph': [
                { '@type': 'Organization', '@id': 'https://snapsynapse.com/#organization', name: 'Snap Synapse LLC', url: 'https://snapsynapse.com/' },
                { '@type': 'WebSite', '@id': 'https://aitool.watch/#website', url: 'https://aitool.watch/', name: 'AI Tool Watch', publisher: { '@id': 'https://snapsynapse.com/#organization' } },
                { '@type': 'WebPage', '@id': 'https://aitool.watch/#webpage', url: 'https://aitool.watch/', name: 'AI Tool Watch', isPartOf: { '@id': 'https://aitool.watch/#website' } }
            ]
        };
        assert.equal(validateDocument(doc, 'root').length, 0);
    });

    it('does not flag a bare {"@id": "..."} reference node as missing properties', () => {
        // publisher/isPartOf/about are frequently just a pointer to another
        // node's @id, with no @type of its own on that pointer — must not
        // be treated as an untyped Organization/WebSite missing fields.
        const doc = { '@type': 'WebPage', name: 'X', url: 'https://x.example/', isPartOf: { '@id': 'https://x.example/#website' } };
        assert.equal(validateDocument(doc, 'root').length, 0);
    });

    it('does not error on an unrecognized @type', () => {
        assert.equal(validateDocument({ '@type': 'SomeFutureType', foo: 'bar' }, 'root').length, 0);
    });
});
