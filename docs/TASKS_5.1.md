# MonsterBox 5.1 Gold — Full Task List

Status marks:
- [x] = Complete
- [/] = In Progress
- [ ] = Not Started

Use this as the single source of tasks. Validate progress with Playwright (Firefox) and keep dev/test on http://127.0.0.1:3100.

## 1) Foundation & Environment
- [x] Set default dev/test port to 3100 across server and tests
- [x] Playwright webServer uses: `MB_TEST_MODE=1 NODE_ENV=test PORT=3100 node server.js`
- [x] Ensure brand shows “MonsterBox 5.1” in unified navigation
- [x] Make console warnings not fail tests (only errors fail) — tests/test.setup.ts
- [x] Update tests using localhost:3000 → 127.0.0.1:3100 (ui + playwright suites)

## 2) Goblin Platform
- [x] Verify video playback loop and settings apply/replay on both goblins
- [x] Persist goblin settings to /home/remote/goblin/config/settings.json
- [x] Implement settings endpoints (GET/POST/apply)
- [x] Generate thumbnails and verify media endpoints

## 3) Super Powers, Characters, and Services
- [x] Fix Super Powers AI chat status endpoint to use characterService.getCharacterById
- [x] characterService.getCharacterById supports IDs as string or number
- [x] MB_TEST_MODE stubs for ElevenLabs/health checks as needed

## 4) Audio Setup (PipeWire/Pulse)
- [x] GET /setup/audio/api/system-config returns test-mode fixture
- [x] POST /setup/audio/api/system-config bypasses system calls in test-mode
- [ ] Ensure other audio GET endpoints used by UI also return test-mode fixtures where needed (no pactl/wpctl shell-outs)

## 5) Parts UI (to satisfy tests)
- [x] Add Create Part button (data-bs-target="#createPartModal") on Setup Parts page
- [x] Add minimal Create Part modal (informational for now)
- [x] Add per-part Test drawer with `open-test-btn` and `quick-test-btn`
- [x] Ensure alert feedback appears after Quick Test

## 6) Stepper Motor — Add/Edit Parity (CRITICAL UX)
- [ ] Add Stepper Motor (Add modal) includes STEP/DIR/EN and all Edit attributes
- [ ] Persist settings across Add → Edit round-trip
- [ ] Add/Update tests for parity and persistence

## 7) Scenes Lifecycle & Queueing
- [ ] Verify per-item lifecycles: run_once, run_for_duration, loop_until_disabled (48h cap)
- [ ] Verify queue modes: sequential, loop_queue
- [ ] Ensure video playback can be a Scene step targeting specific goblins
- [ ] Add smoke tests for scenes with video steps

## 8) Playwright Stabilization — Failing/Flaky Suites
- Conversation/Live unified components
  - [ ] Fix selectors and ensure required elements exist on /conversation and /live
  - [ ] Verify navbar brand shows MonsterBox 5.1
  - [ ] Re-run tests/playwright/conversation-live-unified.spec.js
- Calibration — all parts walkthrough
  - [ ] Seed/adjust parts & models so expected controls are present
  - [ ] Ensure /setup/calibration renders device lists and controls
  - [ ] Re-run tests/playwright/calibration-all-parts.spec.js
- Calibration — webcam controls
  - [ ] Provide test-mode stubs for webcam stream/device probes if missing
  - [ ] Ensure preview and zoom controls do not error in MB_TEST_MODE
  - [ ] Re-run tests/playwright/calibration-webcam-controls.spec.js
- Forms — calibration overrides
  - [ ] Verify create/update flow and persistence
  - [ ] Seed defaults if needed
  - [ ] Re-run tests/playwright/forms-calibration-overrides.spec.js
- Demo — webcam + speech bubble + speak
  - [ ] Ensure test-mode fallback for webcam stream
  - [ ] Validate selectors presence and no console errors
  - [ ] Re-run tests/playwright/demo.spec.js
- Navigation & character persistence
  - [ ] Ensure brand/text expectations 5.1 and menu items exist everywhere
  - [ ] Validate character selection persists across pages
  - [ ] Re-run tests/playwright/navigation-and-character-persistence.spec.js
- AI Settings — STT: VAD + input gain
  - [ ] Ensure endpoints OK in MB_TEST_MODE; toggles persist
  - [ ] Re-run tests/playwright/stt-vad-and-gain.spec.js
- UI quick smoke — AI Settings quick actions (tests/ui)
  - [ ] Ensure no per-test server spawns; rely on Playwright webServer
  - [ ] Align alert expectations with current UI
  - [ ] Re-run tests/ui/ai-settings.spec.js
- Goblin Management — expected buttons
  - [ ] Align markup or relax selectors for expected controls
  - [ ] Re-run tests/playwright/goblin-video-critical.spec.js (buttons test)
- No HTTP 400s policy (remaining)
  - [ ] /setup/audio returns 200 (test-mode fixtures in use)
  - [ ] /setup/webcam returns 200 (test-mode fixtures in use)

## 9) Video Library & Goblin Integration
- [ ] If filenames with colons (:) exist, sanitize/encode when constructing URLs
- [ ] Ensure Video Library cards populate when videos exist (seed or fixture)
- [ ] Validate quick-deploy and playback actions succeed in MB_TEST_MODE

## 10) Harness De-Flake & Consistency
- [x] Console warnings tolerated; errors fail (tests/test.setup.ts)
- [x] BASE_URL unified to http://127.0.0.1:3100 across updated tests
- [ ] Remove any lingering localhost:3000 or inline server spawns from tests

## 11) Release Checklist (Gold)
- [ ] All Playwright tests pass on Firefox; optional Chromium smoke
- [ ] No HTTP 400/500 on core pages in MB_TEST_MODE
- [ ] UI branding shows MonsterBox 5.1 throughout
- [ ] Goblin controls (play/stop/apply) verified on both devices
- [ ] Stepper Motor Add/Edit parity complete; persistence verified
- [ ] Scenes lifecycle and queue modes verified; video steps target goblins
- [ ] Draft release notes and deployment steps committed under docs/release-notes-5.1.md

## 12) Execution Cadence for Next Agent
1. Work items in sections 8–10 in small batches
2. After each batch, run: `npm run test:ui:firefox`
3. Fix the most impactful failures first (No-400s, Conversation/Live, Calibration/Demo)
4. Keep MB_TEST_MODE=1 and PORT=3100; do not spawn duplicate servers inside tests
5. When all green, finish Section 11 and prepare the release notes

