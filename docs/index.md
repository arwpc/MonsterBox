# MonsterBox

**Animatronic Control and Media System for Raspberry Pi 4B**

MonsterBox is a single-node animatronic control platform that drives Halloween characters with real hardware — servos, motors, linear actuators, lights, and sensors — all managed through a browser-based interface.

## Features

- **PipeWire + WirePlumber audio** — multiple speakers/microphones, per-stream routing
- **MJPEG webcam streaming** via mjpg-streamer (port 8090)
- **Real hardware control** for servos, motors, linear actuators, lights, sensors, and steppers
- **ElevenLabs AI integration** for text-to-speech, speech-to-text, and Conversational AI
- **Goblin video display subsystem** for Pi 3B+/4B signage playback
- **GitHub Actions CI** for automated testing on every commit
- **19 UI themes** including dark mode and Bootswatch themes
- **Animation Studio** — unified three-panel interface for scene and pose editing
- **Jaw Animation v2** — real-time audio-synchronized jaw movement
- **Head Tracking** — servo-based camera tracking via OpenCV

## Characters

| ID | Name | IP Address | Status |
|----|------|------------|--------|
| 1 | PumpkinHead | 192.168.8.150 | Active |
| 2 | Coffin Breaker | 192.168.8.140 | Active |
| 3 | Orlok | 192.168.8.120 | Primary dev |
| 4 | Skulltalker | 192.168.8.130 | Offline |
| 7 | Groundbreaker | 192.168.8.200 | Active |
| 8 | Spinster | — | New build |

## Key URLs

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Main operator interface with draggable panels |
| Animation Studio | `/scenes` | Three-panel scene and pose editor |
| Pose Editor | `/poses/editor` | Visual part positioning |
| Calibration | `/setup/calibration` | Servo/motor/actuator calibration |
| Jaw Animation | `/setup/jaw-animation` | Real-time jaw sync setup |
| AI Settings | `/ai-settings` | ElevenLabs voice configuration |
| Goblin Management | `/goblin-management` | Video display control |
| System | `/setup/system` | System settings and diagnostics |

## Quick Start

```bash
git clone git@github.com:arwpc/MonsterBox.git
cd MonsterBox
npm ci
MB_TEST_MODE=1 npm start
# Dashboard: http://localhost:3000
```

For full installation on Raspberry Pi 4B, see the [Installation Guide](install.md).

## Links

- **GitHub:** [github.com/arwpc/MonsterBox](https://github.com/arwpc/MonsterBox)
- **Documentation:** [arwpc.github.io/MonsterBox](https://arwpc.github.io/MonsterBox/)
- **Stack:** Node.js, Express, EJS, Python, Bootstrap 5
