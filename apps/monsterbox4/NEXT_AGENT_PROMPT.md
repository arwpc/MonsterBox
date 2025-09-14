MonsterBox 4.0 – Handoff Prompt for Next Agent

Context
- Single-node Node.js/Express app with EJS views
- Client JS must be ES5 only (no modern syntax in browser code)
- Uses Python wrappers to invoke existing hardware scripts in scripts/ and scripts/hardware/
- ARM64 environment: WebKit only for Playwright in CI (Firefox optional); no Chromium
- No simulation fallback: fail fast with clear, descriptive errors

Current State (as of this handoff)
- Per-type hardware Test endpoint: POST /setup/parts/api/parts/:id/test accepts { action, params }
- UI: Setup → Parts has per-type Test drawers using data-testid selectors; stable WebKit specs
- Real hardware wired (via apps/monsterbox4/services/hardwareService + python_wrappers):
  - servo: python_wrappers/servo_cli.py → scripts/servo_control.py (GPIO). Removed simulation path.
  - motor: python_wrappers/motor_cli.py → scripts/motor_control.py
  - light: python_wrappers/light_cli.py → scripts/light_control.py
  - led: python_wrappers/led_cli.py → scripts/led_control.py
- Remaining types still simulated: linear_actuator, sensor, motion_sensor, webcam, microphone, speaker, head_tracking
- README updated: coverage matrix, examples, and explicit No‑Fallback policy and troubleshooting

Guiding Constraints
- ES5 client JS only; use function syntax and var; no arrow functions/classes in browser scripts
- Single-process Node app; do not (re)introduce WebSockets or multi-process topology
- Hardware errors should surface clearly to API/UI; do not mask with simulated success

Immediate Priorities
1) Wire linear actuator to real hardware
   - Create apps/monsterbox4/python_wrappers/linear_actuator_cli.py that calls scripts/linear_actuator_control.py
   - Map actions: extend, retract, stop; params may include speed, distance or duration (choose safe defaults)
   - Update services/hardwareService/index.js controller for linear_actuator to use runWrapper and parse JSON
   - Add README examples and ensure error messages propagate to UI drawers

2) Wire sensors (generic) and motion_sensor
   - Create thin CLI wrappers (sensor_cli.py, motion_sensor_cli.py) that call the appropriate Python scripts
   - Provide a read action returning { value, units? } consistently
   - Update hardwareService; Surface errors cleanly (e.g., missing dependencies, permission issues)
   - Add UI polling in the Test drawer (already scaffolded) to display values

3) Error handling UX in Setup → Parts drawers
   - Ensure any failure shows a non-blocking error banner with the API response message
   - If rawOutput is present, show an expandable details panel for troubleshooting

Secondary (if time)
- Scenes MVP: CRUD + execution that sequences poses through poseEngine
- Live Mode: Quick Poses wired to /poses/:id/execute with inline status
- CI: GitHub Actions to run unit + WebKit Playwright tests on PRs

Acceptance Criteria
- Linear actuator: Extend/Retract/Stop actions call real Python; success returns meaningful message; failure returns error message and rawOutput
- Sensors: Read returns JSON value; motion sensor returns detected true/false
- README updated with examples and coverage matrix reflects new real controllers
- UI drawers display errors clearly without crashing/hanging

Testing Notes
- Unit/Integration tests expect a running server (see README Testing section)
- Playwright: run with WebKit (npx playwright test --project=webkit). Prefer data-testid selectors and smart waits
- Avoid flaky tests; use locator assertions and expect.poll for dynamic values

Troubleshooting
- Check Python deps (scripts/requirements.txt) and permissions (lgpio/I2C)
- Inspect API responses for message and rawOutput fields
- Validate pin/channel mappings in parts.json and calibration in data/servo_calibrations.json

Reference Paths
- Services: apps/monsterbox4/services/hardwareService/
- Python wrappers: apps/monsterbox4/python_wrappers/
- Python scripts: scripts/ and scripts/hardware/
- README: apps/monsterbox4/README.md

Style
- Keep server code as ES modules; keep client JS ES5
- Prefer small, composable changes with consistent response shapes across part types
- No simulation fallback. Fail fast with clear errors and actionable guidance

