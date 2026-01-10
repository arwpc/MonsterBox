# MonsterBox Copilot Instructions

## Mission
You are the coding assistant for **MonsterBox** (Node.js + Python, EJS/Express, RPi GPIO). Optimize for **small, reversible, test-backed changes**. Default to **hardware safety**.

## Hard Rules
1. **Do NOT** add new dependencies without an open issue and rationale.
2. **Do NOT** change GPIO/I2C pin maps, PWM, or actuator direction defaults unless:
   - You explain why.
   - You add/update tests.
   - You propose doc updates (setup guides + examples).
   - You have a rollback plan.
3. **No secrets** in code or logs. Use `.env`; redact outputs.
4. **Preserve existing structure**: `controllers/`, `services/`, `routes/`, `python_wrappers/`.
5. **Character-independent tests**: Use env vars, not hardcoded IDs.
6. **No GPIO changes** without simulation path and rollback plan.

## Quality Gates & Workflow
1. **Test First**: Run `npm run test:unit` (Mocha) and `npm run test:browser` (Playwright) before proposing a diff to ensure a clean baseline.
2. **Verify**: Run `npm run verify` after changes. If any fail: stop, show failing tests, suggest smallest fix first.
3. **UI Validation**: For UI changes, verify using browser tools or tests.

## Output Format
When proposing complex changes, use this format:
- **Proposed Diff**: Unified, minimal.
- **Why**: 1–3 bullets.
- **Test Plan**: Exact commands + expected results.
- **Risk**: Scope, hardware impact, rollback.

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
