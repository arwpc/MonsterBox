# MonsterBox 5.3 - Animatronic Control and Media System

MonsterBox 5.3 is a single-node animatronic control system for Raspberry Pi 4B with:
- PipeWire + WirePlumber audio (multiple speakers/microphones, per-stream routing)
- MJPEG webcam streaming via mjpg-streamer (port 8090)
- Real hardware control for servos, motors, linear actuators, lights, sensors, steppers
- ElevenLabs AI integration for STT, Conversational AI, and TTS
- Goblin Gold video display subsystem for Pi 3B+/4B signage playback

This README provides an accurate quick-start and operational overview for 5.3 and links to detailed docs in /docs. The full historical README (~2,640 lines) is preserved in Git history (see docs/archive/README_5.3_HISTORICAL_POINTER.md).

## What's New / Version Notes
- Target version: MonsterBox 5.3 (October 2025)
- Runtime banner currently prints 5.2; code will be bumped separately
- Webcam stack standardized to MJPEG (mjpg-streamer) only
- Audio stack standardized to PipeWire/WirePlumber with device-based routing
- Goblin Gold MVP player added for rock-solid video playback on Goblins

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
- Goblin Gold player API (on Goblins): :3001

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

## Goblin Gold - Reliable Video Playback
Designed for Goblin displays (RPi 3B+/4B) with MPV + DRM/KMS and v4l2m2m-copy hardware decode.

- API (on Goblin):
```bash
# play a file (relative to /home/remote/goblin/media/video/)
curl -X POST http://GOBLIN_IP:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename":"Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4","loop":true}'

# stop all
curl -X POST http://GOBLIN_IP:3001/stop-all

# queue start/stop
curl -X POST "http://GOBLIN_IP:3001/queue/start?loopMode=queue"
curl -X POST http://GOBLIN_IP:3001/queue/stop
```
- Media path on Goblins: /home/remote/goblin/media/video/ (copied from USB)
- Modes auto-hinted from filenames: 720p59.94 -> display-fps 59.94, DRM mode 1280x720@59.94

See: docs/goblin-reliable-media-player-design.md and goblin-gold/systemd/goblin.service

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
- Unit tests and E2E live conversation simulations under /test
- Playwright e2e with Firefox headless on RPi4b

```bash
# Unit tests
npm test -- --run

# E2E (example)
npx playwright test --project=firefox --headless
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
- Deployment: docs/deployment/README.md
- Technical Overview: docs/MonsterBox-Technical-Overview.md
- Goblin Gold design: docs/goblin-reliable-media-player-design.md
- Orlok audio results: docs/characters/ORLOK_AUDIO_TEST_RESULTS.md
- Groundbreaker install: docs/characters/GROUNDBREAKER_INSTALLATION_COMPLETE.md
- Hardware independence prompt: docs/MonsterBox-Hardware-Independence-Prompt.md

- MonsterBox 5.3 - https://orlok

