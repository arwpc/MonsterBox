## Copilot Instructions for MonsterBox

Mission: make small, reversible, test-backed changes; prioritize hardware safety.

## Hard rules (must follow)
- Do not add new dependencies without an explicit rationale and a plan to pin/version them.
- Never change GPIO/I2C/power defaults (or PCA9685/pigpio settings) without: rationale, a simulation path using `MB_TEST_MODE=1`, and tests or manual verification steps.
- Don’t commit secrets, credentials, or long-lived API keys to the repo.

## Quick context (what an agent should know immediately)
- Single-node Express server: entrypoint is `server.js` (routes mounted from `routes/`).
- Audio, webcam, and hardware control are first-class concerns (see `services/`, `goblin/`, and `scripts/`).
- Tests: Mocha for unit, Playwright for UI/E2E. Playwright runs Firefox by default in CI.
- Important env flags:
	- `MB_TEST_MODE=1` — stub/external-safe mode used in CI and local dev.
	- `MB_NO_MCP=1` — disable MCP calls during tests.
	- `MONSTERBOX_HARDWARE_AVAILABLE=1` — enable hardware-only tests.

## Common commands (include these in PR testing instructions)
- Install: `npm ci`
- Start (dev/test-safe): `MB_TEST_MODE=1 npm start` (server at `:3000`)
- Unit tests: `npm run test:unit`
- Fast UI/E2E (CI-friendly): `npm run test:ui:fast`
- Full verify (unit + e2e): `npm run verify`

## Architecture & patterns to reference
- `server.js` — shows global flags, error stats (`app.locals.errorStats`), and `res.renderWithLayout` helper used by EJS templates.
- `routes/` — modular routers; prefer adding endpoints here and following existing API shapes (tests rely on stable endpoints).
- `services/` — hardware and audio integrations (PipeWire, jaw animation, audio health monitor). Search for `audioHealthMonitor`, `pipewireService`, and `elevenLabsWebSocketService` when changing audio behavior.
- `goblin/` and `goblin-management` — Goblin video subsystem patterns (MPV usage, queue APIs) are important for media playback changes.
- `scripts/` — system-level scripts (e.g., `scripts/setup-webcam.sh`) document assumptions about system packages and udev rules.

## Testing & E2E notes (do this in PRs)
- Playwright tests treat console errors and HTTP 5xx as failures. Avoid noisy client-side console logs in UI changes.
- Use `MB_TEST_MODE=1` in test steps to avoid external API calls. If you need to exercise external integrations, add a clear opt-in and test guard in the test harness.
- For hardware-related changes, provide an emulation path or mark tests behind `MONSTERBOX_HARDWARE_AVAILABLE=1` and document manual verification steps.

## PR checklist (include in PR description)
1. Summary: 1–2 sentences.
2. Files changed and the reason.
3. Commands to reproduce locally (include env flags, e.g., `MB_TEST_MODE=1`).
4. Tests run and their status (unit/E2E). Include failing output if any.
5. Risk: hardware, data, or runtime impact and mitigation.

## When to be conservative
- Hardware control code touching `pca9685`, `pigpio`, GPIO pins, or I2C buses: assume high risk. Require simulation, an explicit rollback plan, and test steps.
- Adding native or platform-specific dependencies (e.g., RPi binary bindings): document cross-arch build and runtime requirements.

## Where to look for more guidance
- Operational README: `README.md` (top-level) and `docs/deployment/README.md` for systemd and production details.
- Tests overview: `tests/README.md`.
- Cursor rules & agent guidance: `.cursor/rules/*.mdc` (dev workflow and self-improve rules).

If anything here is unclear or you'd like this shortened/expanded for a specific task, tell me which area to adjust and I'll iterate.
