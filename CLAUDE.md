# MonsterBox 5.5 — Claude Code Project Context

**Project:** MonsterBox Animatronic Control System
**Platform:** Raspberry Pi 4B (4GB RAM) running Linux 6.12.62+rpt-rpi-v8
**Node.js:** v18.0.0+ (ES modules)
**Server:** Express on port 3000, systemd service (`monsterbox.service`)
**Current Character:** Orlok (character 3) at IP 192.168.8.120
**Workspace:** `/home/remote/MonsterBox`

---

## Critical Patterns & Conventions

### Code Style
- **Server-side:** Modern ES6+ (async/await, import/export, arrow functions)
- **Client-side:** **STRICT ES5 IIFE pattern** — NO ES6+ syntax in browser JS
  - Pattern: `var ModuleName = (function() { ... })();`
  - No `let`, `const`, `=>`, template literals, destructuring
  - File references: `?v=<%= Date.now() %>` for cache-busting

### File Paths & Data Structure
- Character data: `data/character-{id}/` (e.g., `data/character-3/` for Orlok)
  - `parts.json` — hardware parts (servos, actuators, sensors, speakers)
  - `super-powers.json` — feature configs (jaw animation, etc.)
- Global config: `config/app-config.json` (selectedCharacter, dataPath)
- **IMPORTANT:** APIs for character N must load from `data/character-{N}/`, NOT from the global `dataPath` in app-config.json

### API Request Formats
- **Jaw Animation Save:** POST `/api/jaw-animation/:characterId`
  - Body: raw config object `{enabled:true, servoPartId:"10", sensitivity:4, ...}`
  - **NOT wrapped** in `{jawAnimation:{...}}` — `writeJawConfig()` handles wrapping
- **Character-specific operations:** Always use `:characterId` param, never rely on global config

### Service Management
- **After editing server-side JS:** `sudo systemctl restart monsterbox.service`
- **Check status:** `sudo systemctl status monsterbox.service`
- **View logs:** `sudo journalctl -u monsterbox.service -f`

### Test Execution
- **Run tests:** `npm run test:system`, `npm run test:unit`, `npm run verify`
- **CRITICAL:** Mocha tests hang without `--exit` flag — always use it for ad-hoc runs
- **Test mode:** `MB_TEST_MODE=1` — skips hardware init, simulates servo responses
- Current status: 118 passing (system), 160 passing (unit), 0 failing

---

## Architecture

### Jaw Animation System (v5.5.2)
**Key insight:** ChatterPi-inspired synchronous fix — `driveState.angle` is set **synchronously** in each 50ms frame loop, BEFORE the async servo command fires. This ensures `/audio-levels` polling sees real-time angles.

**Data flow:**
1. Audio buffer → ffmpeg PCM decode (16kHz 16-bit mono)
2. 50ms frames → RMS amplitude calculation
3. `applySmoothingToAmplitude()` → exponential smoothing (config.smoothing)
4. `calculateJawAngle()` → maps amplitude to angle with attack/release envelope
5. Set `driveState.angle` **immediately** (synchronous)
6. Fire servo command as fire-and-forget (async, non-blocking)

**Key files:**
- `services/jawAnimationSuperPowerService.js:635` — `driveJawFromAudioBuffer()` main loop
- `routes/setup/jaw-animation.js:194` — `/audio-levels` polling endpoint
- `public/js/jaw-animation.js` — ES5 client (polls every 60ms)
- `data/character-3/super-powers.json` — Orlok's jaw config
- `data/character-3/parts.json` — Part id="10" is jaw servo (PCA9685 ch 8)

**Current config (Orlok):**
```json
{
  "enabled": true,
  "servoPartId": "10",
  "sensitivity": 4,
  "smoothing": 0.2,
  "volumeThreshold": 0.02,
  "attackTime": 30,
  "releaseTime": 80,
  "minAngle": 70,
  "maxAngle": 93
}
```

**Calibration:** Jaw servo has Min/Max/Mid markers (70°/93°/83°) in `parts.json`. Guardrails are loaded from markers, NOT from config.

### Hardware Service
- **Python wrappers:** `services/hardwareService/wrappers/` — executes GPIO control via subprocess
- **Test mode:** Detects `MB_TEST_MODE` and returns simulated responses without hardware access
- **Part types:** servo, linear_actuator, motor, light, speaker, microphone, webcam, motion_sensor
- **Controllers:** PCA9685 (servos), MDD10A (linear actuators), BTS7960 (H-bridge)

### Audio System
- **ElevenLabs TTS:** `services/elevenLabsTTSService.js` — generates speech, returns Buffer
- **Server Playback:** `services/serverPlaybackService.js` — plays audio on character's speaker
- **Jaw Drive:** `jawAnimationSuperPowerService.driveJawFromAudioBuffer()` — runs in parallel with playback
- **Audio Library:** `data/audio-library/` — uploaded MP3/WAV files for scenes

---

## Common Pitfalls

### Double-Nesting Bug
**Problem:** Sending `{jawAnimation: {enabled:true, ...}}` to save API causes `super-powers.json` to have:
```json
{"jawAnimation": {"jawAnimation": {...}}}
```
**Fix:** Always send raw config object — `writeJawConfig()` wraps it.

### loadPartsSafe() Character Resolution
**Problem:** `loadPartsSafe()` used to load from global `dataPath`, causing character 3 tests to fail (jaw servo not found).
**Fix (v5.5.2):** `loadPartsSafe(characterId)` now accepts optional characterId and loads from `data/character-{characterId}/parts.json` directly.

### Test Hangs
**Problem:** Mocha tests hang indefinitely after completion.
**Fix:** Always use `--exit` flag: `npx mocha ... --exit`

### Frame Loop Timing
**Problem:** Old implementation had async gap between amplitude read and angle set — polling endpoint saw stale values.
**Fix:** Preload all config/parts/guardrails before loop, compute angle synchronously in each frame, set `driveState.angle` immediately.

---

## Development Workflow

### Quick Iteration Cycle
1. Edit server-side JS
2. `sudo systemctl restart monsterbox.service`
3. `npm run test:system` or `npm run verify`
4. View UI at `http://192.168.8.120:3000/setup/jaw-animation`

### Testing Jaw Animation
- **Direct test:** `node scripts/test-jaw-direct.mjs` (bypasses HTTP, uses service directly)
- **HTTP test:** `node scripts/test-jaw-sync.mjs` (polls `/audio-levels`)
- **Browser test:** POST to `/api/jaw-animation/3/test-tts` with `{text:"Hello"}`
- **Real TTS:** Requires `ELEVENLABS_API_KEY` in env

### Debugging
- **Server logs:** `sudo journalctl -u monsterbox.service -f`
- **Test mode:** `MB_TEST_MODE=1 npm start` — no hardware required
- **Client console:** Browser DevTools on jaw-animation page

---

## Resource Constraints (Raspberry Pi 4B)

### Memory Management
- 4GB RAM shared with GPU (typically 3.5GB usable)
- Node.js heap limit: ~512MB-1GB (avoid loading large files into memory)
- ffmpeg spawns decode child processes — monitor with `ps aux | grep ffmpeg`

### I/O Optimization
- File watchers disabled for `node_modules/`, `.vscode-server/`, `dist/`, `build/`
- Git autofetch/autorefresh disabled in VS Code
- Audio files streamed when possible (don't buffer full MP3s)

### Network
- RPI4B Ethernet: 1Gbps (reliable)
- WiFi: 2.4/5GHz (variable, avoid for real-time servo control)
- ElevenLabs API: Rate-limited, use queue for TTS generation

---

## Keyboard Shortcuts & Commands

### VS Code Tasks (Ctrl+Shift+P → "Tasks: Run Task")
- **Unit Tests (Mocha)** — runs `npm run test:unit`
- **E2E Tests (Playwright)** — runs `npm run test:e2e`
- **Verify (Unit + E2E)** — runs `npm run verify` (default test task)

### NPM Scripts (see package.json)
```bash
npm start              # Production server
npm run dev            # Development with nodemon
npm run verify         # Full test suite (system + unit + browser)
npm run test:quick     # Faster subset
npm run test:system    # Mocha system tests
npm run test:unit      # Mocha unit tests
npm run test:browser   # Playwright browser tests
```

---

## Character Profiles

### Character 3: Orlok
- **Name:** Orlok (Nosferatu-inspired vampire animatronic)
- **IP:** 192.168.8.120
- **Parts:**
  - id="10": Jaw of Orlok (servo, PCA9685 ch 8, calibrated 70°-93°)
  - id="11": Head on a Swivel (continuous servo)
  - id="1,2": Arms (linear actuators, MDD10A)
  - id="3": Bow at Waist (linear actuator, BTS7960)
  - id="6": Speaker (USB audio device)
  - id="9": Eye (webcam /dev/video1)
  - id="14": Motion sensor (PIR, GPIO 16)
- **Voice:** ElevenLabs voice_id configured in `data/character-3/ai-config.json`

---

## External References

### ChatterPi (inspiration for jaw sync fix)
- GitHub: ViennaMike/ChatterPi
- Key algorithm: Synchronous amplitude→angle mapping in audio callback with 50Hz rate limiting
- MonsterBox uses similar approach but with attack/release envelope for smoother motion

### Hardware Datasheets
- PCA9685: 16-channel 12-bit PWM/servo driver, I2C address 0x40
- MDD10A: Dual H-bridge motor driver (DIR + PWM control)
- BTS7960: High-current H-bridge (RPWM/LPWM + REN/LEN)

---

## Changelog

### v5.5.2 (2025-02-14) — Jaw Animation Sync Fix
- **Fixed:** Synchronous jaw angle updates in `driveJawFromAudioBuffer()` (no async gap)
- **Fixed:** `loadPartsSafe()` now character-aware — accepts `characterId` param, loads from `data/character-{id}/parts.json`
- **Fixed:** All 6 failing jaw animation tests (character resolution bug)
- **Added:** `simulateJawDrive()` for `MB_TEST_MODE` operation
- **Added:** Test scripts `scripts/test-jaw-direct.mjs` and `scripts/test-jaw-sync.mjs`
- **Improved:** RMS meter scaling in client JS (audio ×400, jaw sqrt curve)
- **Improved:** Cache-busting on client JS (`?v=<%= Date.now() %>`)
- 20 files changed, 1536 insertions, 1214 deletions

---

## Next Steps (TODO)

1. **Real-world TTS sync verification** — End-to-end test with actual ElevenLabs audio at realistic amplitude
2. **Parameter tuning** — sensitivity/smoothing/attack/release may need adjustment after real-world testing
3. **Commit v5.5.2** — 20 uncommitted files with jaw sync fixes
4. **Performance profiling** — Monitor CPU/memory during simultaneous TTS + jaw drive + playback

---

*Last updated: 2025-02-14 (v5.5.2)*
