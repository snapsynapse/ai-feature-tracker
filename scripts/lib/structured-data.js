/**
 * JSON-LD extraction and schema.org shape validation for generated pages
 *
 * The 125 SEO bridge pages (plus the core dashboard pages) embed JSON-LD
 * structured data with no build-time check. This module parses every
 * `<script type="application/ld+json">` block found in a rendered HTML
 * file and validates it two ways:
 *
 *   1. Syntax — must be valid JSON. A future build.js edit that breaks
 *      template-literal interpolation (an unescaped quote, a stray
 *      trailing comma) would otherwise ship silently.
 *   2. Shape — each node's `@type` implies a small set of properties
 *      Google's structured-data guidelines treat as required. Missing
 *      ones don't break parsing, so nothing else would catch them before
 *      Search Console does.
 *
 * This does not implement the schema.org type system. It is a fixed,
 * small rulebook for the types this repo actually emits (see the
 * `RULES` table) — extend it when build.js starts emitting a new type.
 */

'use strict';

const JSON_LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

/**
 * Extract every JSON-LD block from an HTML string.
 * @param {string} html
 * @returns {Array<{raw: string, index: number}>} raw text and its offset in html (for line reporting)
 */
function extractJsonLdBlocks(html) {
    const blocks = [];
    let match;
    JSON_LD_BLOCK.lastIndex = 0;
    while ((match = JSON_LD_BLOCK.exec(html)) !== null) {
        blocks.push({ raw: match[1], index: match.index });
    }
    return blocks;
}

function lineAt(html, index) {
    return html.slice(0, index).split('\n').length;
}

/**
 * Required (and a few recommended) properties per schema.org @type, scoped
 * to the types this repo's build.js actually emits.
 */
const RULES = {
    Organization: { required: ['name', 'url'] },
    WebSite: { required: ['name', 'url'] },
    WebPage: { required: ['name', 'url'] },
    AboutPage: { required: ['name', 'url'] },
    Thing: { required: ['name'] },
    DefinedTerm: { required: ['name', 'description'] },
    DefinedTermSet: { required: ['name'] },
    SoftwareApplication: { required: ['name'] },
    FAQPage: { required: ['mainEntity'], nonEmptyArray: ['mainEntity'] },
    Question: { required: ['name', 'acceptedAnswer'] },
    Answer: { required: ['text'] },
    ItemList: { required: ['itemListElement'], nonEmptyArray: ['itemListElement'] },
    ListItem: { required: ['position'] }
};

/**
 * Nodes nested under these keys get walked and validated too, since a
 * malformed Question or ListItem is invisible if only the parent is checked.
 */
const NESTED_KEYS = ['@graph', 'mainEntity', 'itemListElement', 'acceptedAnswer', 'isPartOf', 'publisher', 'about', 'inDefinedTermSet', 'isSimilarTo'];

function typesOf(node) {
    if (!node || typeof node !== 'object') return [];
    const t = node['@type'];
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
}

/**
 * Validate one JSON-LD node against RULES for its @type(s). Does not
 * recurse — callers walk NESTED_KEYS separately so every node is checked
 * exactly once with its own path for error messages.
 * @returns {Array<string>} problem descriptions, empty if the node is fine
 */
function validateNode(node, path) {
    const problems = [];
    if (!node || typeof node !== 'object' || Array.isArray(node)) return problems;

    for (const type of typesOf(node)) {
        const rule = RULES[type];
        if (!rule) continue; // type not in RULES — not an error, just unchecked
        for (const prop of rule.required || []) {
            if (!(prop in node) || node[prop] === '' || node[prop] === null || node[prop] === undefined) {
                problems.push(`${path} (@type ${type}) is missing required property "${prop}"`);
            }
        }
        for (const prop of rule.nonEmptyArray || []) {
            const value = node[prop];
            if (Array.isArray(value) && value.length === 0) {
                problems.push(`${path} (@type ${type}) has an empty "${prop}" array`);
            }
        }
    }

    return problems;
}

/**
 * Walk a parsed JSON-LD document (the object returned by JSON.parse), check
 * every node reachable via NESTED_KEYS, and flag ItemList position gaps or
 * duplicates.
 * @param {*} doc - parsed JSON-LD
 * @param {string} label - identifies this block in problem messages
 * @returns {Array<string>}
 */
function validateDocument(doc, label) {
    const problems = [];

    function visit(node, path) {
        if (Array.isArray(node)) {
            node.forEach((item, i) => visit(item, `${path}[${i}]`));
            return;
        }
        if (!node || typeof node !== 'object') return;

        problems.push(...validateNode(node, path));

        if (typesOf(node).includes('ItemList') && Array.isArray(node.itemListElement)) {
            const positions = node.itemListElement
                .map(item => item && item['@type'] === 'ListItem' ? item.position : undefined)
                .filter(p => p !== undefined);
            if (positions.length > 0) {
                const sorted = [...positions].sort((a, b) => a - b);
                const expected = positions.map((_, i) => i + 1);
                const hasDuplicates = new Set(positions).size !== positions.length;
                const hasGap = JSON.stringify(sorted) !== JSON.stringify(expected);
                if (hasDuplicates) problems.push(`${path} ItemList has duplicate position values: ${positions.join(', ')}`);
                else if (hasGap) problems.push(`${path} ItemList positions are not a contiguous 1..N sequence: ${positions.join(', ')}`);
            }
        }

        for (const key of NESTED_KEYS) {
            if (key in node) visit(node[key], `${path}.${key}`);
        }
    }

    visit(doc, label);
    return problems;
}

/**
 * Extract, parse, and validate every JSON-LD block in an HTML file's content.
 * @param {string} html
 * @param {string} filelabel - e.g. a relative file path, used in messages
 * @returns {Array<{severity: 'error'|'warning', message: string}>}
 */
function checkHtml(html, filelabel) {
    const findings = [];
    const blocks = extractJsonLdBlocks(html);

    blocks.forEach((block, i) => {
        const line = lineAt(html, block.index);
        const label = `${filelabel}:${line} (block ${i + 1}/${blocks.length})`;
        let doc;
        try {
            doc = JSON.parse(block.raw);
        } catch (e) {
            findings.push({ severity: 'error', message: `${label}: invalid JSON — ${e.message}` });
            return;
        }
        for (const message of validateDocument(doc, label)) {
            findings.push({ severity: 'error', message });
        }
    });

    return findings;
}

module.exports = {
    extractJsonLdBlocks,
    validateNode,
    validateDocument,
    checkHtml,
    RULES
};
