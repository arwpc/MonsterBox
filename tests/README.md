MonsterBox Test Suite Overview

Layers and Folders
- unit: colocated in server/client packages (Mocha/Jest) or simple Node scripts where applicable
- integration: tests exercising APIs and middleware live via Playwright request fixture and Node helpers (e.g., hardware API smoke)
- hardware: tests/hardware/* covers per-part API and actions (runs without browser; can be gated by MONSTERBOX_HARDWARE_AVAILABLE=1)
- ux: tests/playwright/* and tests/ui/* run in Firefox via Playwright simulating real user flows

Key Conventions
- All Playwright UX specs import fixtures from tests/test.setup.ts to enforce:
  - Console errors/warnings fail the test
  - HTTP 5xx fail the test; save endpoints must return { success: true }
  - MCP log collector runs once per worker and new error lines fail the test
- Firefox-only UX: playwright.config.ts excludes tests/playwright and tests/ui from Chromium

Running tests
- All Playwright tests (Firefox by default):
  - npx playwright test
- VS Code Test Explorer:
  - Open the Testing view; Playwright tests appear and can be run/debugged
- Single file:
  - npx playwright test tests/playwright/forms-models.spec.js
- Trace/HTML report/JSON report outputs:
  - HTML: playwright-report/index.html
  - JSON: playwright-report/report.json
  - List reporter always enabled

Environment flags
- MB_TEST_MODE=1: enables stubbed/external-safe behavior in the app
- MONSTERBOX_HARDWARE_AVAILABLE=1: enables hardware-dependent test sections
- MB_E2E=1: enables long-running/optional E2E flows (e.g., ConvAI)

Notes
- Some legacy UI (e.g., Setup → Parts Add) is intentionally de-featured; calibration hub and API routes provide coverage instead
- Add new UX specs under tests/playwright and import from ../test.setup

