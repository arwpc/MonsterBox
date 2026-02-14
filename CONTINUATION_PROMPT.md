# MonsterBox Jaw Animation — Continuation Prompt

Paste this into a new chat to continue the jaw animation work.

---

## Context

You are working on **MonsterBox 5.5** — a Node.js/Express animatronic control system on a Raspberry Pi 4B. The workspace is at `/home/remote/MonsterBox`. The server runs as a systemd service (`sudo systemctl restart monsterbox.service`) on port 3000.

The current character is **Orlok (character 3)** at IP 192.168.8.120.

### What Was Done (v5.5.2 — Jaw Animation Sync Fix)

A multi-session effort overhauled the jaw animation system. The key accomplishment was a **ChatterPi-inspired synchronous fix** to `driveJawFromAudioBuffer()` in `services/jawAnimationSuperPowerService.js`:

1. **Problem**: `driveState.angle` was only set inside an async `.then()` callback of `driveJawFromAmplitude()`. The polling endpoint (`/audio-levels`) read `driveState.angle` before the callback fired, seeing 0 or stale values.

2. **Fix**: Restructured the function (line ~635) to:
   - **Preload** config, parts, and calibration guardrails **once** before the frame loop (no per-frame async lookups)
   - Compute angle **synchronously** in each 50ms frame: `applySmoothingToAmplitude()` → `calculateJawAngle()` (with attack/release envelope ramp limiting)
   - Set `driveState.angle` **immediately** (no async gap)
   - Fire servo command as **fire-and-forget** (async but non-blocking, like ChatterPi's `self.jaw.angle = jawTarget`)

3. **Other changes in this session** (20 files changed, 1536 insertions, 1214 deletions):
   - Added `simulateJawDrive()` for MB_TEST_MODE operation
   - Improved meter scaling in client JS (audio: ×400, jaw: sqrt curve)
   - Cache-busting on client JS (`?v=<%= Date.now() %>`)
   - Fixed double-nested config bug in `super-powers.json`
   - Added Jaw Animation section to README.md
   - Added v5.5.2 entry to CHANGELOG.md
   - Created test scripts: `scripts/test-jaw-direct.mjs` and `scripts/test-jaw-sync.mjs`

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `services/jawAnimationSuperPowerService.js` | 911 | Core: amplitude processing, angle calc, servo driving |
| `routes/setup/jaw-animation.js` | 420 | HTTP API: config CRUD, TTS, drive, audio-levels polling |
| `public/js/jaw-animation.js` | ~532 | Client: polls `/audio-levels` every 60ms, displays meters |
| `views/setup/jaw-animation.ejs` | ~430 | Setup page template |
| `data/character-3/super-powers.json` | — | Jaw config for Orlok |
| `data/character-3/parts.json` | — | Part id="10" is the jaw servo (PCA9685 ch 8) |
| `config/app-config.json` | — | selectedCharacter=3, dataPath="data/character-3" |
| `tests/system/jaw-animation.test.js` | ~340 | Mocha system tests (6 failing — see below) |

### Current Configuration (`data/character-3/super-powers.json`)

```json
{"jawAnimation":{"enabled":true,"servoPartId":"10","sensitivity":4,"smoothing":0.2,"volumeThreshold":0.02,"attackTime":30,"releaseTime":80,"minAngle":70,"maxAngle":93}}
```

### Current Test Results

| Suite | Passing | Pending | Failing |
|-------|---------|---------|---------|
| System (Mocha) | 118 | 4 | **6** |
| Unit (Mocha) | 152 | 42 | **6** |

All 12 failures are in **Jaw Animation Super Power API** tests (`tests/system/jaw-animation.test.js` for system, same tests also in unit run). The failing tests:

1. **"should identify jaw candidates by name"** → `expected undefined to exist` — `loadPartsSafe()` loads from global `dataPath` in `app-config.json`, but when test environment resolves differently, the jaw servo (id="10") isn't found.
2. **"should include calibration data"** → `expected +0 to be above +0`
3. **"should accept valid amplitude"** → `success: false` (no servo found)
4. **"should return guardrails with calibration data"** → `Target cannot be null`
5. **"should clamp target angle within calibrated range"** → `Cannot destructure 'minAngle' of undefined`
6. **"should execute jaw test sequence"** → `400 Bad Request`

**Root cause**: `loadPartsSafe()` reads parts from the path in `app-config.json`. The tests use `CHARACTER_ID = 3` in the URL, but the function loads from whatever `dataPath` is configured globally. If character-3's `parts.json` can't be found or parsed, all downstream operations fail. These are **environment-dependent**, not code bugs from the sync fix — they were failing identically before the fix (verified with `git stash`).

### What Remains To Do

1. **Fix the 6 failing jaw animation tests** — The core issue is `loadPartsSafe()` (line ~100 in `jawAnimationSuperPowerService.js`) loading parts from the global `dataPath` instead of using the character-specific path. Options:
   - Make `loadPartsSafe()` accept an optional `characterId` and load from `data/character-{characterId}/parts.json`
   - Or ensure the test setup correctly configures `app-config.json` before running
   - These tests hit the live server via supertest — they need the correct character data to be resolvable

2. **Real-world TTS sync verification** — The sync fix is structurally correct (all tests that don't depend on hardware pass), but end-to-end verification with real ElevenLabs TTS audio hasn't been completed:
   - `scripts/test-jaw-direct.mjs` showed `active=true` throughout playback but angles were 70° (synthetic WAV amplitude below volumeThreshold=0.02)
   - `scripts/test-jaw-sync.mjs` (HTTP polling) never caught `playing=true` — TTS generation delay causes timing mismatch
   - Need to test with actual speech audio at realistic amplitude levels
   - Could modify `test-jaw-direct.mjs` to generate a louder synthetic WAV, or capture real TTS output

3. **Parameter tuning** — Current settings (sensitivity=4, smoothing=0.2, attackTime=30, releaseTime=80) were tuned via browser with RMS analysis showing angles 73°-92° (near-full range of 70°-93°). May need further adjustment after real-world testing.

4. **Commit the changes** — 20 files with 1536 insertions are uncommitted. Once tests are fixed and sync is verified, commit as v5.5.2.

### Important Implementation Notes

- **Save API body format**: POST `/api/jaw-animation/:characterId` expects the raw config object (`{enabled:true, servoPartId:"10", ...}`) — NOT wrapped in `{jawAnimation:{...}}`. The `writeJawConfig()` function handles wrapping. Sending a wrapped body causes double-nesting.
- **Frame loop**: 50ms frames from ffmpeg PCM decode (16kHz 16-bit mono). RMS is computed per frame. 20 frames/sec (50Hz, matching ChatterPi's rate limit).
- **Client JS pattern**: Strict ES5 IIFE (`var JawAnimationPage = (function() { ... })();`). No ES6+ syntax in client code.
- **ChatterPi reference**: GitHub ViennaMike/ChatterPi — Python-based, uses `adafruit-circuitpython-motor` for direct servo control. Key insight was synchronous amplitude→angle in the audio callback with rate limiting.
- **Test mode**: `MB_TEST_MODE=1` skips real hardware init. `simulateJawDrive()` provides simulated angle responses.
- **Service restart**: After editing server-side JS, restart with `sudo systemctl restart monsterbox.service`.

### ChatterPi Algorithm Summary (for reference)

From ChatterPi's `audio.py`:
- Reads audio in callback, computes RMS amplitude
- Maps amplitude to servo angle: `jawTarget = ((amplitude / MAX_AMP) * JAW_RANGE) + JAW_MIN`
- Rate-limits servo updates to 50Hz (every 20ms) to prevent buffer overruns
- Three styles: Scary Terry (binary open/close above threshold), Jawduino (4-level quantized), Wee Little Talker (256 levels with bandpass filter)
- Our implementation is closest to Wee Little Talker but with continuous mapping + attack/release envelope

---

**Start by reading `services/jawAnimationSuperPowerService.js` (especially `loadPartsSafe()` around line 100 and `driveJawFromAudioBuffer()` around line 635) and `tests/system/jaw-animation.test.js` to understand the test failures, then fix them.**
