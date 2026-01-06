# Template: Add Tests
Target: <function/route/component>

Create:
- Mocha unit tests: one happy path, one error path
- If UI-visible: Playwright E2E (open → act → assert)

Run:
- `npm run test:unit`
- `npm run test:e2e`
- Summarize coverage (if available)
