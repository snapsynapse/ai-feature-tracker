#!/usr/bin/env node

/**
 * validate-structured-data.js — parse and shape-check every JSON-LD block
 * in the generated site
 *
 * Walks docs/**\/*.html, extracts every <script type="application/ld+json">
 * block, and checks it two ways: valid JSON, and required properties present
 * for its @type (see scripts/lib/structured-data.js RULES). Catches
 * regressions in the 125 SEO bridge pages' structured data before Google
 * Search Console does (design/ROADMAP.md "Structured data validation").
 *
 * Must run AFTER scripts/build.js — it checks generated output, not source.
 *
 * Usage:
 *   node scripts/validate-structured-data.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { checkHtml } = require('./lib/structured-data');

const DOCS_DIR = path.join(__dirname, '..', 'docs');

function walkHtmlFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkHtmlFiles(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

if (!fs.existsSync(DOCS_DIR)) {
    console.error(`${DOCS_DIR} does not exist — run scripts/build.js first.`);
    process.exit(1);
}

const files = walkHtmlFiles(DOCS_DIR);
let blockCount = 0;
const findings = [];

for (const file of files) {
    const html = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(path.join(__dirname, '..'), file);
    blockCount += (html.match(/<script type="application\/ld\+json">/g) || []).length;
    for (const finding of checkHtml(html, relPath)) {
        findings.push(finding);
    }
}

const errors = findings.filter(f => f.severity === 'error');

console.log(JSON.stringify({
    files: files.length,
    json_ld_blocks: blockCount,
    errors: errors.length
}, null, 2));

if (errors.length) {
    console.log('\nErrors:\n');
    errors.forEach(f => console.log(`- ${f.message}`));
    console.error('\nStructured data validation failed.');
    process.exit(1);
}

console.log('\nStructured data validation passed.');
