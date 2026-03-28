# MonsterBox

**Animatronic Control and Media System for Raspberry Pi 4B**

MonsterBox is a single-node animatronic control platform that drives Halloween characters with real hardware — servos, motors, linear actuators, lights, and sensors — all managed through a browser-based interface.

## Features

- **Dashboard** — Unified operator interface with draggable panels, Ask AI / Say This unified input, real-time Lurk Mode with green hardware activity badges
- **PipeWire + WirePlumber audio** — multiple speakers/microphones, per-stream routing, browser speaker bridge
- **MJPEG webcam streaming** via mjpg-streamer (port 8090)
- **Real hardware control** for servos, motors, linear actuators, lights, sensors, and steppers
- **Batch PCA9685 servo commands** — instant multi-servo pose execution via single I2C call
- **ElevenLabs AI integration** for text-to-speech (v3), speech-to-text, and Conversational AI
- **Goblin video display subsystem** for Pi 3B+/4B signage playback
- **GitHub Actions CI** for automated testing on every commit
- **19 UI themes** including dark mode and Bootswatch themes
- **Animation Studio** — unified three-panel interface for scene and pose editing
- **Jaw Animation v2** — real-time audio-synchronized jaw movement with persistent servo daemon
- **Head Tracking** — servo-based camera tracking via OpenCV with scanning sweep and click-to-track
- **Lurk Mode** — one-toggle activation of all superpowers with motion sensor sleep/wake
- **Movement System** — smooth servo transitions, priority-based claims, idle loop, telemetry
- **Comprehensive tooltips** — contextual help on every control across all pages

## Characters

| ID | Name | IP Address | Status |
|----|------|------------|--------|
| 1 | PumpkinHead | 192.168.8.150 | Active |
| 2 | Mina | 192.168.8.140 | Active |
| 3 | Orlok | 192.168.8.120 | Primary dev |
| 4 | Sir Dragomir | 192.168.8.130 | Offline |
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
| Head Animation | `/setup/head-animation` | Head tracking & motion detection |
| Audio Library | `/audio-library` | Audio file management |
| Video Library | `/video-library` | Video file management |
| System | `/setup/system` | System settings, telemetry, diagnostics |

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
