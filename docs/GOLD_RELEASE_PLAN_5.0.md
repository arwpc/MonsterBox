# MonsterBox 5.0 — Gold Release Plan

This document is the single source of truth for producing a "Gold" release of MonsterBox 5.0. It ensures Video, Audio, AI, Motion (Linear Actuators), Parts, Super Powers, and Conversation all work reliably on a Raspberry Pi 4B (Groundbreaker) and in CI.

---

## 1) Objectives
- Ship MonsterBox 5.0 with end-to-end functionality verified on RPi4b hardware and via CI.
- Eliminate HTTP 400/500 regressions across UI and API.
- Lock security baseline (0 known vulnerabilities; Dependabot clear; npm audit clean).
- Provide explicit Deep 200/400/500 coverage and a reproducible release checklist.

---

## 2) Scope
- Subsystems: Video Library (dynamic indexing), **Goblin Video Playback (optimized for smooth looping)**, Audio (PipeWire), AI (STT/TTS/Agents), Motion (Linear Actuators), DC Motors (legacy + BTS7960), Steppers (STEP/DIR/EN), Servos (incl. PCA9685), Parts & Models CRUD, Super Powers (Jaw Animation, Head Tracking), Conversation.
- Platforms: RPi4b + GitHub Actions Linux (Node 18/20/22; Chromium/Firefox where applicable).
- **Goblin Nodes**: Raspberry Pi 3B+ media playback nodes with auto-discovery, remote control, and optimized video playback.

---

## 3) Repository Components (verified)
- Hardware Services: `services/hardwareService/` (dispatch + per-part controllers). Python wrappers under `python_wrappers/` with GPIO backends auto-fallback (lgpio → pigpio → RPi.GPIO).
- Models (global): `data/models/<type>_models.json` with migration from legacy paths. Controllers in `controllers/modelsController.js` and calibration flows.
- Characters: global file `data/characters.json` with character-specific dirs `data/character-<id>/`. Service: `services/characterService.js`. Controller: `controllers/charactersController.js`.
- Stepper: `services/hardwareService/stepper.js` → `python_wrappers/stepper_cli.py`; diagnostics: `python_wrappers/standalone_stepper_test.py`, `python_wrappers/stepper_direct_test.py`; tests present.
- DC Motor: legacy dir+PWM `python_wrappers/motor_cli.py` → `scripts/motor_control.py`; BTS7960 dual-enable `python_wrappers/bts7960_motor_cli.py` → `scripts/bts7960_motor_control.py`.
- Servo/PCA9685: `services/hardwareService/pca9685.js`; Python PCA9685 wrapper import order smbus2-first.
- Video Library: `services/videoLibraryService.js` + UI tests; guide: `tests/VIDEO_LIBRARY_TESTING.md`.
- Super Powers (Jaw): tests orchestrator `test/run-jaw-animation-tests.sh` (unit/api/ui).
- Playwright UI tests: `tests/playwright/` (+ diagnostics in `playwright-diagnostics/`).
- Mocha tests: backend + Python CLI smoke (e.g., `test/pipewire-cli-smoke.test.js`).
- CI: `.github/workflows/deep-functionality-tests.yml`, `.github/workflows/node.js.yml`.
- Security baseline: SECURITY_COMPLETION_REPORT.md (0 vulnerabilities; multer 2.0.2; tar override where needed).

---

## 4) Versioning and 5.0 Text Updates (repo-wide)
Update all 4.0 references to 5.0, and ensure semantic version `5.0.0` where appropriate.

Required updates:
- package.json (root): name/description references “MonsterBox 4.0”; version `4.0.0` → `5.0.0`.
- apps/monsterbox4/package.json: description and version to 5.0.0.
- playwright-diagnostics/package.json (+ package-lock.json if checked in): description and version to 5.0.0.
- README.md: replace remaining “MonsterBox 4.0” sections with “5.0”, keeping historical notes where needed.
- utils/requirements.txt header: “MonsterBox 4.0 Python Dependencies” → “MonsterBox 5.0 Python Dependencies”.
- STEPPER_MOTOR_QUICK_START.md header → 5.0 terminology.
- Other docs mentioning 4.0 (examples: sections about Audio Setup, MJPG‑streamer Integration, Motion Tracking, Testing): update headings and body text to 5.0 where applicable.

Acceptance for this step:
- `git grep -n "MonsterBox 4.0"` returns only historical context lines explicitly marked as legacy.
- package.json versions reflect 5.0.0 in root + subprojects.

---

## 5) Deep 200/400/500 Testing Strategy

### Deep 400 (No HTTP 400 responses)
- Suite: `tests/playwright/no-400s.spec.js` — visits core routes, clicks a few UI controls, asserts zero 400 responses.

### Deep 500 (No HTTP 5xx responses)
- Suite: `tests/playwright/no-errors-deep.spec.js` — captures 5xx during deeper navigation; also records 400s.

### Deep 200 (Explicit success status)
- Action: Add a new Playwright spec (e.g., `tests/playwright/deep-200.spec.js`) that:
  - Calls critical GET/POST endpoints and asserts status 200 and expected JSON shape for:
    - Characters CRUD: `/setup/characters/api/*` (list, get, create, update)
    - Parts Test: `/setup/parts/api/parts/:id/test` with safe params (dry-run endpoints if available)
    - Models CRUD: `/setup/models/api/*`
    - Super Powers (Jaw): `/setup/super-powers/api/jaw-animation/:characterId/*` (read/update/test with noop in CI)
    - Webcam profiler API: `/setup/webcam/api/*` (headers/health endpoints—skip streaming in CI if flaky)
    - Health endpoints (if present)
  - Constraints for CI reliability: workers=1, longer timeouts, optional skips via env.

Acceptance for this step:
- All three suites pass locally and in CI.
- 200 suite logs summary of endpoints and validates JSON keys (not just status).

---

## 6) RPi4b Groundbreaker — Lab Acceptance Test

Prerequisites
- Fresh dependencies installed: `npm ci`, Python deps via `setup-monsterbox.sh` or `scripts/post-install.js`.
- Playwright Firefox installed on Pi (if UI tests run on device): `npm run playwright:browsers:firefox`.
- MJPG‑streamer running (for webcam profiler): `systemctl status mjpg-streamer`, `curl -I http://127.0.0.1:8090/?action=stream`.
- Audio sinks/sources ready: `wpctl status`, sample playback via `pw-play`.
- **Goblin nodes online**: At least one Goblin RPi3B+ with USB videos mounted at `/media/usb/video`.

Steps
1) Unit/CLI tests
   - `npm run -s test:unit`
   - `npx mocha test/pipewire-cli-smoke.test.js --timeout 15000` (validates PipeWire CLI can run)
2) Video Library
   - Add at least one mp4 to `./videos/` (git-ignored)
   - `npm run -s test:video-library` (unit + UI)
3) Motors & Actuators
   - DC Motor (BTS7960 path): Use Parts → Test with small speed (≤60), duration 1–2s
   - Linear Actuator: Use service test with safe duration/limits via UI
4) Stepper
   - UI: Parts → Test (safe `steps` and `stepDelayUs`)
   - Direct GPIO diagnostic: `python3 python_wrappers/standalone_stepper_test.py --step-pin 22 --dir-pin 27 --enable-pin 17 --steps 400 --step-delay-us 800 --direction cw`
5) Super Powers (Jaw)
   - `bash test/run-jaw-animation-tests.sh` (unit/api/ui)
6) Conversation & AI
   - Start server; open `/conversation` and `/ai-settings`; do a simple chat; verify TTS and jaw animation sync
7) Demo Functionality
   - Start server; open `/demo` and `/ai-settings`; do a simple voice chat with audio files for speech; verify TTS and STT and jaw animation sync
8) Calibration
   - All Parts are in a safe position within 20/30% of facing "forward" or "Center"
   - Start server; run calibration for groundbreaker Parts (physically attached)
9) **Goblin Video Playback (GOLD CRITICAL)**
   - Open Video Library page: `/video-library`
   - Verify Goblin selector shows online goblins with video counts
   - Click "Play Now" on any video → should stop current video, fade to black (1s), play new video
   - Verify video loops forever (no manual restart needed)
   - Verify NO text visible on HDMI console (all output redirected to log file)
   - Verify smooth playback (720p60 for performance)
   - Check Activity Log panel shows events (not console)
   - Test scene integration: Create scene with goblin video steps, verify playback
   - **Auto-play test**: Restart goblin, verify first video plays automatically on boot

Acceptance for this step:
- No exceptions in server logs; UI responsive; expected physical motion/audio output observed (where hardware connected).
- No 400/500s reported by “no-errors-deep” suite.
- **Goblin videos play smoothly, loop forever, no console text visible, auto-play on boot works.**

---

## 7) CI, Security, and Dependabot Gates
- CI Workflows:
  - `.github/workflows/node.js.yml` — unit tests + demo E2E
  - `.github/workflows/deep-functionality-tests.yml` — matrix deep suites (Chromium/Firefox; Node 18/20)
- Security:
  - Security validation job runs `npm audit --audit-level=moderate`
  - SECURITY_COMPLETION_REPORT.md shows prior clean state; must remain at 0 vulnerabilities in root and subprojects

Acceptance for this step:
- All required CI jobs green on main.
- `npm audit` clean (root, goblin-system, apps/monsterbox4, playwright-diagnostics).

---

## 8) Deliverables
- Release Notes (MonsterBox 5.0): new features, cleanup, media policy, hardware support, testing coverage summary.
- Gold Verification Report: includes Deep 200/400/500 results (key pages and APIs), lab acceptance results on RPi4b, CI badges, security audit results.
- Updated README.md sections for 5.0 (Feature Index, Supported Boards, Stepper/Motors updates, Super Powers, Video Library usage and tests).

---

## 9) Risk Management & Rollback
- If any suite intermittently fails in CI due to environment:
  - Reduce concurrency (workers=1), increase timeouts, mark optional heavy flows as flaky with retries.
- If hardware actions misbehave in lab:
  - Use minimal durations/speeds; verify wiring (GPIO mapping); fall back to Python diagnostics; check backends availability (lgpio/pigpio/RPi.GPIO).
- Rollback:
  - Use previous passing commit on main; investigate and re-run.

---

## 10) Roles & Delegation
- Test Authoring: finalize Deep 200 spec; maintain Deep 400/500.
- Docs & Versioning: repo-wide 5.0 updates, changelog, release notes.
- Lab Engineer: RPi4b acceptance execution, capture logs/video, confirm physical behavior.
- CI Owner: monitor Actions dashboards, fix flakes, ensure security job clean.

---

## 11) Command Reference (for execution phase)

Local & Lab
```bash
# Install browsers on Pi (Firefox)
npm run playwright:browsers:firefox

# Unit + UI
npm run -s test:unit
npm run -s test:ui || true

# Video Library tests
npm run -s test:video-library

# Jaw Animation full suite
bash test/run-jaw-animation-tests.sh

# Stepper direct diagnostic (GPIO)
python3 python_wrappers/standalone_stepper_test.py \
  --step-pin 22 --dir-pin 27 --enable-pin 17 --steps 400 --step-delay-us 800 --direction cw
```

CI (reference)
```text
- node.js.yml: installs deps, runs unit, minimal E2E
- deep-functionality-tests.yml: starts server, runs deep suites, uploads reports
- security-validation (part of deep workflow): npm audit, secrets scanning in tests
```

---

## 12) Exit Criteria (Gold)
- Version/docs updated to 5.0 across repo.
- Deep 200/400/500 all green locally and in CI.
- RPi4b lab acceptance completed; no 400/500 in flows; physical hardware verified for Motors/Actuators/Steppers/Jaw; Video/Audio stable.
- Security baseline 0 vulnerabilities; Dependabot clear.
- Release notes and Gold verification report published.

