---
mode: # Template: Add Tests
Target: <function/route/component>

Create:
- Mocha unit tests: one happy path, one error path.
- If UI-visible behavior: Playwright E2E path (open page → act → assert).

Run:
- `npm run test:unit`
- `npm run test:e2e`
- Summarize coverage deltas if available.

---
Define the task to achieve, including specific requirements, constraints, and success criteria.