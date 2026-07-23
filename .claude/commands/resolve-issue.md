---
name: resolve-issue
description: Alias for /resolve-gh-issue with ai-tool-watch's project context applied. Triage and resolve verification issues against this repo's tracked AI feature data.
argument-hint: [issue-number | "all" | "batch <label-or-keyword>"]
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, WebFetch, Task
---

# /resolve-issue (alias)

This is a thin alias for the generic `/resolve-gh-issue` skill, retained for muscle-memory continuity in this repo.

The generic skill lives at `~/Git/skills/resolve-gh-issue/` (symlinked into `.claude/skills/resolve-gh-issue`). Project-specific configuration lives at `.claude/skills/resolve-gh-issue-context.md` (repo slug, data file globs, label taxonomy, domain rules including the Claude self-verification mandate).

Run the `resolve-gh-issue` skill with these arguments: `$ARGUMENTS`

The skill will:

1. Read `.claude/skills/resolve-gh-issue-context.md` from the current working directory
2. Apply the structured config (repo slug, globs, labels, date fields, changelog format)
3. Apply the prose domain rules (self-verification ban for Claude records, field-level consistency checks, talking-point conventions, temp-state handling, dedup heuristics)
4. Run the 9-phase pipeline against the requested issue(s)
