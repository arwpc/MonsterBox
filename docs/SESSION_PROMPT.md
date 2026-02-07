# MonsterBox Session Briefing Prompt

> Copy everything below the line into a new Copilot chat to bring it fully up to speed.

---

## System Context

You are working on **MonsterBox 5.5.0** — a Node.js/Express animatronic control system for Halloween props. The codebase lives at `/home/remote/MonsterBox` on an **RPi 4B (aarch64)** named **orlok** (192.168.8.120). You're connected via SSH.

The app runs as a systemd service (`monsterbox`) on port 3000. Use `sudo systemctl restart monsterbox` to restart it. The service runs `node server.js`.

## Architecture

- **Runtime**: Node.js + Express + EJS views + Bootstrap 5
- **Server**: `server.js` (794 lines) — main Express app
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
  conversation/        # AI conversation UI
  live/                # Live camera view
public/                # Static assets (CSS, JS, images)
data/                  # All persistent data (JSON files)
  models/              # Model definitions per part type (*_models.json)
  character-{id}/      # Per-character config (jaw_settings, ai_agent_state, etc.)
  audio-library/       # Audio files per character
tests/                 # Test suites
  system/              # Mocha API tests (run: npm run test:system)
  unit/                # Mocha unit tests (run: npm run test:unit)
  browser/             # Playwright browser tests (run: npm run test:browser)
```

### Hardware Abstraction

Parts are controlled through a hardware service layer:
- **PCA9685** servo controller over I2C (address 64)
- **BTS7960** / **MDD10A** H-bridge motor drivers via GPIO
- **PipeWire** for audio (speaker + microphone)
- **USB webcam** via v4l2
- **PIR motion sensor** via GPIO

### AI Integration
- **ElevenLabs** for TTS/STT/Conversational AI
- AI conversation mode with jaw animation synced to speech
- Agent state stored per character in `data/character-{id}/ai_agent_state.json`

## Characters (Animatronics)

| ID | Name | IP | Notes |
|----|------|----|----|
| 1 | PumpkinHead | — | |
| 2 | Coffin Breaker | — | |
| 3 | **Orlok** | 192.168.8.120 | **Current host** — primary dev target |
| 4 | Skulltalker | 192.168.8.130 | |
| 5 | Groundbreaker | 192.168.8.200 | Also PumpkinHead_Updated (IDs 5,6) |
| 7 | Groundbreaker | — | |

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

```bash
npm test                    # All tests (browser + system + unit)
npm run test:system         # Mocha system tests (MB_TEST_MODE=1)
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser tests
npm run test:hardware       # Hardware tests (needs MONSTERBOX_HARDWARE_AVAILABLE=1)
npm run verify              # system + unit + browser
```

### Test Files
**System (Mocha)**: ai-audio, audio, hardware, models, scenes
**Browser (Playwright)**: audio-library, conversation (x2), models, orchestration, scenes, setup-parts + legacy test-* files
**Unit (Mocha)**: calibration-unified-api, index

Playwright config: `playwright.config.js` (headless Chromium, `playwright.live.config.ts` for headed)

## Recent Git History

```
334b5b01 Add Models page Mocha and Playwright test coverage
3d691cae Redesign Models UI and Calibration Model/Overrides tab
2749872d Updates to fix hardware - all but head swivel - la servos work
c52e7141 Add ContinuousServoAdapter for Head on Swivel servo
26496663 Fix hardware calibration: linear actuators, BTS7960 motor, power toggle
99a5a6bb Major testing fixes
abd28f34 MonsterBox 5.5.1 GOLD
```

Branch: **main** (active). Stale branches exist but aren't relevant.

## Key URLs (when app is running)

- Home: http://localhost:3000
- Calibration: http://localhost:3000/setup/calibration
- Models: http://localhost:3000/setup/models
- Characters: http://localhost:3000/setup/characters
- Poses: http://localhost:3000/setup/poses
- Scenes: http://localhost:3000/scenes
- Orchestration: http://localhost:3000/orchestration
- Conversation: http://localhost:3000/conversation
- System: http://localhost:3000/setup/system

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
- Characters 5 and 6 are duplicates ("PumpkinHead_Updated")
- Some legacy test files in tests/browser/ (test-*.js) aren't in the Playwright spec pattern
- ARCHIVE/ directory contains old/deprecated code kept for reference
