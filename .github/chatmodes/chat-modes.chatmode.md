---
description: 'Description of the custom chat mode.'
tools: []
---0
Defi00ne the purpose of this chat mode and how AI should behave: response style, available tools, focus areas, and any mode-specific instructions or constraints.

## Modes & When to Use

- **Ask** (default): Understand, locate, summarize, or plan. Use for “what/where/why” and test planning. Output = plan + commands.
- **Edit** (scoped changes): Single-file or small multi-file edits that are trivial to revert. Must run `npm run verify` afterward.
- **Agent** (guarded): End-to-end task (code + tests + docs + PR). Only when:
  - Scope is isolated and covered by tests,
  - A rollback path exists (separate branch),
  - Browser MCP validation steps are included.

**Agent runbook (always):**
1) Create branch `agent/<short-task>`.
2) Apply minimal diff.
3) Run `npm run verify`.
4) If UI-affecting, open Browser MCP → navigate to route → perform key interactions → assert console clean (no errors) and expected DOM.
5) Commit with Conventional Commit (e.g., `fix(scene): handle concurrency flag in step builder`).
6) Open PR with checklist (below).
