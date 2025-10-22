# Copilot Instructions for MonsterBox
Mission: small, reversible, **test-backed** changes; prioritize hardware safety.

Hard Rules:
- No new deps without explicit request + rationale.
- Don’t alter GPIO/I2C/power defaults without explanation, tests, and docs.
- Keep code style/layout; no secrets in code/logs.

Required Workflow:
1) Propose minimal diff.
2) Run tests: `npm run test:unit`, `npm run test:e2e`, or `npm run verify`.
3) Stop on failure; print failing output; propose smallest corrective change.
4) For UI behavior, validate with **Chrome DevTools Browser MCP** (no console errors).

Preferred Tools:
- Chrome DevTools Browser MCP → run/inspect/validate.
- GitHub MCP → branch/commit/PR.

Output: Diff • Why • Test Plan • Risk • Doc updates (if user-facing)
