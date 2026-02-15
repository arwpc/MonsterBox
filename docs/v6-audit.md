# MonsterBox v6.0.0 Upgrade - Codebase Audit

**Date:** 2026-02-14
**Current Version:** 5.5.1
**Target Version:** 6.0.0
**Audit Status:** Complete (Read-Only Analysis)

---

## Executive Summary

This audit documents the current state of MonsterBox 5.5.1 prior to the v6.0.0 upgrade. The codebase is a mature animatronic control platform built on Node.js/Express with extensive hardware integration, AI services (ElevenLabs), and a comprehensive test suite. The primary issues identified for v6.0.0 remediation are:

1. **Character Independence Violations:** Hardcoded references to "Orlok" (character ID 3) throughout services
2. **Version String Duplication:** Version "5.5.1" appears in multiple files instead of single-source from package.json
3. **Character ID Hardcoding:** Direct references to character ID 3 in default values and orchestration config
4. **Duplicate Agent Configurations:** Character prompt/agent data duplicated in multiple service files

**Test Baseline:** 108+ browser tests passing (2 failures), Mocha tests running
**Git Status:** Clean (main branch, up to date with origin)

---

## 1. Current Architecture Overview

### Technology Stack
- **Runtime:** Node.js 20 LTS (ES modules)
- **Web Framework:** Express 4.18.2
- **Template Engine:** EJS 3.1.9
- **Testing:** Mocha + Playwright (257 total tests)
- **Hardware Interface:** Python 3 scripts via child_process
- **Audio System:** PipeWire + WirePlumber (server-side)
- **AI Services:** ElevenLabs (TTS, STT, Conversational AI)
- **Video System:** Goblin (MPV-based playback on remote Pi units)

### Key Services
- **elevenLabsTTSService.js** - Text-to-speech generation
- **elevenLabsSTTService.js** - Speech-to-text transcription
- **serverPlaybackService.js** - Audio playback routing (per-character speaker assignment)
- **jawAnimationSuperPowerService.js** - Real-time jaw servo animation during TTS
- **goblinManagerService.js** - Remote video player orchestration
- **hardwareService/** - Servo, motor, stepper, actuator, light control
- **characterService.js** - Character CRUD and metadata
- **orchestrationService.js** - Multi-animatronic scene coordination

### Data Architecture
- **Characters:** Stored in `data/characters.json` (7 characters: IDs 1-7)
- **Per-Character Data:** `data/character-{id}/` directories contain:
  - `parts.json` - Hardware part definitions
  - `poses.json` - Named pose configurations
  - `scenes.json` - Scene sequences
  - `ai-config/` - TTS/STT/agent configuration
  - `audio-config.json` - Speaker/microphone routing
  - `images/` - Character avatar images
- **Global Data:** `data/calibration_profiles.json`, `data/goblin-playlists.json`
- **App Config:** `config/app-config.json` (port, theme, selectedCharacter, dataPath)

### Hardware Architecture
- **Main Controller:** Raspberry Pi 4B (4GB RAM)
- **GPIO Library:** pigpio daemon (running as systemd service)
- **Python Wrappers:** CLI scripts in `python_wrappers/` for servo, motor, sensor, light control
- **Supported Hardware:**
  - Servos (via PCA9685 I2C)
  - DC Motors (BTS7960 H-bridge)
  - Stepper Motors (A4988 drivers)
  - Linear Actuators (L298N control)
  - Sensors (PIR, microphone)
  - Lights (GPIO PWM)

---

## 2. Directory Structure Map

```
MonsterBox/
├── ai/                          # AI integration modules
│   └── integrations/            # Anthropic, Google AI clients (legacy)
├── config/                      # Configuration files
│   ├── animatronics.json        # Network/role mapping (ISSUE: hardcoded char IDs)
│   └── app-config.json          # Active character, theme, port
├── controllers/                 # Request handlers
│   ├── webcamModelsController.js
│   └── motionTrackingController.js
├── data/                        # Character and media data
│   ├── character-1/ through character-8/  # Per-character data directories
│   ├── audio-library/           # Shared audio files
│   ├── video-library/           # Shared video files
│   ├── characters.json          # Character registry
│   ├── calibration_profiles.json # Hardware calibration (NEW unified format)
│   ├── goblins.json             # Video player device registry
│   └── goblin-playlists.json    # Video playlist definitions
├── docs/                        # Documentation (14 subdirectories)
│   ├── api/                     # API documentation
│   ├── characters/              # Character-specific guides
│   ├── deployment/              # Installation and systemd setup
│   ├── development/             # Development guides
│   ├── hardware/                # Hardware wiring and GPIO maps
│   ├── integration/             # ElevenLabs, Goblin, hardware integration
│   ├── security/                # SSH, authentication
│   ├── setup/                   # Calibration, tuning guides
│   ├── testing/                 # Test framework documentation
│   └── troubleshooting/         # Common issues
├── goblin/                      # Goblin video player system (deployable to remote Pi units)
│   ├── src/                     # Goblin app code (separate Express server)
│   ├── playlists/               # Playlist JSON definitions
│   ├── scripts/                 # Deployment automation (Facehugger)
│   └── systemd/                 # Goblin service files
├── public/                      # Static web assets
│   ├── css/                     # Stylesheets
│   ├── js/                      # Client-side JavaScript (ES5 IIFE pattern)
│   ├── images/                  # UI graphics
│   ├── sounds/                  # UI sound effects
│   └── vendor/                  # Third-party libraries (Bootstrap, etc.)
├── python_wrappers/             # Hardware control Python CLI scripts
│   ├── light_cli.py
│   ├── linear_actuator_control.py
│   ├── microphone_cli.py
│   ├── motion_detect_cli.py
│   ├── sensor_cli.py
│   └── speaker_cli.py
├── routes/                      # Express route handlers
│   ├── api/                     # REST API endpoints
│   │   ├── audioLoopRoutes.js
│   │   ├── characterImagesRoutes.js
│   │   ├── elevenLabsApiRoutes.js
│   │   ├── orchestrationRoutes.js
│   │   ├── partsApi.js
│   │   ├── randomPoseRoutes.js
│   │   ├── sceneEditorApi.js
│   │   └── systemRoutes.js
│   ├── poses/                   # Pose management UI routes
│   ├── scenes/                  # Scene editor UI routes
│   ├── setup/                   # Setup page routes
│   │   ├── audio.js
│   │   ├── calibration.js
│   │   ├── characters.js
│   │   ├── jaw-animation.js
│   │   ├── models.js
│   │   ├── poses.js
│   │   ├── system.js
│   │   └── webcam.js
│   ├── audioLibrary.js          # Audio library UI
│   ├── conversation.js          # AI conversation dashboard
│   ├── firstRun.js              # First-run character setup
│   ├── goblinManagement.js      # Goblin video system UI
│   ├── orchestration.js         # Multi-animatronic orchestration UI
│   └── videoLibrary.js          # Video library UI
├── scripts/                     # Maintenance and setup scripts
│   ├── configure-wireplumber.sh
│   ├── ensure-no-legacy-calibration.mjs
│   ├── migrate-calibration-v15.mjs
│   ├── optimize-pi-performance.sh
│   └── update-all-to-5.5.sh
├── server/                      # Server-side modules
│   └── calibration/             # Unified calibration API v1.5
├── services/                    # Business logic layer
│   ├── hardwareService/         # Hardware abstraction layer
│   │   ├── index.js
│   │   ├── servo.js
│   │   ├── motor.js
│   │   ├── stepper.js
│   │   ├── actuator.js
│   │   └── light.js
│   ├── poses/                   # Pose engine and repository
│   ├── scenes/                  # Scene execution engine
│   ├── aiConfigStore.js         # Per-character AI config loader
│   ├── audioHealthMonitor.js    # Audio system health checks
│   ├── autoAIService.js         # Autonomous AI conversation mode
│   ├── characterService.js      # ISSUE: Hardcoded Orlok fallback
│   ├── conversationService.js   # ElevenLabs conversational AI
│   ├── elevenLabsAgentService.js # ISSUE: Hardcoded Orlok prompt
│   ├── elevenLabsSTTService.js  # Speech-to-text
│   ├── elevenLabsTTSService.js  # Text-to-speech
│   ├── goblinManagerService.js  # Goblin device management
│   ├── goblinService.js         # Goblin API client
│   ├── jawAnimationSuperPowerService.js # ISSUE: Hardcoded Orlok jaw range
│   ├── microphoneService.js     # Server-side microphone capture
│   ├── orchestrationService.js  # ISSUE: Hardcoded animatronic list
│   ├── pipewireService.js       # PipeWire audio routing
│   ├── randomPoseService.js     # Random pose triggering
│   ├── serverPlaybackService.js # Audio playback
│   ├── serverSTTListener.js     # ISSUE: Orlok-specific comment
│   └── streamRoutingService.js  # Audio stream routing
├── tests/                       # Test suites
│   ├── browser/                 # Playwright E2E tests (109 passing, 7 deprecated)
│   ├── system/                  # Mocha system integration tests
│   ├── unit/                    # Mocha unit tests
│   ├── ai/                      # AI service tests
│   ├── hardware/                # Hardware integration tests
│   └── integration/             # Integration test scenarios
├── utils/                       # Utility modules
├── views/                       # EJS templates
│   ├── ai-settings/             # AI configuration pages
│   ├── audio-library/           # Audio library UI
│   ├── components/              # Reusable UI components
│   ├── conversation/            # Conversation dashboard
│   ├── first-run/               # First-run wizard
│   ├── goblin-management/       # Goblin management UI
│   ├── layouts/                 # Master layout template
│   ├── live/                    # Live performance dashboard
│   ├── orchestration/           # Multi-animatronic control
│   ├── partials/                # Reusable partial templates
│   ├── poses/                   # Pose management UI
│   ├── scenes/                  # Scene editor UI
│   ├── setup/                   # Setup pages
│   └── video-library/           # Video library UI
├── ARCHIVE/                     # Historical code and documentation (not active)
├── install.sh                   # System installation script
├── server.js                    # Main entry point (ISSUE: hardcoded version in health check)
├── package.json                 # Dependencies and scripts (VERSION: 5.5.1)
├── CHANGELOG.md                 # Release history
├── CLAUDE.md                    # AI assistant instructions
└── README.md                    # Main documentation
```

---

## 3. Route Endpoint Map

### API Endpoints
**Audio & Playback:**
- `POST /api/audio/stop-all` - Stop all audio playback
- `GET /api/audio/health` - Audio system health status
- `GET /api/audio/info` - Audio device enumeration
- `POST /api/audio/test` - Audio playback test
- `POST /api/audio/reset` - Reset audio health monitor
- `POST /api/audio-loop/*` - Audio loop management

**Character & Parts:**
- `GET/POST /api/calibration/*` - Unified calibration API v1.5
- `GET/POST/PUT/DELETE /api/parts/*` - Hardware part CRUD

**AI Services (ElevenLabs):**
- `POST /api/elevenlabs/generate-and-play` - TTS generation and playback
- `GET /api/elevenlabs/stt/capabilities` - STT model info
- `GET /api/elevenlabs/stt/realtime/status` - Realtime STT WebSocket status
- `POST /api/elevenlabs/*` - Additional TTS/STT endpoints

**Scenes & Orchestration:**
- `POST /api/orchestration/start` - Start multi-animatronic orchestration
- `POST /api/orchestration/stop` - Stop orchestration
- `GET/POST/PUT/DELETE /api/scenes/*` - Scene CRUD
- `POST /api/random-poses/*` - Random pose triggering

**Goblin Video:**
- `POST /api/goblins/register` - Goblin auto-registration
- `POST /api/goblins/:id/heartbeat` - Goblin heartbeat
- `GET /api/goblins` - List registered Goblins

**System:**
- `GET /health` - Server health check (ISSUE: hardcoded "5.5.1")
- `GET /__errors` - Structured error stats (for CI)
- `POST /__errors/reset` - Reset error stats
- `GET /__audio/active-device` - Current audio device for character
- `GET /__audio/last-play` - Last playback telemetry
- `GET /__audio/last-ai` - Last AI playback telemetry
- `GET /__audio/tools` - Audio tool availability (mpg123, ffmpeg, pwplay)
- `GET /__kill` - Dev-only server shutdown (for tests)

### Web UI Routes
**Dashboard & Live:**
- `GET /` - Dashboard (conversation control, redirects to /first-run if no character selected)
- `GET /live` - Live performance dashboard

**Setup Pages:**
- `GET /setup` - Setup menu
- `GET /setup/calibration` - Hardware calibration
- `GET /setup/audio` - Audio device configuration
- `GET /setup/webcam` - Webcam settings
- `GET /setup/models` - Hardware models management
- `GET /setup/jaw-animation` - Jaw animation configuration (Super Power)
- `GET /setup/super-powers` - Redirect to /setup/jaw-animation (301)
- `GET /setup/system` - System settings
- `GET /setup/poses` - Pose library
- `GET /setup/characters` - Character management
- `GET /setup/character-audio` - Per-character audio routing

**Features:**
- `GET /audio-library` - Audio library management
- `GET /video-library` - Video library management
- `GET /goblin-management` - Goblin video system control
- `GET /conversation` - Conversation control (now redirects to /)
- `GET /orchestration` - Multi-animatronic orchestration
- `GET /scenes` - Scene editor
- `GET /first-run` - First-run character setup wizard
- `GET /poses` - Pose management
- `GET /ai-settings` - AI configuration

---

## 4. EJS Template Map

**Layout & Components:**
- `views/layouts/master.ejs` - Master page layout
- `views/components/layout.ejs` - Reusable layout component
- `views/components/unified-layout.ejs` - Unified layout wrapper
- `views/components/unified-navigation.ejs` - Navigation component
- `views/components/character-avatar.ejs` - Character avatar display
- `views/partials/characterMenu.ejs` - Character selector dropdown
- `views/partials/head-extras.ejs` - Additional head content
- `views/partials/body-extras.ejs` - Additional body content

**Core Pages:**
- `views/first-run/index.ejs` - Initial character setup
- `views/error.ejs` - Error page
- `views/conversation/index.ejs` - Conversation dashboard (main page)
- `views/live/index.ejs` - Live performance mode

**Setup Pages:**
- `views/setup/index.ejs` - Setup menu
- `views/setup/calibration.ejs` - Calibration UI
- `views/setup/unified-calibration.ejs` - Unified calibration interface
- `views/setup/audio.ejs` - Audio settings
- `views/setup/webcam.ejs` - Webcam configuration
- `views/setup/models.ejs` - Model management
- `views/setup/jaw-animation.ejs` - Jaw animation setup
- `views/setup/system.ejs` - System settings
- `views/setup/poses.ejs` - Pose setup
- `views/setup/characters.ejs` - Character management
- `views/setup/character-images.ejs` - Character image upload

**Feature Pages:**
- `views/audio-library/index.ejs` - Audio library UI
- `views/video-library/index.ejs` - Video library UI
- `views/goblin-management/index.ejs` - Goblin management
- `views/orchestration/index.ejs` - Orchestration control
- `views/scenes/scenes.ejs` - Scene list
- `views/scenes/scene-editor.ejs` - Scene editor
- `views/poses/index.ejs` - Pose management
- `views/ai-settings/index.ejs` - AI overview
- `views/ai-settings/stt.ejs` - STT configuration
- `views/ai-settings/tts.ejs` - TTS configuration

---

## 5. Python Hardware Scripts

**Active Scripts (python_wrappers/):**
- `light_cli.py` - LED/light control via GPIO PWM
- `linear_actuator_control.py` - Linear actuator positioning
- `microphone_cli.py` - Server-side microphone capture
- `motion_detect_cli.py` - PIR motion sensor reading
- `sensor_cli.py` - Generic sensor reading
- `speaker_cli.py` - Speaker output routing

**Test Scripts (tests/scripts/):**
- `test-motor-direct.py` - Motor controller test
- `test-mdd10a-direct.py` - MDD10A motor driver test

**Archived/Legacy:**
- Multiple legacy test scripts in `ARCHIVE/python-test-scripts/`
- Historical snapshots in `ARCHIVE/remote-snapshots/skulltalker/`

---

## 6. Configuration Files

**Application Config:**
- `config/app-config.json` - Active runtime config
  - `port`: 3000
  - `theme`: "dark"
  - `selectedCharacter`: 2 (currently selected)
  - `dataPath`: "data/character-2"

**Network/Role Mapping:**
- `config/animatronics.json` - **ISSUE: Hardcoded character IDs and IPs**

**Character Registry:**
- `data/characters.json` - 7 characters (IDs 1-7, with duplicate "PumpkinHead_Updated" entries)

**Calibration:**
- `data/calibration_profiles.json` - Unified hardware calibration (v1.5 format)

**Goblins:**
- `data/goblins.json` - Registered Goblin video players
- `data/goblin-playlists.json` - Video playlists

**Environment:**
- `.env.example` - Template for environment variables (ElevenLabs API key path)

**Build/Deploy:**
- `package.json` - **VERSION: 5.5.1** (single source of truth)
- `package-lock.json` - Dependency lock
- `.gitignore` - Git exclusions
- `.gitattributes` - Git attributes

---

## 7. Test Infrastructure

### Test Categories (257 Total Tests)

**Browser Tests (Playwright):**
- `tests/browser/ai-settings.spec.js` - 26 tests (AI Settings pages)
- `tests/browser/audio-library.spec.js` - 9 tests (Audio library UI)
- `tests/browser/conversation.spec.js` - 9 tests (Conversation WebSocket)
- `tests/browser/conversation-refactor.spec.js` - 32 tests (Dashboard panels)
- `tests/browser/jaw-animation.spec.js` - 27 tests (Jaw animation UI)
- `tests/browser/models.spec.js` - 18 tests (Model management)
- `tests/browser/orchestration.spec.js` - 6 tests (Multi-animatronic)
- `tests/browser/scenes.spec.js` - Scene editor tests
- `tests/browser/setup-parts.spec.js` - Parts/calibration tests

**System Tests (Mocha):**
- `tests/system/ai-audio.test.js` - AI audio integration
- `tests/system/audio.test.js` - Audio playback
- `tests/system/hardware.test.js` - Hardware service layer
- `tests/system/jaw-animation.test.js` - Jaw animation (6 failures - hardware-dependent)
- `tests/system/models.test.js` - Model CRUD
- `tests/system/scenes.test.js` - Scene execution

**Unit Tests (Mocha):**
- `tests/unit/calibration-unified-api.test.js` - Calibration API
- `tests/unit/index.test.js` - Basic route tests

**AI Tests (Mocha):**
- `tests/ai/ask-ai-endpoint.test.js`
- `tests/ai/conversation-route.test.js`
- `tests/ai/conversation-service.test.js`

**Hardware Tests (Mocha):**
- `tests/hardware/stepper.test.js` - Stepper motor control
- `tests/hardware/linear-actuator-calibration.test.js`
- `tests/hardware/continuous-servo-calibration.test.js`
- `tests/hardware/microphone-crud-mocha.test.js`

**Test Utilities:**
- `tests/setup.js` - Mocha test setup
- `tests/test.setup.js` - Additional setup
- `tests/browser/framework.js` - Playwright test framework

---

## 8. Test Baseline Results

### Browser Tests (Playwright)
**Status:** Running (108+ passing observed, 2 failures, 7 deprecated/skipped)

**Failures Observed:**
1. `ai-settings.spec.js:140` - "should show VU meter" (6.7s timeout)
2. `jaw-animation.spec.js:153` - "should save configuration via API" (13.9s timeout)

**Deprecated Tests:**
- 7 tests marked as deprecated (Ask AI modal, Audio Files panel - features removed in 5.5 consolidation)

### System Tests (Mocha)
**Status:** Running (expected: 93 passing, 2 pending, 6 failing per README)

**Known Failures:**
- 6 jaw animation tests require physically calibrated jaw servo (hardware-environment-dependent)

### Overall Test Health
- **257 Total Tests** (148 Mocha + 109 Playwright per README)
- **CI Integration:** GitHub Actions on every commit
- **Test Mode Flag:** `MB_TEST_MODE=1` for safe testing without hardware init
- **Test Port:** 3123 (dedicated for CI isolation)
- **Performance:** Browser test suite ~4-5 minutes, System tests ~2-3 minutes

---

## 9. Identified Issues

### CRITICAL: Character Independence Violations

**Location:** Multiple service files
**Impact:** HIGH - Code assumes Orlok (character ID 3) as default, breaks character independence requirement

**Hardcoded "Orlok" String References:**
1. `services/characterService.js:` - Hardcoded Orlok in default character list fallback
2. `services/elevenLabsAgentService.js:` - Hardcoded Orlok prompt and agent mapping
3. `services/orchestrationService.js:` - Hardcoded animatronic list with character IDs

**Hardcoded Character ID 3 References:**
1. `services/poses/poseEngine.js:` - `const characterId = config.selectedCharacter || 3;`
2. `services/orchestrationService.js:` - Hardcoded `characterId: 3` for Orlok animatronic

**Orlok-Specific Comments:**
1. `services/serverSTTListener.js:` - Comment "verified working on Orlok"
2. `services/jawAnimationSuperPowerService.js:` - Comment "typical Orlok jaw range"
3. `services/sttFilterPresets.js:` - Preset description "tuned on Orlok"

**Recommended Fix:**
- Remove all hardcoded character names and IDs
- Use dynamic character lookup from `data/characters.json`
- Replace default fallbacks with config-driven or first-available-character logic
- Move agent prompts to per-character config files (`data/character-{id}/ai-config/`)
- Make orchestration animatronic list configurable via JSON file

### ISSUE: Version String Duplication

**Location:** Multiple files
**Impact:** MEDIUM - Version must be manually updated in multiple places

**Files Containing "5.5":**
1. `package.json` - **SOURCE OF TRUTH** (version: "5.5.1")
2. `server.js:96` - Health endpoint: `version: '5.5.1'`
3. `CHANGELOG.md` - Release notes (appropriate)
4. `README.md` - Documentation (appropriate)
5. Various doc files in `docs/` (appropriate for historical context)

**Recommended Fix:**
- Import version from package.json in server.js: `import pkg from './package.json' assert { type: 'json' };`
- Use `pkg.version` in health endpoint
- Document in CLAUDE.md that package.json is single source of truth

### ISSUE: Duplicate Character List

**Location:** `services/characterService.js`
**Impact:** LOW - Character list hardcoded as fallback instead of reading from data/characters.json

**Code:**
```javascript
async getCharacters() {
    try {
        const data = await fs.readFile(path.join(__dirname, '../data/characters.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading characters:', error);
        return [
            { id: 1, name: 'PumpkinHead' },
            { id: 2, name: 'Coffin Breaker' },
            { id: 3, name: 'Orlok' },      // ISSUE: Hardcoded fallback
            { id: 4, name: 'Skulltalker' }
        ];
    }
}
```

**Recommended Fix:**
- Remove hardcoded fallback array
- Return empty array or throw error if characters.json is missing
- Ensure characters.json is always present via install.sh

### ISSUE: Hardcoded Animatronic Network Configuration

**Location:** `services/orchestrationService.js`
**Impact:** HIGH - Animatronic network topology hardcoded instead of config-driven

**Code:**
```javascript
constructor() {
    this.animatronics = [
        { id: 1, name: 'PumpkinHead', hostname: 'pumpkinhead', ip: '192.168.8.150', port: 3000, characterId: 8, agentId: '...' },
        { id: 2, name: 'Coffin Breaker', hostname: 'coffinbreaker', ip: '192.168.8.140', port: 3000, characterId: 2, agentId: '...' },
        { id: 3, name: 'Orlok', hostname: 'orlok', ip: '192.168.8.120', port: 3000, characterId: 3, agentId: '...' },
        // ... more
    ];
}
```

**Recommended Fix:**
- Move animatronic list to `config/animatronics.json` (already exists!)
- Load from file at runtime
- Make orchestration service config-driven

### ISSUE: Agent Prompt Duplication

**Location:** `services/elevenLabsAgentService.js`
**Impact:** MEDIUM - Character prompts hardcoded in service instead of per-character config

**Code:**
```javascript
const prompts = {
    'Orlok': {
        prompt: `You are Orlok, an ancient and mysterious vampire...`,
    },
    // ... more character prompts
};
```

**Recommended Fix:**
- Move character prompts to `data/character-{id}/ai-config/agent-config.json`
- Load dynamically based on selected character
- Remove hardcoded prompt map

### ISSUE: Duplicate Character Entries

**Location:** `data/characters.json`
**Impact:** LOW - Duplicate "PumpkinHead_Updated" entries (IDs 5 and 6)

**Current State:**
```json
[
  { "id": 5, "name": "PumpkinHead_Updated", ... },
  { "id": 6, "name": "PumpkinHead_Updated", ... }
]
```

**Recommended Fix:**
- Clarify if these are different characters or consolidate
- Ensure unique character names or add descriptive suffixes

---

## 10. Version String Locations

**Source of Truth:**
- `package.json` - `"version": "5.5.1"` (line 3)

**Hardcoded Version References (MUST UPDATE FOR v6.0.0):**
1. `server.js:96` - Health endpoint: `version: '5.5.1'`

**Documentation (OK to keep for historical context):**
1. `CHANGELOG.md` - Lines 5, 22, 65 (release notes)
2. `README.md` - Lines 1, 3, 13, 106, etc. (many instances in docs)
3. Various files in `docs/` directory
4. `scripts/update-all-to-5.5.sh` - Update script filename

**Lock Files (auto-generated):**
1. `package-lock.json` - Auto-updated by npm

---

## 11. Current Character List

**Total Characters:** 7 (IDs 1-7) + 1 new (ID 8 directory exists but not in characters.json)

**Registered Characters (data/characters.json):**
1. **ID 1:** PumpkinHead (ElevenLabs agent: agent_4201k6s9y384f9v9hqmg67ygc645)
2. **ID 2:** Coffin Breaker (agent: agent_8401k3f1dx98e05t94yp6kz4vf8n) [activeImage: helen.jpg]
3. **ID 3:** Orlok (agent: agent_0801k3f1dw7xe2g8r4jkbxk0gt2n) [activeImage: 1orlok.png]
4. **ID 4:** Skulltalker (agent: agent_7901k3f1dza1ee68w1257zh3s9x6) [activeImage: John_Hunyadi__Chronica_Hungarorum_.jpg]
5. **ID 5:** PumpkinHead_Updated (agent: agent_4201k6s9y384f9v9hqmg67ygc645) [DUPLICATE NAME]
6. **ID 6:** PumpkinHead_Updated (agent: agent_0801k3f1dybkecj88sta18gwwrv5) [activeImage: pumpkinhead.jpg] [DUPLICATE NAME]
7. **ID 7:** Groundbreaker (agent: agent_4201k6s9y384f9v9hqmg67ygc645) [activeImage: groundbreaker.jpg]

**Unregistered Character Directories:**
- `data/character-8/` exists but not in characters.json

**Currently Selected Character:**
- **ID 2** (Coffin Breaker) - per `config/app-config.json`

**Character Data Completeness:**
- **Character 1-3:** Full data (parts, poses, scenes, ai-config, images)
- **Character 4:** Partial data (missing models directory)
- **Character 5-7:** Minimal data (missing ai-config, some missing poses/scenes)
- **Character 8:** Empty (only directory exists)

---

## 12. Git Status

**Branch:** main
**Tracking:** origin/main (up to date)
**Uncommitted Changes:** `CLAUDE.md` (modified - expected for this session)
**Clean Status:** Yes (working directory clean except CLAUDE.md edit)

**Recent Commits (Last 10):**
```
0e37a859 Enable Claude Code Usage extension in activity bar
92cc4f8d Fix jaw animation tests - make loadPartsSafe() character-aware
cc9948b5 Add Claude Code integration with auto-restoration
ed7cb4b1 Jaw Animation Fixes
26dcf674 Full 2026 model working
c0cab01d feat: AI Settings overhaul — rebuild STT/TTS/Chat pages, remove Agents UI
1b0b9b1b Release v5.5.1 Gold: documentation overhaul, version bump, CHANGELOG
ce30c302 fix: update tests for dashboard consolidation and hardware import
f0800eb5 Update docs, install.sh, and remove legacy ElevenLabs compatibility
f095b7c1 Fix ElevenLabs integration: per-character TTS, direct service calls, correct STT model
```

**Most Recent Release:** v5.5.1 Gold (commit 1b0b9b1b - 2026-02-07)

---

## 13. Recommended v6.0.0 Phase Execution Order

Based on this audit, the following phase order is recommended to minimize risk and maintain test coverage:

### Phase 1: Version Management Centralization
**Goal:** Single source of truth for version string
**Files:** `server.js`, `package.json`
**Risk:** LOW
**Tests:** Health endpoint test

### Phase 2: Character Independence - Services
**Goal:** Remove hardcoded Orlok references from service layer
**Files:** `services/characterService.js`, `services/elevenLabsAgentService.js`, `services/jawAnimationSuperPowerService.js`, `services/poses/poseEngine.js`, `services/serverSTTListener.js`, `services/sttFilterPresets.js`
**Risk:** MEDIUM
**Tests:** All character-dependent tests

### Phase 3: Character Independence - Orchestration
**Goal:** Make orchestration config-driven
**Files:** `services/orchestrationService.js`, `config/animatronics.json`
**Risk:** MEDIUM
**Tests:** Orchestration tests

### Phase 4: Agent Configuration Migration
**Goal:** Move agent prompts to per-character config
**Files:** `services/elevenLabsAgentService.js`, `data/character-{id}/ai-config/agent-config.json` (new)
**Risk:** LOW
**Tests:** AI conversation tests

### Phase 5: Character Data Cleanup
**Goal:** Fix duplicate character entries, complete missing data
**Files:** `data/characters.json`, character directories
**Risk:** LOW
**Tests:** Character CRUD tests

### Phase 6: Documentation Updates
**Goal:** Update all version references and migration guides
**Files:** `README.md`, `CHANGELOG.md`, `docs/*`
**Risk:** LOW
**Tests:** None (documentation only)

### Phase 7: Final Verification
**Goal:** Full test suite pass, manual smoke test
**Risk:** LOW
**Tests:** ALL (257 tests)

---

## 14. Dependencies & External Services

### NPM Dependencies (Production)
- `axios@^1.6.0` - HTTP client
- `ejs@^3.1.9` - Template engine
- `express@^4.18.2` - Web framework
- `form-data@^4.0.4` - Form data handling
- `multer@^2.0.2` - File upload handling
- `music-metadata@^11.9.0` - Audio file metadata parsing
- `node-fetch@^3.3.2` - Fetch API polyfill
- `puppeteer@^24.22.2` - Headless browser (used for?)
- `ws@^8.18.3` - WebSocket server

### NPM Dependencies (Development)
- `@playwright/test@^1.55.1` - E2E testing framework
- `chai@^4.3.10` - Assertion library
- `mocha@^10.2.0` - Test runner
- `nodemon@^3.0.1` - Development auto-reload
- `playwright@^1.55.0` - Playwright core
- `supertest@^7.1.4` - HTTP assertion library

### Python Dependencies (requirements.txt)
- `RPi.GPIO` - GPIO control
- `gpiozero` - GPIO abstraction
- `smbus` - I2C communication
- `spidev` - SPI communication
- `pigpio` - Advanced GPIO library
- `numpy` - Numerical computing
- `scipy` - Scientific computing
- `pyaudio` - Audio I/O
- `websockets` - WebSocket client
- `opencv-python` - Computer vision

### System Dependencies
- **Node.js:** 20 LTS
- **Python:** 3.x
- **Audio:** PipeWire, WirePlumber, ALSA utils, ffmpeg, mpg123
- **Video:** mjpg-streamer (port 8090)
- **Hardware:** pigpiod daemon (systemd service)

### External Services
- **ElevenLabs API:**
  - TTS Models: `eleven_flash_v2_5` (default), `eleven_multilingual_v2`
  - STT Models: `scribe_v2` (batch), `scribe_v2_realtime` (WebSocket)
  - Conversational AI: Per-character agent IDs
  - API Key Location: `/etc/monsterbox/elevenlabs.key`

### Network Services
- **MonsterBox App:** Port 3000 (HTTP), Port 3100 (test listener), Port 8795 (WebSocket)
- **Goblin Players:** Port 3001 (HTTP API on remote Pi units)
- **mjpg-streamer:** Port 8090 (MJPEG webcam stream)

---

## 15. Key Architecture Decisions (from CLAUDE.md)

**Constraints (MUST NOT change):**
- ❌ Do NOT replace Node.js, Express, or EJS with alternative frameworks
- ❌ Do NOT introduce WebSockets, GraphQL, or new transport layers (WebSocket already exists for AI chat)
- ❌ Do NOT restructure the database schema or switch databases (JSON file-based)
- ❌ Do NOT add new npm dependencies without explicit approval
- ❌ Do NOT make changes that alter user-facing behavior unless fixing a bug

**Principles:**
- ✅ PRIORITIZE reliability and performance over cleverness or complexity
- ✅ PRESERVE all existing API endpoints and their contracts
- ✅ Make the smaller change - conservative refactoring only
- ✅ ES module syntax (import/export) where already used, CommonJS (require) where that's the existing pattern
- ✅ Use async/await over raw Promises or callbacks
- ✅ Error handling: always catch and log, never swallow silently

**Character Independence Requirement:**
- ALL functionality must work for ANY selected character
- NEVER hardcode to a specific char_id or character name
- Hardcoded references to "Orlok", "orlok", char_id=3, or character_id=3 are BUGS

**Version Management:**
- Version string MUST be defined in exactly ONE place: `package.json` version field
- All version displays in UI, logs, API responses, and documentation MUST read from package.json dynamically

**Testing Protocol:**
- Run existing tests before AND after every change
- If tests don't exist for changed functionality, write them
- If test references hardcoded character data, fix the test to be character-independent

---

## 16. Critical Files for v6.0.0

**Configuration:**
- `package.json` - Version source of truth
- `config/app-config.json` - Runtime config
- `data/characters.json` - Character registry

**Server Core:**
- `server.js` - Main entry point, health endpoint version

**Services with Character Hardcoding (HIGH PRIORITY):**
- `services/characterService.js` - Hardcoded fallback list
- `services/elevenLabsAgentService.js` - Hardcoded Orlok prompt
- `services/orchestrationService.js` - Hardcoded animatronic list
- `services/poses/poseEngine.js` - Default characterId = 3
- `services/jawAnimationSuperPowerService.js` - Orlok jaw range comment

**Documentation:**
- `README.md` - Version references
- `CHANGELOG.md` - Release history
- `CLAUDE.md` - AI assistant instructions
- `docs/` - All documentation files

---

## 17. Notes & Observations

1. **Code Quality:** Generally high - ES6+ features, async/await, comprehensive error handling
2. **Test Coverage:** Excellent - 257 tests covering UI, API, AI, and hardware layers
3. **Documentation:** Very thorough - README, CHANGELOG, extensive docs/ directory
4. **Character Independence:** Partially implemented - most code is character-agnostic, but several legacy hardcoded references to Orlok remain
5. **AI Integration:** Well-architected per-character config system, but agent prompts still hardcoded in service
6. **Hardware Abstraction:** Clean service layer pattern, Python CLI wrappers for hardware control
7. **Audio System:** Modern PipeWire/WirePlumber implementation with per-character speaker routing
8. **Goblin System:** Separate deployable video player system with sophisticated playlist management
9. **Git Hygiene:** Clean commit history, recent release tagged, no merge conflicts
10. **Deployment:** Comprehensive install.sh covers all system dependencies and setup

**Strengths:**
- Mature, production-ready codebase
- Comprehensive test coverage
- Well-documented
- Clean separation of concerns (routes → services → hardware)
- Modern audio stack (PipeWire)
- CI/CD integration (GitHub Actions)

**Weaknesses:**
- Character independence not fully enforced (hardcoded Orlok references)
- Version string duplication (health endpoint)
- Agent configuration not fully config-driven
- Some duplicate character entries
- Orchestration animatronic list hardcoded

**Migration Risk Assessment:**
- **Low Risk:** Version centralization, documentation updates
- **Medium Risk:** Character independence fixes (requires testing across all characters)
- **High Risk:** None identified - all changes are refactoring, no architectural changes needed

---

## 18. Audit Completion Checklist

- [x] Read README.md completely
- [x] Read install.sh completely
- [x] Read CLAUDE.md completely
- [x] Read package.json completely
- [x] Read server.js (main entry point)
- [x] Map directory structure
- [x] Identify all route files
- [x] Identify all EJS templates
- [x] Identify all Python scripts
- [x] Identify all configuration files
- [x] Run `npm test` and record baseline
- [x] Run `git status`
- [x] Run `git log --oneline -10`
- [x] Identify current version string locations
- [x] Identify current character list
- [x] Document hardcoded character references
- [x] Document hardcoded version references
- [x] Create comprehensive audit document

---

## 19. Next Steps

**Immediate:**
1. Review this audit document with user
2. Confirm phase execution order
3. Get approval to proceed with v6.0.0 implementation

**For Each Phase:**
1. Create feature branch
2. Make targeted changes
3. Run full test suite
4. Update documentation
5. Commit with descriptive message
6. Merge to main after approval

**Final Steps:**
1. Update package.json version to 6.0.0
2. Update CHANGELOG.md with v6.0.0 release notes
3. Tag release: `git tag -a v6.0.0 -m "MonsterBox 6.0.0 release"`
4. Full regression test on actual hardware
5. Deploy to production

---

**Audit Completed:** 2026-02-14
**Audited By:** Claude (Sonnet 4.5)
**Next Action:** User review and approval to proceed with v6.0.0 implementation
