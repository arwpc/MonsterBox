# MonsterBox Copilot Instructions

Mission: make small, reversible, test-backed changes; prioritize hardware safety.

## Architecture Overview

MonsterBox is a **distributed animatronic control system** for Halloween props:
- **Central Hub** (this codebase): Express.js server on RPi 4B managing all animatronics
- **Animatronics** (5 nodes): RPi units at fixed IPs (192.168.8.x) each controlling servos, motors, actuators, lights via GPIO/I2C
- **Goblins** (video displays): RPi 3B+/4B units running MPV for video playback (port 3001)
- **AI Integration**: ElevenLabs for STT/TTS, conversation mode with real-time WebSocket audio

Key data flow: `routes/` -> `services/` -> `python_wrappers/` -> GPIO/PCA9685 hardware

## Critical Conventions

### Hardware Control
- **Python wrappers**: All GPIO/PWM commands execute via `python_wrappers/*_cli.py` scripts called from `services/hardwareService/exec.js`
- **Test mode safety**: Set `MB_TEST_MODE=1` to stub hardware calls in CI; only skips real hardware when also in CI (`process.env.CI=true`)
- **Part types**: servo, motor, stepper, led, light, linear_actuator, sensor, motion_sensor, microphone, speaker, webcam
- **Calibration data**: Stored per-character in `data/calibration_profiles.json` and `data/character-{id}/`

### Data Model
- Characters: `data/characters.json` (id, name, elevenLabsAgentId)
- Parts: `data/parts.json` (type, config, characterId)
- Scenes/Steps: `data/character-{id}/scenes.json` - steps execute parts in sequence
- Poses: `data/character-{id}/poses.json` - named servo positions

### API Pattern
All routes return `{ success: boolean, ...data }` or `{ success: false, error: string }`:
```javascript
// Example from routes/api/sceneEditorApi.js
res.json({ success: true, parts: parts });
res.status(500).json({ success: false, error: 'Failed', message: error.message });
```

## Commands

```bash
npm ci                              # Install dependencies
MB_TEST_MODE=1 npm start            # Dev server at :3000
npm run test:unit                   # Mocha unit tests
npm run test:browser                # Playwright browser tests
npm run verify                      # Full test suite (unit + browser)
MONSTERBOX_HARDWARE_AVAILABLE=1 npm run test:hardware  # Real hardware tests
```

## Environment Flags

| Flag | Purpose |
|------|---------|
| `MB_TEST_MODE=1` | Stub external APIs/hardware in CI |
| `MONSTERBOX_HARDWARE_AVAILABLE=1` | Enable hardware tests on real RPi |
| `MB_NO_MCP=1` | Disable MCP tool calls |
| `PORT=3123` | Playwright test port (auto-set) |

## Key Service Patterns

- **Orchestration** (`services/orchestrationService.js`): Broadcasts commands to all animatronics via HTTP/SSH
- **Hardware** (`services/hardwareService/`): `runWrapper()` executes Python CLI scripts; returns JSON output
- **Audio** (`services/pipewireService.js`, `serverPlaybackService.js`): PipeWire/WirePlumber routing, VU meters
- **Goblin** (`services/goblinManagerService.js`): Video queue management, playlist deployment to display units

## Testing Notes

- Playwright tests run Chromium, single worker, sequential (`playwright.config.js`)
- Browser tests validate console errors and HTTP 5xx as failures - avoid noisy logs
- Create tests in `tests/unit/*.test.js` (Mocha/Chai) or `tests/browser/*.spec.js` (Playwright)

## Hard Rules

1. **No GPIO changes** without simulation path and rollback plan
2. **No new dependencies** without explicit rationale
3. **No secrets** in repo (use `.env`, see `.env.example`)
4. **Character-independent tests**: Use env vars, not hardcoded IDs

## Key Files Reference

| Purpose | Location |
|---------|----------|
| Server entry | `server.js` |
| Route mounting | `routes/`, `routes/api/`, `routes/setup/` |
| Hardware control | `services/hardwareService/index.js` |
| Python GPIO scripts | `python_wrappers/*_cli.py` |
| Test setup | `tests/README.md`, `playwright.config.js` |
| Deployment docs | `docs/deployment/README.md` |

## See Also

- **[README.md](../README.md)** - Operational quick-start, ports (3000, 8090, 8795, 3001), curl examples, PipeWire/webcam verification
- **[docs/deployment/README.md](../docs/deployment/README.md)** - Systemd services, production setup, Pi-specific configuration
