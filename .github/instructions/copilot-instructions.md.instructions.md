---
applyTo: '**'
---

# Copilot Instructions for MonsterBox

## Mission
Default to **small, reversible, test-backed** changes. Minimize risk for hardware.

## Hard Rules
- No new dependencies unless explicitly requested with rationale.
- Do not alter GPIO/I2C/power defaults without explanation, tests, and doc updates.
- Keep code style and layout consistent. No secrets in code/logs.

## Required Workflow
1) Propose smallest change; include a unified diff.
2) Run tests:
   - Unit (Mocha): `npm run test:unit`
   - E2E (Playwright): `npm run test:e2e`
   - Or both: `npm run verify`
3) If anything fails: stop, show failing test output, propose minimal fix.
4) If UI behavior changed, validate in **Chrome DevTools Browser MCP**.

## Preferred Tools (in order)
- Chrome DevTools Browser MCP → for run/inspect/visual validate.
- GitHub MCP → branch, commit, PR, apply suggested changes.

## Output Format
- **Diff**
- **Why**
- **Test Plan**
- **Risk**
- **Doc changes** (if user-facing)

Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.