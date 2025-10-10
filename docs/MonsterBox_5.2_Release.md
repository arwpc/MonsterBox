# MonsterBox 5.2 Release (Gold)

This document is the authoritative checklist and handoff plan for releasing MonsterBox 5.2 across all animatronics in time for Halloween.

## Objectives
- Ship stable MonsterBox 5.2 across all devices with clean deploy and zero critical regressions
- Verify actuator control (including BTS7960 full-control wiring), audio, AI, and UI flows
- Enable passwordless deploys and fast recovery

## Scope and Key Items
- BTS7960 Full Control in UI: Add/Edit Part must surface controlBoard, RPWM, LPWM, R_EN, L_EN and persist
- Passwordless deploy: scripts/deploy-to-animatronic.sh runs without interactive prompts
- First‑run Skull-themed Character selection page
- Confirm full functionality of all servos and Parts using PCA9685 and Direct GPIO. Confirm PCA9685:
        * PCA9685 PWM Driver Service
      * Direct local function calls for PCA9685 servo control
- Character Images: CRUD + round thumbnail in navbar + presence in selection/manage forms + home tile
- Attention to detail: no stray 4.0 labels; proper DOCTYPE on all pages; Playwright green
- Optional: Multi-select deletion on /setup/models

## Release Readiness Checklist
- [ ] Code complete for BTS7960 UI fields and persistence; Edit/Add forms verified
- [ ] Deploy script updated to non-interactive SSH (key-based) and consistent service restart
- [ ] First-run Skull selection flow implemented and tested
- [ ] Character images CRUD implemented and tested
- [ ] Version shows “MonsterBox 5.2” across UI
- [ ] Playwright tests pass locally (Firefox headless on RPi4b)
- [ ] Physical jog tests pass for each actuator on each device
- [ ] ElevenLabs TTS plays through character’s assigned speaker automatically
- [ ] Microphone level meters visible and functional on Setup Audio page

## Task Status (snapshot)
- Complete:
  - 5.2 branding across views
  - 5.1 replaced, 4.0 replaced
  - Orlok parts cleanup; pin conflict resolved
- In Progress:
  - Deploy to Orlok verification (user ran update-from-github)
  - Surface full BTS7960 settings in Add/Edit Part and persist
- Not Started:
  - Passwordless deploy script
  - First‑run Skull selection page
  - Character images CRUD
  - Attention-to-detail tidy-ups (doctype, lingering labels)
  - Multi-select delete on /setup/models

## BTS7960 Full-Control Wiring (Orlok Loom Over)
- R_EN → GPIO 5 (Pin 29)
- L_EN → GPIO 22 (Pin 15)
- RPWM → GPIO 19 (Pin 35)
- LPWM → GPIO 21 (Pin 40)
- VCC → 5V; GND → GND

Implementation notes:
- UI: Show controlBoard selector (MDD10A/BTS7960). If BTS7960, show rpwmPin, lpwmPin, renPin, lenPin. If MDD10A, show directionPin, pwmPin.
- Create/Edit handlers: include these fields in payload; PUT/POST persists to character parts.json.
- Hardware service already supports BTS7960 via linear_actuator_control_v2.py.


### BTS7960 pin semantics and reuse
- Direction mapping used in MonsterBox: Forward = RPWM high, Reverse = LPWM high (inactive PWM pin held LOW). If your wiring behaves opposite, swap the RPWM/LPWM assignments in the part config.
- R_EN/L_EN should be driven HIGH (enabled) when present.

#### Generic per‑part config (data/character-X/parts.json)
Add or edit a Linear Actuator part and set `controlBoard` to `BTS7960` with all four pins:

```json
{
  "id": "<next-id>",
  "name": "Loom Over (BTS7960)",
  "type": "linear_actuator",
  "controlBoard": "BTS7960",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "renPin": 5,
  "lenPin": 22,
  "description": "12V linear actuator via BTS7960",
  "speedDefault": 60,
  "durationDefault": 2000
}
```

This same configuration pattern applies to any other BTS7960‑driven DC actuator, including Groundbreaker’s Head. Create additional Linear Actuator parts with their respective GPIOs.

#### Quick verification (no UI)
Use the existing wrapper that the Hardware Service calls (lgpio‑based):

```bash
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "BTS7960",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "renPin": 5,
  "lenPin": 22,
  "direction": "forward",
  "speed": 60,
  "duration": 2000,
  "pwmFrequency": 2000
}'
```
Then reverse direction by setting `"direction": "reverse"`.

#### UI integration notes (reuse across parts)
- Add/Edit Part forms must surface these BTS7960 fields when `type = linear_actuator` and `controlBoard = BTS7960` (rpwmPin, lpwmPin, renPin, lenPin) and persist to the character’s parts.json.
- Motor parts also support BTS7960: set `controlBoard = BTS7960` and provide `rpwmPin`/`lpwmPin` and optional `renPin`/`lenPin`; directions `forward`/`backward` map to BTS7960 `forward`/`reverse`.
- Standardize on lgpio for GPIO access. pigpio may be installed for compatibility but is not required for 5.2.

## Deploy Plan (per device)
1) Verify passwordless SSH from build host to device
2) Run deploy script to rsync code, check ElevenLabs key, install deps if missing, restart service
3) Validate service health and UI
4) Run jog tests for actuators

Devices (confirm/update IPs):
- Skulltalker – 192.168.8.130
- Orlok – 192.168.8.120
- Coffin Breaker – 192.168.8.140
- PumpkinHead – 192.168.8.150
- Groundbreaker – 192.168.8.200

## Handoff Deploy Script Review (scripts/deploy-to-animatronic.sh)
Observations:
- Uses ssh/rsync without explicit non-interactive flags; may prompt for host key or password
- Service restart:
  - update-from-github.sh kills/greps on `node.*server.js`
  - deploy-to-animatronic.sh greps on `node.*MonsterBox` → inconsistent; may miss process
- Health check endpoint `/api/elevenlabs/status` may not exist on all builds; use `/health` if available

Recommended changes:
- Add options:
  - ssh/rsync: `-o BatchMode=yes -o StrictHostKeyChecking=accept-new`
- Normalize process management:
  - Use the same match everywhere, e.g. `node.*server.js` or better, migrate to systemd service `monsterbox.service`
- Health check:
  - Prefer `/health` and fallback to a simple GET to `/` expecting 200
- Add `--exclude` for logs/tmp and optional `--dry-run` mode for testing
- Add immediate Playwright smoke (`npx playwright test -c playwright.config.ts tests/playwright/navigation-and-character-persistence.spec.js --project=firefox`) when headless environment available

Non-interactive example:
```
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new remote@${IP}
rsync -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" ...
```

## Passwordless SSH Setup (one-time per device)
```
# On build host
ssh-keygen -t ed25519 -C "monsterbox-deploy" -f ~/.ssh/monsterbox_deploy
ssh-copy-id -i ~/.ssh/monsterbox_deploy.pub remote@DEVICE_IP
# Verify non-interactive
ssh -i ~/.ssh/monsterbox_deploy -o BatchMode=yes remote@DEVICE_IP true
```
Then run deploy with `SSH_OPTS` propagated to both ssh and rsync.

## Validation Plan (per device)
- UI checks: header shows “MonsterBox 5.2”; no Quirks warning in console
- Calibration:
  - Linear actuators: Extend/Retract at 60% for 2000 ms (IDs per character)
  - Servo tests: min/center/max and saved positions CRUD
- Audio:
  - Microphone VU active; sensitivity/gain apply instantly
  - TTS plays via character’s speaker; barge-in supported
- Webcam:
  - MJPEG stream at http://DEVICE_IP:8090 working in Calibration/Webcam pages
- STT/Agent:
  - If configured, verify STT frame size (20–40 ms) and response turn-taking

## Playwright Test Set
- calibration-all-parts.spec.js
- navigation-and-character-persistence.spec.js
- first-run.spec.js (new)
- character-images.spec.js (new)

Run:
```
npm run test:ui -- tests/playwright/calibration-all-parts.spec.js --project=firefox
npx playwright test -c playwright.config.ts tests/playwright/first-run.spec.js --project=firefox
npx playwright test -c playwright.config.ts tests/playwright/character-images.spec.js --project=firefox
```

## Rollout Order & Timing
1) Orlok (reference hardware) – validate BTS7960 and deploy flow
2) Skulltalker – verify audio and mic
3) Coffin Breaker – verify actuators
4) PumpkinHead – verify video/goblin playback paths
5) Fifth animatronic – replicate validated steps

## Go/No‑Go Criteria
- All devices pass UI smoke, calibration jogs, and audio checks
- Playwright suite green or known, documented exceptions
- No critical console/server errors during a 10‑minute burn‑in per device

## Rollback
- Keep previous commit hash handy: `git log -1 --pretty=%H`
- On device: `git checkout <prev_sha> && nohup npm start >/tmp/monsterbox.log 2>&1 &`
- If systemd managed: `sudo systemctl restart monsterbox`

## Open Items to Close for 5.2
- Finish BTS7960 UI fields + persistence
- Implement passwordless deploy script changes
- Implement first‑run Skull selection
- Implement character images CRUD
- Clean up ATTENTION TO DETAIL nits and model multi-select

— End of 5.2 Gold Release —



## Parrot Mode – WAV Loopback Test (Server Mic via Monitor)

Use this to verify Parrot Mode without speaking into a physical microphone. The server STT listens to the sink’s monitor so anything played to the speakers is transcribed and parroted back via the Conversation page.

Steps
1) Choose a monitor source (PipeWire/Pulse):
   - curl -s http://127.0.0.1:3000/setup/audio/api/inputs | jq
   - Pick an id that contains "monitor" (e.g., alsa_output.usb-...monitor)
2) Apply as default source:
   - curl -s -X POST -H "Content-Type: application/json" \
     -d '{"defaultSource":"<MONITOR_ID>"}' \
     http://127.0.0.1:3000/setup/audio/api/system-config
3) Start server with audio debug (separate terminal):
   - MB_DEBUG_AUDIO=1 NODE_ENV=production PORT=3000 node server.js
4) Conversation page → enable "Parrot Mode (repeat what you say)".
5) Play the built-in WAV twice (room silent):
   - paplay /usr/share/sounds/alsa/Front_Center.wav; sleep 1; \
     paplay /usr/share/sounds/alsa/Front_Center.wav
   - (Fallback) aplay -D pulse /usr/share/sounds/alsa/Front_Center.wav

Expected
- Conversation page shows: "You: front center" then "Parrot spoke"
- Logs show STT chunk and STT response text followed by 200 on /conversation/api/say

Notes
- If transcripts don’t appear, try a different monitor id and raise Setup→Audio Input Level.
- Keep STT language set to English for this test.
- Revert to default when done:
  - curl -s -X POST -H "Content-Type: application/json" -d '{"defaultSource":"default"}' \
    http://127.0.0.1:3000/setup/audio/api/system-config


## Autotune: Mic/STT/VAD (Production)

This Playwright test runs on the device and automatically tunes microphone input gain, STT language/VAD threshold using only existing endpoints. It plays the built-in ALSA WAV to a speaker and verifies Parrot Mode echoes via /conversation/api/say.

Run on Orlok (server must NOT be test mode):
```
# In one terminal (on Orlok)
MB_DEBUG_AUDIO=1 NODE_ENV=production PORT=3000 node server.js

# In another terminal (on Orlok)
BASE_URL=http://127.0.0.1:3000 MB_E2E=1 \
  npx playwright test -c playwright.config.ts \
  tests/playwright/mic-stt-vad-autotune.spec.js --project=firefox --reporter=list
```
What it does:
- Picks a monitor source from /setup/audio/api/inputs and applies it as default source
- Saves STT config: language = "en", vadEnabled = true
- Tries a small grid of Input Gain (100/130/160%) and VAD thresholds (4/6/8/10%)
- For each combo, plays Front_Center.wav twice and waits for /conversation/api/say
- Persists the first working combo and re-checks once

If it fails:
- Try another monitor id; confirm speakers produce audio
- Increase input gain to ~160–180% and retry
- Ensure ElevenLabs API key is configured and network is reachable
