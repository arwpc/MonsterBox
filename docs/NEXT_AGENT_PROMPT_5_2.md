# MonsterBox 5.2 – Handoff Prompt for Next Agent

## Context
- Node.js/Express app with EJS views; client JS must be ES5 function syntax
- Hardware wrappers in python_wrappers/; no WebSockets for parts in this version
- Audio: PipeWire/WirePlumber; MJPEG webcam via mjpg-streamer on 8090
- Characters select drives per‑character configs (parts/audio/AI)

## Network (authoritative)
Defined centrally in config/animatronics.json (no hardcoded IPs in code):
- orlok → 192.168.8.120 (characterId 3)
- coffin → 192.168.8.140 (characterId 2)
- skulltalker → 192.168.8.130 (characterId 4)
- pumpkinhead → 192.168.8.150 (characterId 1)
- groundbreaker → 192.168.8.200 (characterId 5)
- goblin (display) → 192.168.8.160

## Current state (end of this session)
- BTS7960 Full Control UI implemented (Add/Edit) and persisted to parts.json
- Deploy script hardened for passwordless mode (BatchMode=yes; consistent process name)
- Central animatronics config added at config/animatronics.json and used by:
  - scripts/deploy-to-all.sh (via jq)
  - utils/diagnose-remote-connectivity.js
  - goblin-pi.js discovery (addresses from config, no IP literals)
- Docs updated to unify device IPs and add Groundbreaker across references
- Playwright calibration-all-parts.spec.js passing on Firefox headless

## Immediate priorities
1) First‑run Skull‑themed Character selection page
   - /first-run route and skull‑themed selection view
   - Redirect from / when no selectedCharacter
   - POST same API as navbar Character dropdown to persist
   - Add tests: tests/playwright/first-run.spec.js

2) Character Images CRUD
   - Store under data/character-{id}/images/
   - Endpoints: list/upload/setActive/delete
   - UI: round thumbnail in navbar; present in selection & manage forms; big tile on home
   - Add tests: tests/playwright/character-images.spec.js

3) Deploy + validate per docs/MonsterBox_5.2_Release.md
   - Use scripts/handoff-device-deploy.sh --apply
   - Physical jogs for actuators; audio output and mic meters; webcam

## Constraints
- ES5 in browser; do not control modal show/hide via JS—use data-bs-toggle/data-bs-target
- No sockets for parts; MJPEG only for webcam; TTS uses Character’s speaker
- Audio: device selection uses PipeWire defaults; VU meters above test buttons

## Test commands
- npx playwright test -c playwright.config.ts tests/playwright/calibration-all-parts.spec.js --project=firefox
- npx playwright test -c playwright.config.ts tests/playwright/first-run.spec.js --project=firefox
- npx playwright test -c playwright.config.ts tests/playwright/character-images.spec.js --project=firefox

## Deployment check
- Ensure deploy key installed on each device:
  ssh-copy-id -i ~/.ssh/monsterbox_deploy.pub remote@DEVICE_IP
- Then run handoff deploy script:
  ./scripts/handoff-device-deploy.sh --apply

## Acceptance
- All five devices reachable via hostnames/IPs from config
- UI shows MonsterBox 5.2; first‑run selection works; image CRUD works
- Calibration jogs OK; audio auto‑plays on Character’s speaker; mic meters active
- Playwright suite green

## Notes
- Avoid new hardcoded IPs. Any new code that needs addresses must read config/animatronics.json or ENV.
- If jq is missing on Pi, install: sudo apt-get install -y jq

