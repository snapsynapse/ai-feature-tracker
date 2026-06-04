# AI Tool Watch — agent instructions

## Build pipeline — IMPORTANT for agents

**`docs/` is generated, not source.** Every `.html` file under `docs/`, every API JSON under `docs/api/v1/`, plus `docs/agents.json`, `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt`, and `docs/index.xml` are produced by `scripts/build.js`. There is no `npm run build` wrapper — run the build directly:

```bash
node scripts/build.js
```

Direct edits to any generated `docs/` file will be overwritten on the next build.

Key templates inside `scripts/build.js`:

- `renderSharedFooter()` near line 1127 — site-wide footer (copyright, social, Substack/LinkedIn/Every AI Law links)
- Multiple inline `Organization` JSON-LD blocks (search for `"@id": "https://snapsynapse.com/#organization"`) — publisher schema across page types
- `agents.json` generator near line 4602 — `maintainer` field at line 4620
- `llms.txt` generator near line 4498

Always edit at the source level, then regenerate:

```bash
# After editing scripts/build.js or data/
node scripts/build.js
git add scripts/ docs/   # commit source AND its outputs together
```

Safe to edit directly: `LICENSE`, `README.md`, `data/` (source data), `skills/` (skill bundles), `scripts/` themselves, `.github/`, `assets/` source. When in doubt, grep `scripts/build.js` for the file path before editing.

## Stewardship and use

AI Tool Watch is an open reference under Snap Synapse LLC stewardship, authored by Sam Rogers. It is used indirectly by PAICE.work (`https://paice.work/`). A planned MCP integration will expose AI Tool Watch to PAICE so behavioral-reliability assessments stay current with product changes and PAICE Pro features. The reference remains MIT-licensed and free for any use.
