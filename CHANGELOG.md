# Changelog

All notable changes to MonsterBox are documented in this file.

## [7.8.0] - 2026-03-27 — Lurk Mode Motion Sensor & Actuator Position Persistence

### Install Script & Dependency Cleanup
- **Removed unused dependencies** — `puppeteer` (~400MB with Chromium) and `claude` removed from package.json; neither was imported anywhere in the codebase
- **Moved puppeteer to devDependencies** then removed entirely — E2E tests use Playwright, not Puppeteer
- **install.sh modernized for fresh RPi4B deployment:**
  - Bookworm boot config path detection (`/boot/firmware/config.txt` vs `/boot/config.txt`)
  - Added missing Python packages: `python3-lgpio`, `python3-smbus2` (required by hardware wrappers)
  - Idempotent `/etc/modules` entries (no duplicates on re-run)
  - Auto-generates self-signed SSL certificates (HTTPS required for browser microphone access)
  - Runs `npm ci` automatically during install
  - Creates `monsterbox.service` systemd unit with security hardening
  - Scaffolds new character data files (parts.json, poses.json, scenes.json, super-powers.json)
  - Consistent step numbering and working directory management
  - Explicit `--input-type=commonjs` for inline Node.js script (ESM-safe)

### Linear Actuator Position Persistence & Bounds Enforcement
- **Persistent position tracking** — Actuator positions now survive server restarts via `data/actuator-positions.json` (atomic writes for SD card safety)
- **Crash recovery** — If the server crashes mid-move, the position is marked "unknown" on next startup; homing is recommended before further use
- **Bounds enforced everywhere** — Calibration min/max (minP/maxP) now enforced in: calibration nudge, scene executor (raw direction steps), and pose engine (distance-based moves)
- **Scene executor bounds clamping** — Raw `extend`/`retract` scene steps are now duration-clamped so the actuator cannot exceed calibrated limits
- **Pose engine bounds awareness** — `prepareActuatorCommand()` now loads calibration profiles and clamps movement to safe range
- **Position survives adapter cache flush** — Changing invert, deleting profile, or learning motion model no longer resets position to 0.5
- **Emergency stop marks position unknown** — `POST /calibration/:partId/stop` properly flags open-loop position as uncertain
- **Homing sets high-confidence position** — `POST /calibration/:partId/home` persists `confidence: 'homed'` state
- **Graceful shutdown persists all positions** — Shutdown handler saves `cleanShutdown: true` before PID release
- **Position API enhanced** — `GET /calibration/:partId/position` now returns `positionKnown` and `confidence` for open-loop parts

### Lurk Mode Motion Sensor Integration
- **Motion sensor (PIR) monitoring** — While Lurk mode is active, the character's motion sensor is polled every second. Movement resets the inactivity timer, keeping the animatronic alive.
- **Inactivity timeout** — After 5 minutes of no motion or activity (speech, chat), Lurk mode enters a "sleep" state: superpowers (jaw, head tracking, idle, AI) are disabled, but the motion sensor keeps watching.
- **Wake on motion** — When the PIR detects movement while sleeping, Lurk mode fully re-activates all superpowers, as if first toggled on. The animatronic springs back to life.
- **Activity tracking** — Speech (Make Character Say) and chat messages reset the inactivity timer without requiring physical motion.
- **Graceful degradation** — Characters without a motion sensor skip the watcher (no errors). Characters missing a jaw servo, head servo, or webcam get those badges grayed out in the UI.

### Dashboard UI Improvements
- **Motion badge** — New "Motion" badge in the Lurk bar shows motion sensor status
- **Capability detection** — Badges for unavailable features (jaw, head, motion) are grayed out with strikethrough for characters that lack the required hardware
- **Sleep state UI** — Lurk bar dims with a slow breathing animation when sleeping, status shows "Sleeping — Waiting for motion..."
- **Larger fonts** — Lurk bar label, badges, and status text increased for readability

### New API Endpoints
- `GET /conversation/api/lurk-mode/capabilities` — Returns which lurk features the current character supports
- `GET /conversation/api/lurk-mode/motion-status` — Motion watcher state (for dashboard polling)
- `POST /conversation/api/lurk-mode/activity` — Notify the watcher that speech/chat occurred (resets timer)

### Files Changed
- `services/lurkMotionWatcherService.js` — New service: PIR polling, inactivity timeout, sleep/wake callbacks
- `routes/conversation.js` — Refactored lurk mode into helpers, integrated motion watcher, added 3 new endpoints
- `views/conversation/index.ejs` — Motion badge, capability detection, sleep/wake polling, activity notifications
- `public/css/lurk-mode.css` — Sleep animation, unavailable badge style, larger fonts

### Dependency Updates
- `music-metadata` 11.9.0 → 11.12.3
- `file-type` 21.0.0 → 21.3.2
- `multer` 2.1.0 → 2.1.1
- `picomatch` 2.3.1 → 2.3.2
- `brace-expansion` security fix
- `path-to-regexp`, `serialize-javascript` — npm audit fixes (0 vulnerabilities)

---

## [7.7.0] - 2026-03-23 — Movement System & Resource Management

### Lifelike Movement System
- 50Hz smooth servo transitions with velocity-based easing
- Priority-based servo claims (Scene > Head > Jaw > Idle > Micro)
- Idle loop service with weighted random pose selection
- Movement telemetry with 30-day rolling history

### Resource Management
- PID lock prevents dual-instance GPIO conflicts
- Process priority elevation, memory monitor, startup health checks
- Graceful ordered shutdown sequence

---

## [7.5.0] - 2026-03-22 — Scene Audio Blocking Fix

### Scene Audio Playback Fix
- **TTS/AskAI steps now block until audio finishes** — `executeSayThisStep` and `executeAskAIStep` were using `playBufferOnCharacterSpeaker()` which writes to a persistent mpg123 stream and returns immediately after the write, letting the next scene step start before audio finished. Switched to `playAIOnCharacterSpeaker()` which spawns a one-shot player process and awaits its exit.
- **Concurrent flag works correctly** — when "play with next step" is checked, audio fires in the background via the scene executor's fire-and-forget model; when unchecked, the scene now properly waits for audio to complete before advancing.
- Affects step types: `sayThis` (TTS), `askAI` (AI response + TTS)
- `audio` steps (file playback) were already correct — they use `speaker_cli.py` which blocks until done
- `playWithJawSync` path was already correct — jaw timeline blocks for the audio duration

### Files Changed
- `services/scenes/sceneExecutor.js` — switched non-jaw-sync TTS playback from streaming to one-shot player

---

## [7.5.0] - 2026-03-15 — ElevenLabs v3 TTS & Character Renames

### ElevenLabs v3 TTS Upgrade
- **Default TTS model upgraded** from `eleven_flash_v2_5` to `eleven_v3` (most expressive, supports audio tags)
- **Audio tags supported**: `[breathes heavily]`, `[whispers]`, `[hisses]`, `[slow]`, `[dramatically]`, `[exhales]` — used sparingly for dramatic animatronic speech
- **Pause mechanics via punctuation**: dashes (—) for reliable pauses, ellipses (...) for weight/hesitation, commas for breath
- **v3-aware voice_settings**: service layer conditionally omits `style` and `use_speaker_boost` params (not supported by v3)
- **TTS Settings UI**: `eleven_v3` shown as first option, info note when v3 selected about unsupported params
- **All per-character TTS configs** updated to `eleven_v3`, removed unsupported params
- **Agent template overhauled**: prompts now encourage audio tags and pause mechanics (previously forbidden)
- **Quick fallback responses** updated with dramatic punctuation and audio tags for all characters
- **LLM model list updated**: Claude Sonnet 4.6, Gemini 2.0 Flash

### Character Renames
- **Coffin Breaker → Mina** (Character 2) — renamed across entire codebase (47 files)
- **Skulltalker → Sir Dragomir** (Character 4) — renamed across entire codebase
- Updated: characters.json, animatronics.json, character service, test fixtures, client JS, all deployment/utility scripts, and all documentation
- **PumpkinHead agent ID fixed** — was incorrectly set to Groundbreaker's agent
- Part names updated: Speaker Sir Dragomir, Sir Dragomir Cam/Mic
- Hostnames: coffinbreaker → mina, skulltalker → sirdragomir
- Doc files renamed: character_coffin_breaker.md → character_mina.md, character_skulltalker.md → character_sir_dragomir.md

### Documentation
- All docs updated to reflect `eleven_v3` as default TTS model
- CLAUDE.md version reference made dynamic (removed stale hardcoded version)
- README, CHANGELOG, memory files updated for character renames and TTS upgrade

## [7.3.0] - 2026-03-15 — Audio Reliability Overhaul

### Audio Output Fixes
- **MP3/pw-play mismatch fixed** — `playAIOnCharacterSpeaker()` was piping MP3 data to `pw-play` which only accepts WAV/PCM. Now MP3 content routes exclusively through `mpg123`, and `pw-play` is only used for WAV/PCM audio. This was the root cause of TTS dying unpredictably.
- **Persistent stream no longer killed** — AI playback previously called `stopStream()` which killed the persistent `mpg123` stream, creating gaps in subsequent playback. Removed this — AI speech uses its own one-shot player instead.
- **Removed pre-playback audio stop** — `speaker_cli.py stop` was called before every AI playback, unnecessarily cutting off any in-progress audio.

### Audio Library Fix
- **Startup race condition fixed** — `loadLibrary()` and `getAudioFiles()` now await the init promise. Previously, requests arriving before the initial file rescan completed would see an empty library.

### Microphone Stability
- **Source resolution caching** — `captureChunkWav()` now caches the resolved PipeWire source ID for 60 seconds instead of shelling out to `wpctl status` on every 0.3s capture chunk. Reduces system overhead and eliminates intermittent resolution failures.

### Audio Loop Fix
- **EPIPE crash prevention** — Moved `pwplay.stdin` error handler registration before the `ffmpeg.stdout.pipe()` call, preventing crashes when audio devices disconnect during looped playback.

### Hardware Safety Documentation
- **12V bus fuse protection** — Documented that linear actuators and large 12V servos are wired into a 12V power bus protected by intentionally undersized 5V fuses (safety-first design). Updated in hardware docs, wiring guide, and calibration guide.

### Audio Library Redesign
- **Table-based file manager** — replaced grid of tiny unreadable cards with a clean sortable table showing all files immediately
- **Inline controls** — play/stop toggle, loop, favorite, edit, download, delete on every row
- **Now Playing indicator** — highlights active row, shows title in banner
- **Compact toolbar** — stats badges, search, category filter, sort dropdown in single row
- **ES5 IIFE rewrite** — client JS converted from ES6 class to proper ES5 IIFE pattern

### System Volume Control
- **Volume slider** in System > Settings tab — first accordion item, range 0-100%
- **API endpoints** — `GET/PUT /api/system/volume` using `wpctl set-volume @DEFAULT_AUDIO_SINK@`
- **Default 90%** — set on deployment

### Files Changed
- `services/serverPlaybackService.js` — Content-type-aware player selection, removed stream-killing before AI playback
- `services/audioLibraryService.js` — Init-await guard on `loadLibrary()` and `getAudioFiles()`
- `services/serverSTTListener.js` — Source resolution cache with 60s TTL
- `services/audioLoopService.js` — Error handler ordering fix for EPIPE prevention
- `docs/hardware/ORLOK_BTS7960_WIRING.md` — 12V bus fuse safety note
- `docs/hardware/index.md` — Power management section updated
- `docs/setup/LINEAR_ACTUATOR_CALIBRATION.md` — Fuse protection safety feature
- `views/audio-library/index.ejs` — Complete rewrite: table-based file manager
- `public/js/audio-library.js` — Complete rewrite: ES5 IIFE with table rendering
- `routes/api/systemRoutes.js` — Volume get/set endpoints
- `views/setup/system.ejs` — Volume slider in Settings tab
- `tests/browser/audio-library.spec.js` — 15 tests updated for table-based UI
- `tests/browser/actual-usage-testing.spec.js` — Updated audio library tests

### Testing
- **631 tests passing** (278 system + 85 unit + 268 browser), 0 failing

---

## [7.0.0] - 2026-03-05 — Major Release

MonsterBox 7.0 consolidates all v6.x features into a polished, production-ready platform. This release includes head tracking with face/hand detection, click-to-track, audio improvements, scene concurrency, and comprehensive documentation and test coverage.

### Head Tracking & Motion Detection
- **Head Tracking Setup Page** (`/setup/head-animation`) — full OpenCV-based motion tracking with servo mapping, live webcam overlay, hot-parameter tuning, and test sweep
- **Face & Hand Detection** — Haar cascade face detection and HSV skin-color hand detection modes, hot-switchable via stdin without restarting Python
- **Click-to-Track** — Click on webcam to manually set tracking target for 30 seconds with countdown overlay and auto-disable
- **Head Tracking Presets CRUD** — Save/load/delete custom tuning presets via API; built-in presets (Person, Noisy, Sensitive) protected from deletion
- **Dashboard Integration** — Status badge (Active/Searching/Off), toast notifications on toggle, 1-second status polling, enhanced status API with live tracking data

### Audio & Microphone
- **Faster VU Meter** — Reduced STT capture chunks from 2s to 0.3s, cached capture method for 5 minutes, 3x browser VU gain boost
- **Echo Suppression Everywhere** — Added mic suppression to `playBufferOnCharacterSpeaker()`, `playAIOnCharacterSpeaker()`, and `playWithJawSync()`; increased ConvAI tail buffer from 1500ms to 2500ms
- **Scene Concurrency** — Replaced pair-based concurrent grouping with fire-and-forget model; multiple consecutive concurrent steps now all fire in parallel

### Dashboard & UI
- **Bootstrap Tooltips** — Descriptive hover help on all Monster Features toggles (Jaw, Parrot, Translate, Head Tracking, Mute)

### Documentation
- **Audio & Microphone Setup** — New guide covering capture methods, VU meter, troubleshooting
- **Echo Suppression** — New guide explaining how suppression works and tuning tips
- **Scene Concurrency** — New guide explaining fire-and-forget model with examples

### Testing
- Comprehensive Playwright and system tests for all new v7.0 features
- Full test suite passing (system + unit + browser)

---

## [6.8.0] - 2026-03-01 — Comprehensive Bug Fix & Feature Update

### Microphone & VU Meter
- **Faster capture:** Reduced STT capture chunks from 2.0s to 0.3s for responsive VU meter and precise echo suppression timing
- **Capture method caching:** Cache working capture method (Python/ffmpeg/arecord/parec) for 5 minutes to avoid fallback chain overhead
- **VU meter boost:** 3x gain multiplier on browser-side VU meter for visible response to speech
- **Device validation:** Quick open/close test in `microphone_cli.py` before recording

### AI Echo Suppression
- **All playback paths:** Added mic suppression to `playBufferOnCharacterSpeaker()`, `playAIOnCharacterSpeaker()`, and `playWithJawSync()`
- **Increased tail buffer:** ConvAI tail buffer increased from 1500ms to 2500ms for room reverb tolerance
- **Duration estimation:** MP3 (~128kbps) and WAV (PCM16LE) buffer size used to estimate playback duration

### Scene Concurrent Execution
- **Fire-and-forget model:** Replaced pair-based concurrent grouping with true fire-and-forget — steps with `concurrent: true` fire off immediately without blocking
- **Multiple concurrent steps:** Multiple consecutive concurrent steps now all fire in parallel (not limited to pairs)
- **Backward compatible:** Old pair behavior is a subset of the new model

### Head Tracking Dashboard Integration
- **Status badge:** Active/Searching/Off badge next to Head Tracking toggle
- **Status polling:** 1-second polling when tracking is enabled
- **Toast notifications:** Success/error feedback on toggle with auto-revert on failure
- **Enhanced status API:** Now includes live tracking data (target position, FPS, pan angle)

### Face & Hand Detection
- **Detection modes:** motion, face, face+hands, all — configurable per character
- **Haar cascade face detection:** `cv2.CascadeClassifier` with `detectMultiScale(scaleFactor=1.1, minNeighbors=5)`
- **HSV skin-color hand detection:** Fallback hand detection using HSV color segmentation
- **Hot-update:** Detection mode can be changed via stdin without restarting Python process
- **Setup page dropdown:** Detection mode selector added to head-animation setup page

### Click-to-Track
- **Manual target selection:** Click on webcam to set a tracking target for 30 seconds
- **Countdown overlay:** Badge showing seconds remaining on webcam card
- **API endpoints:** Dashboard and setup page both support manual target via POST
- **Python integration:** `set_manual_target` stdin command prefers detection closest to click position

### Head Tracking Presets CRUD
- **Server-side presets:** Built-in (Person, Noisy, Sensitive) + custom presets stored in super-powers.json
- **API endpoints:** GET/POST/DELETE for preset management
- **Save current as preset:** Button to save current tuning parameters as named preset
- **Delete protection:** Built-in presets cannot be deleted

### Dashboard Tooltips
- **Bootstrap tooltips:** Added to all Monster Features toggles (Jaw, Parrot, Translate, Head Tracking, Mute)
- **Descriptive help text:** Each toggle explains its function on hover

### Documentation
- **Audio & Microphone Setup:** New guide covering capture methods, VU meter, troubleshooting
- **Echo Suppression:** New guide explaining how echo suppression works and tuning tips
- **Scene Concurrency:** New guide explaining fire-and-forget model with examples

---

## [6.8.0] - 2026-02-28 — Head Tracking Setup Page

### Head Animation Setup (`/setup/head-animation`)
- **New setup page** for configuring OpenCV-based motion tracking with servo head mapping
- **OpenCV motion detection** — background subtraction with configurable threshold, contour area filtering, and noise reduction kernel size
- **Servo mapping** — maps detected motion centroid to pan servo position with configurable center degree, range, deadzone, and smoothing
- **Positional and continuous servo support** — works with both absolute position servos and continuous rotation servos
- **Calibration guardrails** — respects servo Min/Max calibration markers to prevent over-rotation
- **Live webcam overlay** — real-time motion tracking visualization on webcam stream
- **Hot-parameter tuning** — adjust motion threshold, contour area, background learning rate, smoothing, and deadzone without restarting tracking
- **Test sweep** — sweep servo through full range to verify wiring and calibration
- **Config persistence** — saved per-character in `super-powers.json` `headTracking` section

### Service Layer Fixes
- **Character independence** — `getCharacterDataDir()` and `loadPartsSafe()` in head animation service always resolve per-character paths, never relying on global dataPath
- **Cleaned up debug emoji logs** in motion tracking controller

### API Endpoints
- `GET /setup/head-animation/api/head-tracking/:charId` — read config + available servos/webcams
- `POST /setup/head-animation/api/head-tracking/:charId` — save config
- `GET /setup/head-animation/api/head-tracking/:charId/status` — tracking status
- `POST /setup/head-animation/api/head-tracking/:charId/start` — start tracking
- `POST /setup/head-animation/api/head-tracking/:charId/stop` — stop tracking
- `POST /setup/head-animation/api/head-tracking/:charId/params` — hot-update parameters
- `GET /setup/head-animation/api/head-tracking/:charId/requirements` — check OpenCV/webcam availability
- `POST /setup/head-animation/api/head-tracking/:charId/test-sweep` — servo sweep test

### Key Files
- `views/setup/head-animation.ejs` — Setup page with two-column layout (config + webcam)
- `public/js/head-animation.js` — Client-side controls (ES5 IIFE, 653 lines)
- `routes/setup/head-animation.js` — API routes (9 endpoints)
- `services/headAnimationSuperPowerService.js` — Config persistence service
- `controllers/motionTrackingController.js` — Extended with webcam-specific tracking functions

### Testing
- 21 new system tests for head animation API and config persistence
- Navigation updated with Head Animation link under Setup

---

## [6.7.8] - 2026-02-28 — Browser Audio Bridge, Security Update & CI Fixes

### Browser Audio Bridge
- **Browser Audio Bridge** added to Dashboard, `/ai-settings/stt`, and `/setup/audio` pages — harmonized across all three
- **VU meter fixes** — resolved meters stuck at 60% on audio setup page
- **Triple-firing buttons fixed** on `/setup/audio` page
- **Save config and test input fixes** on `/setup/audio`

### Security
- **Multer 2.0.2 → 2.1.0** — fixes DoS vulnerabilities in file upload middleware

### Calibration
- **Webcam theme fix** — calibration webcam overlay now respects selected theme
- **IR mode error fix** — resolved error when toggling IR mode
- **Dynamic webcam controls** — live control adjustments on calibration page

### CI/CD
- **All CI workflows fixed** — server startup and MB_TEST_MODE configuration corrected
- **Remaining browser test failures resolved** — stable green CI pipelines

### Testing
- Comprehensive Playwright tests for `/setup/audio` page
- Browser test fixes for CI environment

---

## [6.7.7] - 2026-02-28 — MkDocs Overhaul & Calibration Enhancements

### MkDocs Documentation
- **Halloween dark theme** with slate scheme and custom CSS
- **Core docs rewritten** — index, install, usage, config, structure, FAQ, networking
- **Replaced fabricated content** — removed inaccurate API/auth/RBAC docs, replaced with accurate content
- **Character pages updated** — all parts listed from actual JSON data (Orlok, PumpkinHead, Mina, Sir Dragomir, Groundbreaker, Spinster)
- **Nav structure finalized** — 40+ docs in navigation, Help link added to MonsterBox navbar

### Calibration
- **Dynamic webcam controls** — live camera control adjustments
- **Night mode** for webcam overlay
- **Linear actuator position slider** improvements
- **Bounds fixes** for calibration markers

---

## [6.7.6] - 2026-02-28 — Consistency Audit, CI Fixes, MkDocs & Help Link

### Consistency Audit (v6.7.1–v6.7.3)
- **Removed deprecated HTTP conversation endpoints** — Three 410 "Gone" tombstone routes (`/conversation/test`, `/conversation`, `/conversation/play`) removed from `elevenLabsApiRoutes.js`. Deleted the test file (`conversation-route.test.js`) and utility script (`simulate-conv.js`) that only targeted these dead endpoints.
- **Removed orphaned character-audio config subsystem** — Deleted `characterAudioConfigService.js`, `microphoneService.js`, and `routes/setup/characterAudio.js`. These had zero consumers (no UI, no tests, no service-to-service imports). Canonical configs remain in `aiConfigStore` (STT/TTS) and `jawAnimationSuperPowerService` (jaw).
- **Documented character ID access patterns** — Added note to `CLAUDE.md` documenting three patterns for accessing the current character ID, with `req.app.locals.config.selectedCharacter` (Pattern B) as preferred for new routes.

### CI Fixes (v6.7.4–v6.7.6)
- **Added ffmpeg to all GitHub Actions workflows** — All four CI pipelines (`ci.yml`, `node.js.yml`, `ssh-deploy.yml`, `deep-functionality-tests.yml`) now install ffmpeg, fixing the Jaw Pre-Analysis Engine test failures (`spawn ffmpeg ENOENT`).
- **Fixed jaw animation test-tts assertion** — Changed `!== null` to `!= null` guard so the test handles both `null` and `undefined` timeline responses in CI.
- **Skip hardware-dependent browser tests in CI** — `relay-toggle.spec.js` and `webcam-capture.spec.js` now auto-skip when `MB_TEST_MODE` is set, since they require Orlok hardware (char_id=3) not available in CI.
- **All 5 GitHub Actions pipelines now pass green.**

### Documentation & Help (v6.7.7)
- **MkDocs nav expanded** — Added 40+ previously unlisted documentation files to the MkDocs navigation, including character sheets, setup guides, hardware docs, integration guides, API reference, development docs, troubleshooting, and release notes.
- **Help link in navigation** — Added a Help link (question-circle icon) to the MonsterBox navbar that opens the GitHub Pages documentation site.
- **Testing docs updated** — Refreshed test file structure, counts, and CI notes to reflect current state (v6.7.6).

---

## [6.7.0] - 2026-02-28 — Jaw Animation CRUD, Calibration Unification, Audio, and System Fixes

### Jaw Animation Multi-Config CRUD
- **Multiple named jaw configs per character** — Each character can now save, load, rename, and delete multiple jaw animation configurations. The active config selector appears at the top of the Jaw Animation setup page.
- **Auto-migration** — Existing single-config `super-powers.json` files are automatically migrated to the new `configs[]` array format on first read. The existing config becomes "Default".
- **Backward-compatible API** — The existing `GET /api/jaw-animation/:charId` and `POST /api/jaw-animation/:charId` endpoints continue to work unchanged. `readJawConfig()` returns a flat config for all consumers.
- **New CRUD endpoints:**
  - `GET /api/jaw-animation/:charId/configs` — list all configs
  - `POST /api/jaw-animation/:charId/configs` — create new config (with optional clone)
  - `PUT /api/jaw-animation/:charId/configs/:configId` — update config
  - `DELETE /api/jaw-animation/:charId/configs/:configId` — delete config (cannot delete active)
  - `POST /api/jaw-animation/:charId/configs/:configId/activate` — switch active config
  - `POST /api/jaw-animation/:charId/configs/:configId/rename` — rename config
- **UI controls** — Config selector dropdown, "Save As New", "Rename", and "Delete" buttons added to the jaw animation page.

---

## [6.7.0] - 2026-02-28 — Calibration Unification, Jaw Animation, Audio, and System Fixes

### Calibration Angle Unification
- **Absolute servos now use angle (0-180°)** instead of normalized 0-1 across the entire calibration system. The calibration page, API, profiles, sweep test, and scene executor all use angle for absolute servos. Other part types (linear actuators, continuous servos) retain normalized 0-1.
- **Calibration profiles migrated** — Absolute servo bounds now stored as `minAngle`/`maxAngle` (degrees) instead of `minP`/`maxP` (normalized). Backward-compatible: `p`-based API still accepted.
- **Calibration UI updated** — Absolute servo slider shows 0-180° with degree symbol. Position display shows angle degrees. Bounds display shows angle with ° suffix.
- **Scene executor updated** — Preset resolution (`__MIN__`, `__MAX__`) reads angle bounds for absolute servos.

### Jaw Animation Fixes
- **Dashboard/Chat jaw sync** — Fixed jaw animation not working in Dashboard/Chat by pre-warming the servo daemon when jaw config is read. Previously, daemon startup lag caused frames to fall back to slow hardwareService path (~580ms per command vs <1ms daemon).
- **Ask AI fallback now jaw-synced** — The TTS fallback path in Ask AI now uses `playWithJawSync()` when jaw animation is enabled (previously used plain audio playback with no jaw movement).
- **Daemon error logging** — `playWithJawSync()` now logs a warning when the daemon fails to start instead of silently swallowing the error.

### Audio Configuration Fix
- **Microphone test 500 fix** — The `POST /setup/audio/api/test-system` endpoint for microphone testing now includes device fallback logic (tries 'default' and 'pulse' if the selected device fails) and returns JSON `success: false` instead of HTTP 500 on errors.

### Scenes Page Fix
- **Character selection** — The Scenes page (Animation Studio) now correctly loads the currently selected character instead of defaulting to PumpkinHead. Fixed by passing `currentCharacter` and `config` to content templates in the `renderWithLayout` helper.

### Log Cleanup System
- **Automatic log cleanup** — New `scripts/log-cleanup.sh` with systemd timer runs daily to prevent logs from using more than 40% of disk space. Vacuums journald to 500MB, cleans rotated logs, test artifacts, and apt cache.
- **Journald limits** — Set `SystemMaxUse=2G` and `MaxRetentionSec=30day` via journald.conf.d drop-in.
- **Initial cleanup freed ~2GB** of journal logs.

### Files Changed
- `server/calibration/adapters/AbsoluteServoAdapter.js` — Rewritten: works in angle space, `gotoAngle()` primary method, backward-compat `gotoNormalized()`
- `server/calibration/router.js` — Type-aware API: absolute servos accept/return angle, others use normalized. New `isAbsoluteServo()`, `angleToP()`, `pToAngle()` helpers
- `views/setup/calibration.ejs` — Angle-based UI for absolute servos: 0-180° slider, degree display, sweep test with angle
- `data/calibration_profiles.json` — Migrated absolute servo bounds from `minP`/`maxP` to `minAngle`/`maxAngle`
- `services/scenes/sceneExecutor.js` — `resolvePresetToAngle()` reads angle bounds for absolute servos
- `services/jawAnimationSuperPowerService.js` — Pre-warms daemon on config read, improved daemon error logging
- `routes/conversation.js` — Ask AI fallback TTS uses jaw sync
- `routes/setup/audio.js` — Microphone test with fallback, no more HTTP 500
- `server.js` — `renderWithLayout` passes `currentCharacter` and `config` to content templates
- `scripts/log-cleanup.sh` — New log cleanup script with systemd timer
- `tests/unit/calibration-unified-api.test.js` — Added angle-based tests for absolute servos

---

## [6.7.0] - 2026-02-27 — Calibration Drift Fix for Open-Loop Parts

### Bug Fixes
- **Linear actuator calibration drift** — Fixed progressive positional drift during sweep tests and repeated movements for open-loop parts (linear actuators, continuous servos). Root cause: `settleMs` (mechanical damping delay) was incorrectly added to motor drive time, causing the motor to run longer than calculated on every movement. Now `settleMs` is applied as a post-movement delay after the motor stops.
- **Sweep test re-anchoring** — Sweep tests for open-loop parts now home to a physical endstop before each cycle, resetting the position tracker and eliminating accumulated drift across cycles.

### Calibration Improvements
- **Endpoint overdrive** — When moving to positions near physical endstops (0% or 100%), extra drive time is automatically added to guarantee the actuator contacts the mechanical stop. This resets accumulated open-loop tracking error.
- **Home operation** — New `POST /api/calibration/:partId/home` endpoint drives a part to a physical endstop with generous overdrive and resets position tracking. Used internally by sweep tests and available for manual drift correction.
- **Separated drive vs settle timing** — `OpenLoopLinearAdapter.calculateDriveTime()` now returns pure motor-on time. `settleMs` is waited separately after motor stops, preventing timing contamination across movement calculations.
- **Motion planner fix** — `planner.js planTimeAtSpeed()` now returns `driveMs` and `settleMs` separately instead of combining them into `durationMs`.

### Files Changed
- `server/calibration/adapters/OpenLoopLinearAdapter.js` — Separated settle from drive time, added `home()` method, endpoint overdrive
- `server/calibration/adapters/ContinuousServoAdapter.js` — Added `home()` method, endpoint overdrive, post-movement settle delay
- `server/calibration/router.js` — Added `POST /:partId/home` endpoint, updated default settleMs to 150ms
- `server/calibration/planner.js` — Separated settle time from drive duration in `planTimeAtSpeed()`
- `views/setup/calibration.ejs` — Sweep test now homes before each cycle for open-loop parts
- `data/calibration_profiles.json` — Updated settleMs from 120ms to 150ms
- `tests/unit/calibration-unified-api.test.js` — Increased timeout to accommodate settle delays

---

## [6.7.0] - 2026-02-20 — Dashboard Enhancements, Parrot Fix & RPi Presets

### Bug Fixes
- **STT text duplication** — Fixed duplicate mic transcripts in chat log caused by both `stt_committed` (Scribe v2 Realtime) and `user_transcript` (ConvAI agent) firing for the same speech. Added client-side deduplication with a 3-second rolling window.
- **Parrot mode not working** — Added `suppressMicForCharacter()` echo suppression to prevent the server mic from re-transcribing parrot TTS playback. Enhanced `parrotSay()` with console logging and detailed error display for diagnostics.

### Dashboard Changes
- **Removed STT/TTS Config buttons** from dashboard top bar (still accessible via AI Settings page)
- **Resizable webcam panel** — Webcam card-body now supports CSS `resize: both` for horizontal and vertical resizing
- **Live Console panel** — New terminal-styled panel below webcam showing real-time MonsterBox console output. Features: 3-second auto-polling, line count selector (50/100/200/500), Live toggle, manual refresh. Green-on-black theme using `--mb-terminal-bg`/`--mb-terminal-text` CSS variables. Inherits SortableJS drag/collapse. Dashboard now has 8 sortable panels (was 7).

### System Settings
- **Console output API** — New `GET /api/system/console` endpoint reads `/var/log/monsterbox.log` and `.err` directly (the actual console.log output, not just systemd lifecycle events from journalctl)
- **Log source selector** — System > Logs tab now has a "Log Source" dropdown: Journal (systemd), Console Output (stdout), Error Output (stderr). Service dropdown disables when viewing console output.
- **RPi performance presets** — Six presets for RPi 3B, 3B+, 4B, and 5 in System > Settings > Performance Presets. CPU governor applies immediately; boot config changes (gpu_mem, arm_freq, i2c_baudrate) are documented for manual `/boot/firmware/config.txt` editing. Presets: RPi 3B Performance, RPi 3B+ Performance, RPi 4B Performance (Lifelike), RPi 4B Balanced, RPi 5 Performance (Lifelike), RPi 5 Balanced.

### Files Changed
- `views/conversation/index.ejs` — Dashboard template (buttons removed, webcam resize, console panel, dedup, parrot diagnostics)
- `services/elevenLabsWebSocketService.js` — `suppressMicForCharacter()` method
- `routes/conversation.js` — Echo suppression call after parrot TTS playback
- `services/systemService.js` — `getConsoleOutput()`, `getPerformancePresets()`, `applyPerformancePreset()`
- `routes/api/systemRoutes.js` — `/console`, `/presets`, `/presets/apply` endpoints
- `views/setup/system.ejs` — Log source selector, performance presets UI
- `tests/browser/conversation-refactor.spec.js` — Panel count updated 7 → 8

---

## [6.6.0] - 2026-02-19 — UI Consistency & Theme Compliance (Ready for Testing Gold)

### UI Theme Consistency
- **Navigation bar** — Removed hardcoded `navbar-dark bg-dark`; now uses `bg-body-tertiary` which adapts to any Bootswatch theme (light or dark)
- **Footer** — Replaced `bg-dark text-light` with theme-aware `bg-body-tertiary text-body-secondary`
- **Dashboard** — Replaced hardcoded `#000`, `#111`, `#1a1a1a` backgrounds with `var(--bs-dark)` and `var(--bs-tertiary-bg)` CSS variables
- **AI Settings** — Removed `bg-success text-white` from chat header, `bg-dark text-light` from chat log, `bg-dark border-secondary` from VU meter; all now use theme-aware variables
- **Animation Studio** — Replaced 26 hardcoded hex step-type colors with CSS variable references (`var(--mb-step-servo)`, `var(--mb-step-motor)`, etc.) from the design system. Added `--mb-step-askAI` variable. Fixed hover/active backgrounds to use `var(--bs-secondary-bg)` and `color-mix()` instead of hardcoded rgba values
- **Pose Editor** — Replaced hardcoded type badge colors with CSS variable references; removed `text-light` class assuming dark background
- **Audio/Video Libraries** — Removed `table-dark` from list view tables; tables now inherit theme styling
- **Orchestration** — Changed `btn-outline-light` to `btn-outline-secondary` for theme compatibility
- **Goblin Management** — Removed `text-dark` hardcoded on warning card
- **Setup hub** — Changed `text-dark` icon and `btn-dark` button to `text-secondary`/`btn-secondary`
- **First Run** — Changed `btn-outline-light` to `btn-outline-secondary`
- **Canvas elements** — System gauges, performance charts, and jaw animation visualization now read colors from CSS variables via `getComputedStyle()` instead of using hardcoded hex values
- **Manual Controls** — Replaced hardcoded `#6f42c1` with `var(--mb-primary)`
- **Audio Player** — Replaced hardcoded rgba primary/success colors with `color-mix()` CSS variable expressions

### Design System Updates
- Added `--mb-step-askAI: #3d0f7a` CSS variable to `monsterbox4.css`
- Fixed `--mb-step-linear-actuator` value from `#0dcaf0` to `#e83e8c` to match actual usage

### Spacing & Layout
- Reduced `mb-4` margins to `mb-2`/`mb-3` across audio library, video library, goblin management, and orchestration pages to minimize vertical scrolling

---

## [6.3.0] - 2026-02-19 — Manual Controls Panel + Jaw Animation v2

### New Feature: Manual Controls Panel
- **Spatial control surface** on dashboard (`/`) — draggable tiles for parts, poses, and audio files
- **Three tile types**: hardware parts (servo/actuator/motor/light with colored borders), poses (purple, click to execute), sounds (teal, click to play)
- **Directional controls**: floating toolbar with type-specific controls (nudge/goto for servos, extend/retract for actuators, fwd/rev for motors, toggle for lights)
- **Edit Mode**: drag items to arrange spatial layout, "Add Items" drawer shows available items
- **Named layouts**: multiple arrangements per character (Default, Scare Mode, etc.) with create/rename/delete
- **Layout persistence**: saved per-character at `data/character-{id}/manual-controls-layout.json`
- **Fire-and-forget**: all hardware commands dispatched without blocking UI for live show responsiveness
- **Parts API compatibility**: handles both raw array and `{ success, parts }` wrapper response formats
- **Character independence**: all data loaded dynamically, canvas reloads on character switch

### Previous (6.1.5): Dashboard & Animation Studio Fixes + Jaw Animation v2

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

### Jaw Animation v2: Real-Time Audio-Synchronized Jaw Control

### Persistent Servo Daemon (Phase 1)
- **New `python_wrappers/jaw_servo_daemon.py`**: Long-running Python process initializes PCA9685 I2C bus once, reads JSON commands from stdin (<1ms per command vs ~580ms per Python spawn)
- **New `services/jawServoDaemon.js`**: Node.js daemon lifecycle manager with lazy-start, auto-restart on crash, graceful shutdown
- Daemon routes servo commands through fire-and-forget stdin writes instead of spawning new Python processes per frame
- Shutdown hook added to `server.js` graceful shutdown sequence
- Falls back to `hardwareService.controlPart()` if daemon is unavailable

### Pre-Analysis Engine (Phase 2)
- **`preAnalyzeAudio()`**: Complete audio analysis before playback — eliminates reactive frame-by-frame processing
- **Bandpass filter**: ffmpeg 500-2500Hz speech formant isolation (configurable via `useBandpassFilter`)
- **AGC**: Automatic gain control normalizes peak RMS to 0.8 — no manual sensitivity tuning per audio file
- **Quantization**: Discrete jaw positions (5-20 configurable levels, default 10) for natural animatronic movement
- **20ms frames**: Matches PCA9685 50Hz PWM rate (was 50ms)
- **`playWithJawSync()`**: Synchronized audio+jaw playback with drift-correcting setTimeout scheduling

### Scene Integration (Phase 3)
- `sayThis` scene steps auto-sync jaw during TTS playback when jaw is enabled
- `askAI` scene steps auto-sync jaw during AI response playback
- `audio` scene steps optionally sync jaw with pre-recorded audio files
- `jaw-animation` enable step pre-warms daemon for zero startup delay
- Dashboard `/api/say` endpoint uses `playWithJawSync()` when jaw is enabled
- All jaw integration is non-fatal — graceful fallback to audio-only on failure

### UI Improvements (Phase 4)
- **Presets**: Speech, Music, Custom radio buttons for quick configuration
- **Speech Filter toggle**: Enable/disable 500-2500Hz bandpass filter
- **AGC toggle**: Enable/disable automatic gain control
- **Quantization slider**: 5-20 discrete jaw positions with live value display
- **Timeline canvas**: Visualizes pre-analyzed jaw positions after TTS test
- All controls in ES5 IIFE pattern per project convention

### Testing (Phase 5)
- 14 new unit tests for pre-analysis engine (frames, AGC, silence gating, quantization, guardrails, bandpass toggle)
- Updated system tests for v2 config fields and timeline response
- 7 new browser tests for v2 UI controls (presets, filter, AGC, quantization, timeline canvas)
- **255 system/unit tests passing, 190 browser tests passing, 0 failing**

### New Config Fields (backward-compatible)
- `useBandpassFilter` (default: `true`) — 500-2500Hz speech filter
- `useAGC` (default: `true`) — automatic gain control
- `quantizationLevels` (default: `10`) — discrete jaw positions
- `preset` (default: `speech`) — tuning preset

### Bug Fixes
- Fixed `stop-monitoring` endpoint not cancelling active jaw drives (caused stale `isMonitoring` state)

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
- Removed all hardcoded character names (Orlok, PumpkinHead, Sir Dragomir, Mina) from services, controllers, routes
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
