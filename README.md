# MonsterBox 5.3 - Animatronic Control and Media System

MonsterBox 5.3 is a single-node animatronic control system for Raspberry Pi 4B with:
- PipeWire + WirePlumber audio (multiple speakers/microphones, per-stream routing)
- MJPEG webcam streaming via mjpg-streamer (port 8090)
- Real hardware control for servos, motors, linear actuators, lights, sensors, steppers
- ElevenLabs AI integration for STT, Conversational AI, and TTS
- Goblin video display subsystem for Pi 3B+/4B signage playback

This README provides an accurate quick-start and operational overview for 5.3 and links to detailed docs in /docs. The full historical README (~2,640 lines) is preserved in Git history (see docs/archive/README_5.3_HISTORICAL_POINTER.md).

## What's New / Version Notes
- Target version: MonsterBox 5.3 (October 2025)
- Runtime banner currently prints 5.2; code will be bumped separately
- Webcam stack standardized to MJPEG (mjpg-streamer) only
- Audio stack standardized to PipeWire/WirePlumber with device-based routing
- Goblin MVP player added for rock-solid video playback on Goblins

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
- Simple Calibration panels for servos, motors, linear actuators, steppers
- Guardrails: Jaw Animation and Head Tracking respect Min/Max
- Modal guidelines: use data-bs-toggle/data-bs-target; populate via JS only

Open: http://localhost:3000/setup/calibration

## AI Management (ElevenLabs)
- Three sections: STT, AI Agent, TTS
- Full CRUD and per-Character assignment; microphone tests use the server mic (PipeWire), not getUserMedia
- Best practices: 16 kHz mono PCM, 20-40 ms frames, immediate playback, barge-in support

Docs: docs/AI-Management-Feature.md, docs/development/ai-integration-guide.md

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

See: `goblin-gold/`, `docs/GOBLIN_VIDEO_INTEGRATION.md`

## Network and Roles (MonsterNet)
- Coffin (controller): 192.168.8.140
- Orlok: 192.168.8.120
- Skulltalker: 192.168.8.130
- Groundbreaker: 192.168.8.200
- PumpkinHead: 192.168.8.150
- Goblin One: 192.168.8.40:3001
- Goblin Two: 192.168.8.106:3001
- Goblin Three: 192.168.8.14:3001 (focus first)

SSH for RPi4B: remote / klrklr89!

## Testing

MonsterBox 5.3 uses a **multi-layered testing approach** optimized for Copilot-driven development:

**Testing Layers:**
1. **Unit tests** (Mocha) - Service logic, APIs, hardware abstraction
2. **E2E tests** (Playwright) - Real user workflows, UI interactions
3. **Browser MCP** - Live console validation, visual checks (via Copilot)
4. **GitHub MCP** - CI/CD automation, PR workflows (via Copilot)

**Quick Start:**
```bash
# Unit tests and E2E (recommended before commit)
npm run verify

# Unit tests only
npm run test:unit

# E2E (example)
npx playwright test --project=firefox --headless

# With Browser MCP validation info
npm run test:mcp
```

**VS Code Testing Tab:**
- Open Testing view (beaker icon)
- See all Mocha + Playwright tests in tree
- Run/debug individual tests with breakpoints
- View inline pass/fail results

**Console Error Enforcement:**
All Playwright tests automatically fail on:
- Browser console errors/warnings
- HTTP 5xx responses
- Network failures
- Invalid `/api/save` responses (must return `{success: true}`)

**Browser MCP Validation:**
For UI changes, ask Copilot to validate with Browser MCP:
```
"Navigate to /setup/calibration and check for console errors"
```
Copilot will use Browser MCP tools to:
- Load page in real browser
- Capture console messages
- Check network requests
- Take screenshots
- Report any issues

**Full Documentation:** `docs/testing/COPILOT-TESTING-STRATEGY.md`

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
- Deployment: docs/deployment/README.md
- Technical Overview: docs/MonsterBox-Technical-Overview.md
- Goblin: goblin-gold/README.md (to be created)
- Orlok audio results: docs/characters/ORLOK_AUDIO_TEST_RESULTS.md
- Groundbreaker install: docs/characters/GROUNDBREAKER_INSTALLATION_COMPLETE.md
- Hardware independence prompt: docs/MonsterBox-Hardware-Independence-Prompt.md

- MonsterBox 5.3 - https://orlok

