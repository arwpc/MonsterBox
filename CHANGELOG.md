# Changelog

All notable changes to MonsterBox are documented in this file.

## [6.1.5] - 2026-02-18 — Dashboard & Animation Studio Fixes

### Bug Fixes
- **Fixed Parts API response format** — `GET /api/parts` returned raw array instead of `{ success, parts }` wrapper, causing Dashboard hardware panel and Animation Studio part palette to show empty. Both now display correctly.
- **Fixed Dashboard panel drag-and-drop** — Bottom row panels (Monster Features, AI On, Live Audio, etc.) are now in a single sortable column, enabling full drag-to-reorder across all Dashboard panels.
- **Fixed Animation Studio jaw/head-tracking persistence** — Jaw animation and head tracking toggles in the Animation Studio now persist to the server instead of being local-only state. Jaw toggle saves to super-powers.json; head tracking sends start/stop commands.

### Dashboard Scenes Panel Enhancements
- **Scene reorder** — Drag scenes by grip handle to reorder; order persists to scenes.json via new `/scenes/api/reorder` endpoint.
- **Scene delete** — Delete button on each scene row with confirmation dialog.
- **Loop All** — "Loop All" button enqueues all scenes and starts queue in loop mode. "Stop" button to halt the loop.
- **Playing indicator** — Shows "Looping" badge when scene loop is active.

### New Feature: Pose Editor
- **Dedicated Pose Editor page** at `/poses/editor` — full-page interface for creating and editing poses.
- Shows all controllable hardware parts (servos, motors, linear actuators, lights) with type-specific controls: angle sliders for servos, direction/speed/duration for motors and actuators, on/off + brightness for lights.
- **Test individual parts** or **test full pose** (all parts simultaneously).
- **Optional audio** — attach a sound file or TTS text to a pose.
- **Edit existing poses** — click any pose in the saved list or use the edit button in Animation Studio's pose library.
- Added to Activities navigation dropdown alongside Animation Studio.

---

## [6.1.2] - 2026-02-16 — Audio Stack Overhaul

### Critical Bug Fixes
- **Fixed `require()` crash in ES module** — `elevenLabsWebSocketService.js` used CommonJS `require('child_process')` inside an ES module, causing runtime crash when `_filterWavForSTT()` was called. Replaced with proper ES `import { spawn }` at top of file.
- **Fixed duplicate `moveSinkInput`** — `pipewireService.js` had a second definition (using `wpctl set-default` which sets the global default) shadowing the correct first definition (using `wpctl move`). Removed the incorrect duplicate.
- **Fixed PipeWire sink/source listing** — `parseWpctlSinks()` checked `line.includes('Audio') && line.includes('Sinks:')` but wpctl status puts these on separate lines, so the parser never found any sinks and always fell back to placeholder "Default Output"/"PulseAudio Output". Rewrote parser to correctly handle wpctl's tree-drawing format with `│├└─` characters and `*` default markers.

### Audio Configuration Standardization
- **Sample rate**: Standardized to 16000 Hz across `elevenLabsConfigService`, `elevenLabsSTTService` transcription preset, and `microphoneService` format default
- **VAD threshold**: Unified to 0.40 across `characterAudioConfigService`, `serverSTTListener` (was 0.03/0.5 in various places)
- **Microphone format**: Fixed default from `float32` to `pcm_s16le` in `microphoneService` to match actual capture pipeline
- **Playback volume**: Added `DEFAULT_VOLUME = 85` constant in `serverPlaybackService`, replaced all scattered 80/85/90 defaults
- **Speaker device field**: Canonicalized to `config.audioDeviceId` across all data files and services (was `device`, `deviceName`, `outputDevice` in various places)
- **STT format**: Fixed character-3 STT config from `mp3` to `wav`

### VU Meter Unification
- Replaced HTTP polling VU meter on STT page (`fetch('/setup/audio/api/audio-levels')` at 500ms interval spawning Python each time) with WebSocket-driven push (receives `audio_level` messages from existing WS connection)
- Auto-decay timer (800ms) matches Chat page behavior
- Color-coded bars: green (<40%), warning (40-70%), danger (>70%)

### Error Handling Improvements
- **TTS error extraction**: Fixed arraybuffer response parsing — ElevenLabs error details (e.g., "quota_exceeded: You have 1 credits remaining") were lost because `error.response.data.detail` returns undefined on a Buffer. Added `_extractError()` helper to decode Buffer error bodies.
- **Security fix**: Stopped dumping full axios error objects (which include API key in request headers) to console.error. Now only logs the extracted error message.
- **UI error surfacing**: TTS page now shows actual error messages ("quota_exceeded: ...") instead of generic "TTS generation failed (HTTP 401)"

### WebSocket Port Centralization
- Added `data-ws-port="8795"` attribute on `<body>` in `master.ejs`
- Updated 5 client files (`ai-settings.js`, `ai-settings-stt.js`, `websocket-chat.js`, `mic-panel.js`, `orchestration/index.ejs`) to read port from DOM attribute instead of hardcoding

### Data File Updates
- Normalized speaker `config.audioDeviceId` in `data/parts.json` and all `data/character-*/parts.json` files
- Updated `calibration.ejs` edit form to write canonical field names for speakers and microphones

## [6.1.1] - 2026-02-16 — Bootswatch Themes, PIR Sensor Fix, Calibration Refactor

### Bootswatch Theme Gallery
- Added 17 Bootswatch theme CSS files (Bootstrap 5.3.2 replacements) to `public/vendor/bootswatch/`
- Light themes: cerulean, cosmo, flatly, journal, litera, lux, minty, sandstone, united, yeti
- Dark themes: cyborg, darkly, quartz, slate, solar, superhero, vapor
- Visual theme gallery on System page with color swatches, dark/light badges, live preview
- Conditional CSS loading in `master.ejs` — Bootswatch themes replace default Bootstrap CSS
- Theme API (`POST /api/config/theme`) expanded to validate all 19 themes (2 default + 17 Bootswatch)
- Legacy `dark`/`light` values mapped to `default-dark`/`default-light` in both API and templates
- Custom `monsterbox4.css` dark overrides scoped to `html[data-mb-theme="default-dark"]` only

### PIR Motion Sensor Fix
- Fixed `/api/parts/:id/test` route path — was double-nested causing 404 errors
- Parts test endpoint now dispatches by part type using hardware service controllers
- `motion_sensor` parts call `HARDWARE_CONTROLLERS.motion_sensor.read()` and `.detectMotion()`
- Returns `testResult` object matching calibration UI expectations (`motionDetected`, `detections`)
- Parts API made character-aware (reads from `data/character-{id}/parts.json`)
- Servo, light, and linear actuator test dispatchers also added

### Calibration Panel Refactor
- Calibration UI (right panel, simple calibration card, sweep test button) hidden for non-movement parts
- Only shown for `servo`, `linear_actuator`, `motor`, `stepper`
- Center panel expands from `col-xl-6` to `col-xl-9` when calibration is hidden
- Non-movement parts (webcam, microphone, speaker, light, LED, motion_sensor, head_tracking) show controls only

### Testing
- Added system tests for parts API type-aware dispatch (motion sensor read/detect, theme validation)
- Added browser tests for calibration panel visibility based on part type
- **386+ passing** (160 system + 226 unit), 174 browser, 2 pre-existing failures

## [6.1.0] - 2026-02-16 — Animation Studio

### Animation Studio
- **Unified three-panel interface** at `/scenes` replaces separate Scenes list, Scene Editor, and Poses pages
- Left panel: Scene Library (searchable), Pose Library (grouped by category), Queue (full playback controls)
- Center panel: Timeline editor with color-coded step blocks, inline edit forms, SortableJS drag-reorder
- Right panel: Webcam live preview, Part Palette (grouped by type), Action palette for quick step adds
- Toolbar: New Scene, New Pose, Save (Ctrl+S), Play, Stop, Jaw Animation toggle, Head Tracking toggle, Emergency Stop
- Drag-and-drop: palette to timeline, scenes to queue, poses to timeline as steps
- Queue controls: Play, Loop, Pause, Resume, Skip, Clear, Save as Story
- 14 step types with type-specific inline edit forms and color-coded blocks

### New Scene Step Types
- **jaw-animation**: Enable/disable jaw animation sync during scene playback (non-fatal if unconfigured)
- **head-tracking**: Start/stop webcam-based head tracking during scenes (non-fatal if hardware unavailable)
- Both integrated into `sceneExecutor.js` with graceful degradation

### Route Consolidation
- `/scenes` now renders Animation Studio (`views/scenes/studio.ejs`) with full-width layout
- `/setup/poses` redirects to `/scenes` (API endpoints preserved)
- `/poses` HTML requests redirect to `/scenes` (JSON API preserved)
- `/scenes/edit/:id` redirects to `/scenes?edit=id`
- Navigation updated: single "Animation Studio" entry under Activities (replaces Poses + Scenes)

### Testing
- Added 10 new system tests for jaw-animation and head-tracking step types
- Updated 18 browser tests for Animation Studio UI (three-panel layout, toolbar, toggles, redirects, APIs)
- Updated basic test for poses redirect (302 instead of 200)
- **174 passing** (browser + system + unit), 7 skipped, 2 pre-existing failures

## [6.0.0] - 2026-02-14 — Character Independence & Dynamic Versioning

### Character Independence
- Removed all hardcoded character names (Orlok, PumpkinHead, Skulltalker, Coffin Breaker) from services, controllers, routes
- Removed all numeric ID defaults (`|| 1`, `|| 3`, `|| 4`) — missing characterId now returns 400 errors
- Generalized ElevenLabs agent template (removed Orlok-specific template)
- Removed character-name comments from quick response agent ID keys
- Cleaned up character-specific comments in STT, jaw animation, and filter presets

### Dynamic Versioning
- All version displays now sourced from `package.json` (single source of truth)
- Server health endpoint uses `pkg.version` instead of hardcoded string
- EJS templates use `res.locals.appVersion` middleware for dynamic version in titles, footers, and navigation
- Server startup log includes dynamic version
- Removed hardcoded "5.5" from all JS services, routes, public scripts, shell scripts, and install tooling

### AI Service Audit
- Audited TTS, STT, and AI implementations for duplication
- Confirmed single canonical TTS service (`elevenLabsTTSService.js`)
- Confirmed three distinct STT approaches (batch, polling, WebSocket) — no consolidation needed
- No duplicate AI service code found

### Documentation
- Updated README.md with v6.0.0 release notes
- Updated CHANGELOG.md with v6.0.0 entry
- Created `docs/v6-phase1-checklist.md`, `docs/v6-phase2-ai-audit.md`, `docs/v6-deferred.md`

### Test Results
- 140 passing, 1 failing (pre-existing jaw-animation hardware timeout), 7 skipped

## [5.5.2] - 2026-02-12 — Jaw Animation Sync Fix

### Jaw Animation
- **ChatterPi-inspired sync fix**: Restructured `driveJawFromAudioBuffer()` to compute angle synchronously in each audio frame — eliminates async gap that caused polling to read stale/zero angles
- Preload config, parts, and guardrails once before frame loop (no per-frame async lookups)
- Fire-and-forget servo commands (non-blocking, like ChatterPi's `self.jaw.angle = jawTarget`)
- Attack/release envelope ramp limiting in `calculateJawAngle()` for natural jaw motion
- Tuned default parameters: sensitivity=4, smoothing=0.2, attackTime=30, releaseTime=80
- Fixed double-nested `super-powers.json` bug (`jawAnimation.jawAnimation.{...}` → `jawAnimation.{...}`)
- Added `simulateJawDrive()` for test mode operation without hardware
- Improved audio level meter scaling (audio: ×400, jaw: sqrt curve)
- Added cache-busting to client JS (`?v=<%= Date.now() %>`)

### Documentation
- Added Jaw Animation section to README with algorithm description, config table, and API examples
- Updated CHANGELOG with v5.5.2 release notes

## [5.5.1] - 2026-02-07 — Gold Release

### ElevenLabs AI Overhaul
- Upgraded TTS default to `eleven_flash_v2_5` (~75ms latency) across all services
- Upgraded STT default to `scribe_v2` for batch transcription
- Created `scribe_v2_realtime` WebSocket STT service (~150ms streaming latency)
- Implemented per-character TTS config via `getTTSConfigForCharacter(characterId)` in `aiConfigStore.js`
- Each character stores voice/model settings in `data/character-{N}/ai-config/tts-config.json`
- Replaced HTTP loopback calls with direct `elevenLabsTTSService` + `serverPlaybackService` calls
- Scene "Ask AI" steps now use real ElevenLabs Conversational AI agents
- Removed all legacy model aliases (`scribe_v1`, `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1`)

### Dashboard Consolidation
- `/conversation` route now redirects to `/` — conversation IS the dashboard
- Jaw Animation moved to dedicated page at `/setup/jaw-animation`
- Simplified navigation: Dashboard, Live, Setup subpages

### Test Fixes
- Fixed `conversation.spec.js` to navigate to `/` instead of `/conversation`
- Fixed `conversation-refactor.spec.js` to expect "Dashboard" heading
- Fixed `jaw-animation.spec.js` to enable jaw toggle before slider interaction tests
- Fixed `setup-parts.spec.js` to check DOM-attached elements instead of visibility
- Fixed `test-hardware-fix.js` broken import path

### Documentation
- Complete README rewrite with gold release notes and test results table
- Created CHANGELOG.md (this file)
- Rewrote all AI/ElevenLabs documentation (5 doc files)
- Updated test documentation (3 files)
- Removed legacy model options from TTS UI dropdown
- Removed legacy STT compatibility code from `elevenLabsSTTService.js`
- Archived outdated STT format report
- Updated all version references from 5.0/5.2 → 5.5
- Updated SESSION_PROMPT.md with current architecture
- Archived stale v5.4.0 QUICK_START_NEXT_AGENT.md

### Test Results (257 total)
- **Mocha**: 148 passing, 34 pending, 6 failing (jaw calibration — hardware-environment-dependent)
- **Playwright**: 109 passing, 7 skipped (deprecated), 0 failing
- Stepper motors verified via real GPIO (lgpio backend)
- All ElevenLabs service tests passing
- All scene execution tests passing

## [5.5.0] - 2025-12-15

### Major Features
- Models system: reusable default configurations per part type
- Calibration UI redesign with Model/Overrides tab
- ContinuousServoAdapter for head-on-swivel servos
- Comprehensive Playwright deep testing framework (8 test suites)
- Orchestration hardening with per-animatronic and global timeouts

### Hardware
- Linear actuator calibration with min/max positioning
- BTS7960 H-bridge motor driver support
- Power toggle integration for hardware safety
- Stepper motor support via Python CLI wrapper

### Goblin Video System
- MPV-based video playback for Pi 3B+/4B display units
- Queue management with loop modes
- REST API for remote control and immediate playback
- Playlist CRUD and distribution (Facehugger deployment)
- MonsterBox Step integration for video triggers

### Infrastructure
- GitHub Actions CI/CD for automated testing
- Dedicated test port (3123) for CI isolation
- MB_TEST_MODE environment flag for safe testing
- PipeWire/WirePlumber audio system (replaced ALSA/PulseAudio)

## [5.4.0] - 2025-10-20

### Features
- Goblin system standardization
- Console blanker for kiosk display
- Video dropdown in Goblin management UI
- Multi-animatronic deployment tooling

## [5.3.0] - 2025-09-15

### Features
- Conversation mode with AI chat interface
- Webcam streaming via mjpg-streamer
- Scene orchestration engine
- Pose management system

## [5.2.0] - 2025-08-01

### Features
- Initial ElevenLabs TTS/STT integration
- Noisy environment STT presets
- Groundbreaker character setup
- Audio library management

## [5.0.0] - 2025-06-01

### Initial Release
- Single-node animatronic control system for Raspberry Pi 4B
- Express/EJS web application
- Hardware service layer for servos, motors, LEDs, sensors
- Character and parts CRUD
- Basic GPIO control via pigpio
