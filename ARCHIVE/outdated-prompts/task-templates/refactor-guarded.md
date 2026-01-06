# Template: Safe Refactor (Guarded)
Goal: <precise>
Scope: <files/functions>

Constraints:
- No new deps; public APIs unchanged.
- Do not alter GPIO defaults or actuator semantics.

Steps:
1) Explain current flow + side effects (2–4 bullets)
2) Plan N small commits
3) Produce minimal diff
4) Run `npm run verify` and summarize results
5) If failure: stop, show failing tests, propose minimal patch

Deliverables: diff, test plan, risk (1–2 bullets), docs snippet (if user-facing)
