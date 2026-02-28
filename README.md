# MonsterBox - Animatronic Control and Media System

MonsterBox is a single-node animatronic control system for Raspberry Pi 4B with:
- PipeWire + WirePlumber audio (multiple speakers/microphones, per-stream routing)
- MJPEG webcam streaming via mjpg-streamer (port 8090)
- Real hardware control for servos, motors, linear actuators, lights, sensors, steppers
- ElevenLabs AI integration for STT, Conversational AI, and TTS
- Goblin video display subsystem for Pi 3B+/4B signage playback
- GitHub Actions CI for automated testing on every commit

This README provides an accurate quick-start and operational overview and links to detailed docs in /docs. The full historical README (~2,640 lines) is preserved in Git history (see docs/archive/README_5.3_HISTORICAL_POINTER.md).

## What's New — v6.7.7 (February 2026)

### Consistency Audit & CI Fixes
- **Dead code removed** — Orphaned services (`characterAudioConfigService`, `microphoneService`), deprecated 410 conversation endpoints, and their routes/tests cleaned up
- **All CI pipelines green** — Added ffmpeg to GitHub Actions, fixed test assertions for CI, hardware-dependent tests auto-skip in CI
- **MkDocs documentation expanded** — 40+ docs now in navigation, Help link added to MonsterBox navbar
- **Full documentation** at [arwpc.github.io/MonsterBox](https://arwpc.github.io/MonsterBox/)

### Previous: v6.1.5 (February 2026)

### Jaw Animation v2: Real-Time Audio-Synchronized Jaw Control
- **Persistent Servo Daemon**: Long-running Python process for PCA9685 I2C control replaces per-frame Python spawns (~580ms → <1ms per servo command)
- **Pre-Analysis Engine**: Complete audio analysis before playback using ffmpeg bandpass filter (500-2500Hz speech formants), AGC, and quantization to discrete jaw positions
- **Synchronized Playback**: `playWithJawSync()` pre-analyzes entire audio file, then plays audio and jaw timeline in parallel with drift-correcting scheduling — eliminates the 100-500ms desync
- **Scene Integration**: `sayThis`, `askAI`, and `audio` scene steps now automatically sync jaw movement during TTS/audio playback
- **Speech Filter**: Bandpass filter isolates 500-2500Hz speech formant range — eliminates erratic jaw movement from bass/sibilants
- **Auto Gain Control (AGC)**: Automatically normalizes audio peak to 0.8 — no manual sensitivity tuning per audio file
- **Quantization**: Discrete jaw positions (5-20 configurable levels) for more natural animatronic movement
- **Timeline Visualization**: Canvas-based jaw position preview on setup page after TTS test
- **Presets**: Speech, Music, Custom presets for quick configuration of filter/AGC/quantization settings
- **20ms Frame Rate**: Matches PCA9685's 50Hz PWM update rate (was 50ms)

### Previous: v6.1.2 — Audio Stack Overhaul

### Previous: v6.1.1 — Bootswatch Themes, PIR Sensor Fix, Calibration Refactor

### Previous: v6.1.0 — Animation Studio
- **Unified three-panel interface** at `/scenes` replaces separate Scenes, Scene Editor, and Poses pages
- Left: Scene Library (search/filter), Pose Library (by category), Queue (play/loop/pause/skip)
- Center: Timeline editor with color-coded step blocks, inline editing, SortableJS drag-reorder
- Right: Webcam live preview, Part Palette (grouped by type), quick-add Action palette
- Toolbar with Jaw Animation and Head Tracking toggles, Emergency Stop, Ctrl+S save
- 14 scene step types including new **jaw-animation** and **head-tracking** steps
- Drag-and-drop from palette to timeline, scenes to queue, poses to timeline

### Route Consolidation
- `/setup/poses` and `/poses` now redirect to Animation Studio; JSON APIs preserved
- Navigation shows single "Animation Studio" link under Activities

### Testing (v6.1.0)
- **174 passing** (browser + system + unit), 7 skipped, 2 pre-existing failures
- 10 new system tests for jaw-animation/head-tracking step types
- 18 updated browser tests for Animation Studio UI

### Previous: v6.0.0 — Character Independence & Dynamic Versioning
- All hardcoded character names and ID defaults removed
- Version sourced from `package.json` everywhere
- `MB_TEST_MODE=1` flag for safe testing without hardware init

## Quick Start (RPi4B)
```bash
# 1) Install system dependencies (PipeWire, WirePlumber, mjpg-streamer, pigpio, ffmpeg)
#    Use the deployment guide for exact package set
# 2) Clone and install Node deps
git clone git@github.com:arwpc/MonsterBox.git
cd MonsterBox
npm ci

# 3) Start (dev)
MB_TEST_MODE=1 npm start
# Dashboard: http://localhost:3000
```

Systemd service and production boot guidance: docs/deployment/README.md

## Key Services and Ports
- MonsterBox app: :3000 (HTTP)
- Real-time chat WS (conversation): :8795
- Webcam (mjpg-streamer): :8090
- Goblin player API (on Goblins): :3001

## Audio (PipeWire/WirePlumber)
Goals: device-first routing (avoid hw: directly), VU meters, server-side microphone/STT and speaker/TTS per Character.

- Device enumeration (server):
```bash
wpctl status
pactl list short sinks
pactl list short sources
```
- Health endpoints (server):
```bash
curl http://localhost:3000/api/audio/health
curl http://localhost:3000/api/audio/info
```
- TTS test (plays on Character's assigned speaker):
```bash
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from MonsterBox","characterId":3}'
```

More: docs/characters/ORLOK_AUDIO_TEST_RESULTS.md and docs/deployment/README.md

## Webcam (MJPEG) - Verification
Always verify actual image bytes, not just service status.

- Check headers:
```bash
curl -s -D - http://localhost:8090/?action=stream | sed -n '1,10p'
```
- Check MJPEG boundary and JPEG data:
```bash
curl -s http://localhost:8090/?action=stream | dd bs=1k count=64 2>/dev/null | \
  (grep -a -m1 -E -- '--|Content-Type: image/jpeg' -n || hexdump -C | head -n 8)
```

## Calibration and Controls
- Calibration panels shown only for **movement parts**: servos, motors, linear actuators, steppers
- Non-movement parts (webcam, microphone, speaker, light, sensor) show type-specific controls only — no calibration UI
- Guardrails: Jaw Animation and Head Tracking respect Min/Max
- **Clear Calibration**: Remove calibration data for individual parts or all parts of current character
  - Individual Clear: Click "Clear" button in calibration panel (removes min/max/presets for selected part)
  - Clear All: Click "Clear All Calibrations" button next to mode toggle (clears all parts of current character)

Open: http://localhost:3000/setup/calibration

## Jaw Animation v2 (Super Power)

Jaw Animation v2 drives a servo to match speech amplitude in real-time, producing lifelike mouth movement during TTS playback. Uses a persistent Python servo daemon (<1ms per command), complete audio pre-analysis with speech bandpass filtering, and synchronized playback scheduling.

**Architecture:**
1. **Persistent Servo Daemon** (`python_wrappers/jaw_servo_daemon.py`): Long-running Python process initializes PCA9685 I2C bus once, accepts JSON commands via stdin. Managed by `services/jawServoDaemon.js`.
2. **Pre-Analysis Engine**: Before playback, entire audio is decoded and analyzed:
   - ffmpeg bandpass filter isolates 500-2500Hz speech formants
   - 20ms RMS frames (matching PCA9685 50Hz PWM rate)
   - AGC normalizes peak amplitude automatically
   - Quantization snaps to N discrete jaw positions (default 10)
   - Attack/release envelope for natural motion
3. **Synchronized Playback** (`playWithJawSync()`): Pre-analyzes complete audio, starts playback and jaw timeline simultaneously with drift-correcting setTimeout scheduling.
4. **Scene Integration**: `sayThis`, `askAI`, and `audio` scene steps auto-sync jaw when enabled.

**Configuration** (`data/character-{N}/super-powers.json`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Enable jaw animation |
| `servoPartId` | — | Part ID of the jaw servo (from `parts.json`) |
| `sensitivity` | `4` | Amplitude multiplier (higher = more responsive) |
| `smoothing` | `0.2` | EMA smoothing factor (0=max smooth, 1=raw) |
| `volumeThreshold` | `0.02` | Minimum amplitude to register (noise gate) |
| `attackTime` | `30` | Max degrees/frame when opening (ramp limiter) |
| `releaseTime` | `80` | Max degrees/frame when closing (ramp limiter) |
| `minAngle` | `70` | Servo closed position (degrees) |
| `maxAngle` | `93` | Servo open position (degrees) |
| `useBandpassFilter` | `true` | Enable 500-2500Hz speech filter (v2) |
| `useAGC` | `true` | Automatic gain control (v2) |
| `quantizationLevels` | `10` | Discrete jaw positions, 5-20 (v2) |
| `preset` | `speech` | Tuning preset: speech, music, custom (v2) |

**Presets:**
- **Speech**: Filter on, AGC on, 10 positions — optimized for TTS/conversation
- **Music**: Filter off, AGC on, 15 positions — tracks all frequencies
- **Custom**: Manual control of all parameters

**Setup Page:** `http://localhost:3000/setup/jaw-animation`

**API:**
```bash
# Save jaw config for character 3 (v2 fields)
curl -X POST http://localhost:3000/setup/jaw-animation/api/jaw-animation/3 \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"servoPartId":"10","sensitivity":4,"smoothing":0.2,"volumeThreshold":0.02,"attackTime":30,"releaseTime":80,"useBandpassFilter":true,"useAGC":true,"quantizationLevels":10,"preset":"speech"}'

# Drive jaw to specific amplitude (0.0-1.0)
curl -X POST http://localhost:3000/setup/jaw-animation/api/jaw-animation/3/drive \
  -H "Content-Type: application/json" -d '{"amplitude":0.5}'

# Poll real-time audio levels during playback
curl http://localhost:3000/setup/jaw-animation/api/jaw-animation/3/audio-levels

# Test TTS with jaw drive (returns timeline for UI visualization)
curl -X POST http://localhost:3000/setup/jaw-animation/api/jaw-animation/3/test-tts \
  -H "Content-Type: application/json" -d '{"text":"Hello from the animatronic"}'
```

**Key Files:**
- `python_wrappers/jaw_servo_daemon.py` — Persistent PCA9685 daemon
- `services/jawServoDaemon.js` — Daemon lifecycle manager
- `services/jawAnimationSuperPowerService.js` — Pre-analysis, sync playback, config
- `routes/setup/jaw-animation.js` — API routes
- `views/setup/jaw-animation.ejs` — Setup UI with presets and timeline canvas
- `public/js/jaw-animation.js` — Client-side controls (ES5 IIFE)

## AI Management (ElevenLabs)

All AI voice services run through **ElevenLabs** (single provider, single API key).

### Models
| Service | Model | Use Case |
|---------|-------|----------|
| TTS | `eleven_flash_v2_5` | Character voice (default, ~75ms latency) |
| TTS | `eleven_multilingual_v2` | Narration / high-quality |
| STT | `scribe_v2` | File-based transcription |
| STT | `scribe_v2_realtime` | Real-time streaming via WebSocket |

### Architecture
- **Per-character config**: `data/character-{N}/ai-config/tts-config.json` and `stt-config.json`
- **Three sections**: STT settings, AI Agent (Conversational AI), TTS voice config
- **Microphone**: Server-side via PipeWire (not `getUserMedia`)
- **Audio format**: 16 kHz mono PCM, 20-40 ms frames
- **Conversation**: Real-time WebSocket on port 8795 with barge-in support

### API Quick Test
```bash
# Generate speech with character's configured voice
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from MonsterBox","characterId":3}'

# Check STT capabilities
curl http://localhost:3000/api/elevenlabs/stt/capabilities

# Realtime STT status
curl http://localhost:3000/api/elevenlabs/stt/realtime/status
```

Docs: docs/development/AI-Management-Feature.md, docs/integration/ELEVENLABS_INTEGRATION.md

## Goblin - Video Display System

**Goblin** is MonsterBox's video playback system for Raspberry Pi 3B+/4B units acting as dedicated video displays for Halloween effects and animatronic sequences.

**Architecture:**
- **MPV-based**: Direct video playback using MPV with DRM/KMS output
- **Hardware Decoding**: v4l2m2m-copy for Pi3 hardware acceleration
- **Queue Management**: Video queues with loop modes (single, queue, off)
- **REST API**: HTTP API for remote control and immediate playback
- **MonsterBox Integration**: Full integration with playlist management and Step execution

**Video Format (Standardized):**
- **Resolution**: 720p (1280x720) @ 30fps
- **Codec**: H.264 in MP4 container
- **Directory**: `/home/remote/media/video/` (all Goblins)
- **Playback**: `--video-sync=display-vdrop` for smooth 30fps on 60Hz displays

**Goblin API:**
```bash
# Immediate playback (for Steps - interrupts queue, returns after)
curl -X POST http://GOBLIN_IP:3001/api/video/play-immediate \
  -H "Content-Type: application/json" \
  -d '{"filename":"fireball.mp4","returnToQueue":true}'

# Queue management
curl -X POST http://GOBLIN_IP:3001/queue/add -d '{"filename":"video.mp4"}'
curl -X POST http://GOBLIN_IP:3001/queue/start -d '{"loopMode":"queue"}'
curl -X POST http://GOBLIN_IP:3001/queue/stop

# Video library scanning
curl http://GOBLIN_IP:3001/api/videos/scan

# Status
curl http://GOBLIN_IP:3001/api/status
curl http://GOBLIN_IP:3001/health
```

**MonsterBox Integration:**

*Services:*
- `goblinManagerService` - Registration, monitoring, playback control
- `goblinVideoService` - Video scanning, metadata caching
- `goblinPlaylistService` - Playlist CRUD and deployment

*Features:*
- **Goblin Management UI** (`http://localhost:3000/goblin-management`):
  - Real-time status monitoring for all Goblins
  - Double-click any Goblin card to open video queue modal
  - Browse and search 57+ videos from `/home/remote/media/video`
  - Add videos to queue or play immediately
  - Queue controls: Start, Stop, Clear, Skip
  - Save/Load/Distribute playlists across all Goblins
  - Real-time playback status updates
- Scan video libraries from all Goblins (`/goblin-management/api/goblins/scan-all-videos`)
- Create/edit/delete playlists (UI or API)
- Deploy playlists to one or all Goblins
- Trigger immediate video playback from Steps (e.g., fireball effect during spell-casting)

*Step Integration:*
```javascript
{
  "type": "goblin-video",
  "goblinId": "goblin-three",
  "videoId": "fireball.mp4",
  "returnToQueue": true
}
```

*Pre-configured Playlists:*
- **Spinster**: Character videos for Spinster animatronic
- **Fire**: Fire-themed videos (541-560 series)
- **Poltergeist**: Character videos for Poltergeist animatronic
- **Test**: Sample videos for testing playback

**Deployment:**
Goblin is deployed via "Facehugger" system in Goblin Management:
1. Package Goblin files
2. SCP to target Goblin
3. Install systemd service
4. Start playback automatically

**Current Status:**
- ✅ Goblin3 (192.168.8.14) - Operational, tested immediate playback
- ⏳ Goblin1 (192.168.8.40) - Pending deployment
- ⏳ Goblin2 (192.168.8.106) - Offline

See: `goblin/`, `docs/GOBLIN_VIDEO_INTEGRATION.md`

## Network and Roles (MonsterNet)
**Animatronics:**
- PumpkinHead (Character 1): 192.168.8.150
- Coffin Breaker (Character 2, controller): 192.168.8.140
- Orlok (Character 3): 192.168.8.120
- Skulltalker (Character 4): 192.168.8.130 ⚠️ Currently offline
- Groundbreaker (Character 5): 192.168.8.200

**Goblins (Video Display):**
- Goblin One: 192.168.8.40:3001 ⏳ Pending deployment
- Goblin Two: 192.168.8.106:3001 ⏳ Offline
- Goblin Three: 192.168.8.14:3001 ✅ Operational

SSH for RPi4B: see docs/security/remote-access.md

## Testing

MonsterBox has comprehensive test coverage across system, unit, and browser tests.

### Test Results (v6.1.5 - February 2026)

| Suite | Framework | Passing | Skipped | Failing |
|-------|-----------|---------|---------|---------|
| System + Unit | Mocha | 255 | — | 0 |
| Browser E2E (9 spec files) | Playwright | 190 | 7 | 0 |

All tests passing. Pre-existing intermittent failures (calibration timeout, VU meter hardware) resolved.

```bash
# Run all tests
npm test

# Individual suites
npm run test:system         # Mocha system tests
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser tests (headless Chromium)
npm run test:hardware       # Hardware tests (needs real GPIO)
npm run verify              # system + unit + browser
```

## Troubleshooting Quick Commands
```bash
# App logs (systemd)
journalctl -u monsterbox -f

# Port conflicts
sudo lsof -i :3000 || sudo fuser -k 3000/tcp

# GPIO sanity
python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); print('GPIO OK')"
```

## Documentation Index

### Core
- [CHANGELOG.md](CHANGELOG.md) — Release history
- [Deployment Guide](docs/deployment/README.md) — Systemd, SSH, production setup

### AI & Audio
- [ElevenLabs Integration](docs/integration/ELEVENLABS_INTEGRATION.md) — Architecture, services, per-character config
- [AI Management Feature](docs/development/AI-Management-Feature.md) — UI, models, agent setup
- [AI Integration Guide](docs/development/ai-integration-guide.md) — Developer reference

### Hardware
- [Hardware Integration](docs/integration/Hardware-Integration-Layer-Interfaces.md) — Service layer, adapters
- [GPIO Assignments](docs/hardware/gpio_assignments.md) — Pin mappings
- [Legacy Hardware Config](docs/hardware/legacy_hardware_config_reference.md) — Historical reference

### Setup & Calibration
- [Animatronic Setup Guide](docs/setup/ANIMATRONIC-SETUP-GUIDE.md) — Full setup walkthrough
- [Linear Actuator Calibration](docs/setup/LINEAR_ACTUATOR_CALIBRATION.md) — Calibration procedure
- [STT Tuning Guide](docs/setup/STT_TUNING_GUIDE.md) — Speech-to-text optimization

### Characters
- [Groundbreaker Setup](docs/characters/GROUNDBREAKER_SETUP_INSTRUCTIONS.md)
- [PumpkinHead Parts](docs/characters/PUMPKINHEAD_COMPLETE_PARTS_LIST.md)

### Goblin Video System
- [Goblin Video Integration](docs/integration/GOBLIN_VIDEO_INTEGRATION.md) — Deployment, API, playlists

### Testing
- [Testing Overview](docs/testing/index.md) — All test categories
- [Test Organization](docs/testing/organization.md) — Directory structure
- [Deep Testing Framework](docs/testing/DEEP-TESTING-FRAMEWORK-SUMMARY.md) — Playwright framework

### Security
- [Remote Access](docs/security/remote-access.md) — SSH, access control
- [Authentication](docs/security/authentication.md) — Auth mechanisms


## Historical Hardware Reference
For debugging connection issues or restoring older hardware configurations, see: [docs/hardware/legacy_hardware_config_reference.md](docs/hardware/legacy_hardware_config_reference.md).
