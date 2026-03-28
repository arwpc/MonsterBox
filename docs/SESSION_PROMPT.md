# MonsterBox Session Briefing Prompt

> Copy everything below the line into a new Copilot chat to bring it fully up to speed.

---

## System Context

You are working on **MonsterBox** (version in package.json) — a Node.js/Express animatronic control system for Halloween props. The codebase lives at `/home/remote/MonsterBox` on an **RPi 4B (aarch64)** named **orlok** (192.168.8.120). You're connected via SSH.

The app runs as a systemd service (`monsterbox`) on port 3000. Use `sudo systemctl restart monsterbox` to restart it. The service runs `node server.js`.

## Architecture

- **Runtime**: Node.js + Express + EJS views + Bootstrap 5
- **Server**: `server.js` (~730 lines) — main Express app
- **Config**: `config/animatronics.json`, `config/app-config.json`
- **Data**: JSON flat files in `data/` (characters.json, parts.json, models/*.json, etc.)
- **No database** — everything is file-based JSON

### Key Directories
```
server.js              # Main Express app
controllers/           # Route handlers (characters, models, parts, poses, webcam, motionTracking)
routes/                # Express routers
  setup/               # calibration, characters, models, poses, audio, webcam, system, super-powers
  api/                 # REST API endpoints
  poses/               # Pose management
  scenes/              # Scene orchestration
services/              # Business logic (35+ service files)
  hardwareService/     # GPIO, servo, motor, LED control
  poses/               # Pose execution engine
  scenes/              # Scene engine
views/                 # EJS templates
  setup/               # Setup pages (calibration, models, characters, poses, etc.)
  orchestration/       # Orchestration UI
  conversation/        # Dashboard / AI conversation UI (rendered at /)
  live/                # Live camera view
public/                # Static assets (CSS, JS, images)
data/                  # All persistent data (JSON files)
  models/              # Model definitions per part type (*_models.json)
  character-{id}/      # Per-character config (jaw_settings, ai_agent_state, ai-config/, etc.)
  audio-library/       # Audio files per character
tests/                 # Test suites
  system/              # Mocha API tests (run: npm run test:system)
  unit/                # Mocha unit tests (run: npm run test:unit)
  ai/                  # AI endpoint tests
  hardware/            # Hardware tests (stepper, microphone, calibration)
  browser/             # Playwright browser tests (run: npm run test:browser)
```

### Dashboard Consolidation
- `/` renders the Dashboard (using `views/conversation/index.ejs`)
- `/conversation` redirects to `/` — conversation IS the dashboard
- Jaw Animation has its own page at `/setup/jaw-animation`
- Nav: Dashboard, Live, Setup (Calibration, Models, Characters, Poses, Audio, Webcam, Jaw Animation, System)

### Hardware Abstraction

Parts are controlled through a hardware service layer:
- **PCA9685** servo controller over I2C (address 64)
- **BTS7960** / **MDD10A** H-bridge motor drivers via GPIO
- **Stepper motors** via `python_wrappers/stepper_cli.py` (lgpio backend)
- **PipeWire** for audio (speaker + microphone)
- **USB webcam** via v4l2
- **PIR motion sensor** via GPIO

### AI Integration (ElevenLabs — single provider)
- **TTS**: `eleven_flash_v2_5` (default, ~75ms) and `eleven_multilingual_v2` (narration)
- **STT**: `scribe_v2` (batch) and `scribe_v2_realtime` (WebSocket streaming, ~150ms)
- **Conversational AI**: ElevenLabs agents via WebSocket on port 8795
- **Per-character config**: `data/character-{N}/ai-config/tts-config.json` and `stt-config.json`
- **Speech pipeline**: `elevenLabsTTSService.generateSpeech()` → `serverPlaybackService.playAIOnCharacterSpeaker()`
- Agent state stored per character in `data/character-{id}/ai_agent_state.json`

## Characters (Animatronics)

| ID | Name | IP | Notes |
|----|------|----|----|
| 1 | PumpkinHead | 192.168.8.150 | Active |
| 2 | Mina | 192.168.8.140 | Active |
| 3 | **Orlok** | 192.168.8.120 | **Current host** — primary dev target |
| 4 | Sir Dragomir | 192.168.8.130 | Offline |
| 5 | Groundbreaker | 192.168.8.200 | Active |

### Orlok's Parts (Character ID 3) — 12 parts

| Part ID | Type | Name |
|---------|------|------|
| 5 | linear_actuator | Right Arm of Orlok |
| 6 | linear_actuator | Left Arm of Manipulation |
| 7 | linear_actuator | Bow At The Waist |
| 8 | servo | Elbow |
| 9 | servo | Forearm Rotation |
| 10 | speaker | Speaker Orlok |
| 11 | microphone | Microphone Orlok |
| 12 | light | Hand of Azura |
| 13 | webcam | Eye of Orlok |
| 14 | servo | Jaw of Orlok |
| 15 | servo | Head on a Swivel (ContinuousServoAdapter) |
| 16 | motion_sensor | Sensor for Orlok |

## Supported Part Types (12)

servo, linear_actuator, motor, stepper_motor, led, light, speaker, microphone, webcam, head_tracking, motion_sensor, relay

## Models System

Models define reusable default configurations for part types. Stored in `data/models/<type>_models.json`. Each model has: id, name, description, type, defaults (type-specific config object). Parts can reference a model and layer overrides on top.

The Models page (`/setup/models`) uses structured form fields per type (no raw JSON editing). The Calibration page (`/setup/calibration`) has a Model/Overrides tab where parts can be assigned a model and overrides saved to the part (not the model).

## Test Infrastructure

**257 total tests** — 148 Mocha + 109 Playwright

```bash
npm test                    # All tests (browser + system + unit)
npm run test:system         # Mocha system tests (MB_TEST_MODE=1)
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser tests
npm run test:hardware       # Hardware tests (needs MONSTERBOX_HARDWARE_AVAILABLE=1)
npm run verify              # system + unit + browser
```

### Test Files
**System (Mocha)**: ai-audio, audio, hardware, jaw-animation, models, scenes
**Unit (Mocha)**: calibration-unified-api, index (basic routes)
**AI (Mocha)**: ask-ai-endpoint, conversation-route, conversation-service
**Hardware (Mocha)**: stepper, microphone, continuous-servo-calibration, linear-actuator-calibration
**Browser (Playwright)**: audio-library, conversation, conversation-refactor, jaw-animation, models, orchestration, scenes, setup-parts

Playwright config: `playwright.config.js` (headless Chromium on port 3123)

## Recent Git History

```
ce30c302 fix: update tests for dashboard consolidation and hardware import
f0800eb5 Update docs, install.sh, and remove legacy ElevenLabs compatibility
f095b7c1 Fix ElevenLabs integration: per-character TTS, direct service calls, correct STT model
563285a1 Fix realtime STT status endpoint
0776353d Upgrade ElevenLabs to Scribe v2 Realtime STT + Flash v2.5 TTS
949d2594 Consolidate navigation: Dashboard=Conversation, Super Powers→Jaw Animation
334b5b01 Add Models page Mocha and Playwright test coverage
3d691cae Redesign Models UI and Calibration Model/Overrides tab
```

Branch: **main** (active). Latest tag: `v5.5.1` (Gold Release, February 2026).

## Key URLs (when app is running)

- Dashboard: http://localhost:3000
- Calibration: http://localhost:3000/setup/calibration
- Models: http://localhost:3000/setup/models
- Characters: http://localhost:3000/setup/characters
- Poses: http://localhost:3000/setup/poses
- Scenes: http://localhost:3000/scenes
- Orchestration: http://localhost:3000/orchestration
- Jaw Animation: http://localhost:3000/setup/jaw-animation
- System: http://localhost:3000/setup/system
- Live: http://localhost:3000/live

## Development Conventions

- EJS views use Bootstrap 5, inline `<script>` blocks (no bundler)
- Controllers follow MVC pattern: controller → service → data file
- API routes return JSON, page routes render EJS
- All data mutations go through service layer, which reads/writes JSON files
- Tests use supertest for HTTP, Playwright for browser, Mocha/Chai assertions
- `MB_TEST_MODE=1` env var enables test mode (skips hardware init)
- Git commits go directly to main, pushed to github.com/arwpc/MonsterBox

## Known Issues / Tech Debt

- Head on Swivel (part 15) uses ContinuousServoAdapter — different behavior from standard servos
- 6 jaw-animation Mocha tests fail without a physically calibrated jaw servo (hardware-env dependent)
- ARCHIVE/ directory contains old/deprecated code kept for reference
