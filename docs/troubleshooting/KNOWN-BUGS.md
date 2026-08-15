# Known Bugs & Open Issues

> **Single source of truth for outstanding bugs across the MonsterBox fleet.**
> Organized by animatronic (for one-node-at-a-time work) plus cross-cutting software,
> data-hygiene, and security items.
>
> **Last hardware verification:** 2026-04-18 (v8.1.6 session). Software items updated
> through v8.5.0. Hardware status may have changed since — re-verify on each node before
> relying on it. Update this file as issues are fixed (strike them through and note the
> version).

Legend: 🔴 blocking / broken · 🟡 reliability / intermittent · 🟢 mitigated, long-term fix pending · ⚪ constraint / gotcha (not a defect)

---

## Per-Animatronic Hardware

### Orlok — char 3 · `192.168.8.120` (primary dev box)
Fully operational (all servos + actuators move) with two standing items:

- 🟡 **Elbow (ch4) + Forearm (ch5) shared fuse keeps blowing.** Mixed-voltage servos on
  one fused rail: Elbow `servo_rds51150sg_150kg` (9–12.6 V, 150 kg stall) and Forearm
  `servo_hooyij_ds3240mg` (6.0–7.4 V, 40 kg). Fuse was replaced 2026-04-18; both work, but
  recurrence is an open reliability concern. **Root cause not yet diagnosed.**
  Candidates: (a) stall current from mechanical bind, (b) undersized fuse rating for peak
  draw, (c) simultaneous inrush when ch4+ch5 are commanded together (pose/scene), (d)
  undervoltage sag, (e) harness short.
  - *Need to diagnose:* fuse amp rating, and whether it blows during scene playback,
    calibration, idle, or a specific movement.
  - *Software mitigations (if electrical is borderline, not shorted):* per-part `speedPct`
    cap in the calibration profile; serialize ch4+ch5 dispatch in the pose/scene executor
    (no concurrent commands on this pair); stall-detection watchdog via movement telemetry.
  - *Do NOT* run full-range sweeps on ch4/ch5 without supervision.
- ⚪ **Bow-at-Waist actuator (part 3, BTS7960 on GPIO 21/19/5/22) — do NOT retract past
  current min.** It is at its safe mechanical limit. Profile was cleared/reset with
  `bounds.minP = 0`, `currentP = 0`. Extension is safe; retraction below current-min risks
  damage. Do not issue `jog-raw` `direction:"retract"` on part 3 (it bypasses bounds).
  Confirm mechanical clearance before any "find full range" procedure.

### Mina — char 2 · `192.168.8.140`
🔴 **Blocked on hardware.** PCA9685 chip is healthy (I2C 0x40, MODE1 normal, PRE_SCALE 0x79/50 Hz)
and PWM registers update correctly on **all four** channels. Working: ch0 Laser (via 3 V
relay on the PWM signal pin), ch4 Jaw (full range, confirmed). Off-PCA hardware works
(Coffin Door, Burning Rose on GPIO 16).

- 🔴 **Neck (ch8) and Eye (ch11) do not move** despite valid PWM at the register level and an
  identical command path to the working ch4 Jaw. Narrowed to: dead servos, broken signal
  leads, loose header pins, or burned PCA9685 outputs on those two channels specifically.
  - *Recommended diagnostic (wire-swap, no multimeter):* unplug the known-good Jaw servo
    from ch4, plug the Neck servo into ch4, cycle it. If it moves → ch8 output/wiring is
    dead (remap Neck to a good channel in `data/character-2/parts.json`, same pattern as the
    v8.1.5 Eye ch12→ch11 fix). If it still doesn't move → the servo itself is dead. Repeat
    for the Eye servo to isolate ch11.
  - *Note:* eye lights being on does **not** prove V+ is alive — the laser is a 3 V relay
    driven by the signal pin, not V+.
- 🟡 **Jaw calibration profile has tiny auto-default bounds** `{minAngle:85, maxAngle:95}`.
  Re-calibrate on `/setup/calibration` now that the jaw is confirmed working; v8.1.6 flows
  that calibration through to jaw-animation automatically.

### Sir Dragomir — char 4 · `192.168.8.130`
🟢 **Fully operational** as of 2026-04-18. Jaw (ch0), Magic Box (ch8), Head (ch4 continuous)
all user-confirmed. The jaw-animation "servo must be calibrated" false block was fixed in
v8.1.6 (reads bounds from `calibration_profiles.json`, not just `parts.json` markers). No
open hardware issues — kept here for completeness; verify after any redeploy.

### PumpkinHead — char 1 · `192.168.8.150`
🔴 **Offline (long-term).** Not verified. Hardware state unknown until the node is powered
and reachable.

### Groundbreaker — char 5 · `192.168.8.200`
🔴 **Offline (long-term).** Not verified. Also see the character-ID mismatch below.

---

## Cross-Cutting Software Bugs

- 🟢 **Calibration profile part-ID collision.** `data/calibration_profiles.json` keys by part
  ID globally, but part IDs are only unique **within** a character (Orlok part 1 =
  linear_actuator, Mina part 1 = servo, Dragomir part 1 = continuous-servo all collide on
  key `"1"`). *Mitigated v8.1.4:* file is gitignored/untracked so each node keeps its own,
  and `getOrAutoCreateProfile()` rebuilds correct per-type profiles when missing. **Before
  v8.1.4 this silently broke Mina and Dragomir** — a `git pull` propagated Orlok's
  open-loop-linear profile for part 1, causing `"Action 'jog' not supported for part type:
  servo"`. *Long-term fix still needed:* re-key by `{characterId}.{partId}` so profiles are
  safe to sync. Recovery today: delete the file → restart service → profiles auto-rebuild.
- ⚪ **`goto` / calibration API false-positive.** `POST /api/calibration/:partId/goto` (and
  siblings) return `success:true` whenever the I2C write succeeds — there is **no** encoder
  feedback, so it does **not** prove physical movement. Never trust API success alone for
  "did the servo move?"; confirm visually or via a working scene.
- ⚪ **Hostname auto-select overwrites `app-config.json`.** On service restart,
  `getHostnameCharacterId()` in `configService.js` sets `selectedCharacter` from the system
  hostname. Editing `app-config.json` directly does **not** persist across restarts. To test
  another character's data on a given RPi, use direct hardware commands or temporarily remap
  the hostname in `config/animatronics.json`.
- 🟡 **`data/ai-config/` written to top level (context-fallback bug).** AI TTS/STT config
  should live per-character at `data/character-{N}/ai-config/`, but a fallback path has
  written a stray top-level `data/ai-config/` at least once (observed on Orlok 2026-07-17).
  On that occasion the files were **root-owned**, indicating the service ran as root at some
  point — worth confirming `monsterbox.service` runs as `remote`, not root, on every node.
  *Root cause (which code path falls back to top-level `data/`) is not yet fixed.* The stray
  dir is safe to `rm` (regenerates from per-character config).
- ⚪ **`batchMoveServos` reads `selectedCharacter` independently.** `hardwareService`'s
  `batchMoveServos` calls `readConfig().selectedCharacter` directly rather than going through
  `resolveCharacter(req)` — a character-independence seam allowlisted for now, not yet
  migrated.
- 🟢 **Hardware safety limits not enforced through unified calibration.**
  `services/hardwareService/index.js:1567` — `// TODO: Re-implement safety limits using
  unified calibration profiles`. The legacy per-part safety-limit clamp was removed and not
  re-implemented on the unified profiles. Servo `moveToAngle` still mirrors/clamps within
  calibrated bounds *where a profile exists*, but there is no general safety-limit layer
  across motor / linear-actuator / stepper. **Directly relevant to Orlok's ch4+ch5 fuse
  item above** — nothing bounds a stall-inducing command. *Mitigate:* keep per-part
  `speedPct` caps in calibration profiles and supervise full-range moves until re-implemented.
- 🟡 **Conversation start/stop does not open/close the ElevenLabs WebSocket.**
  `routes/conversation.js:668` — the enable/disable endpoint persists `ai_agent_state.json`
  and returns `{success:true}` but never starts/stops the realtime agent via
  `elevenLabsWebSocketService`. Toggling conversation in the UI may not actually start or
  cleanly stop the live agent.
- 🟡 **Hardware-service webcam + mic paths are simulated.**
  `services/hardwareService/index.js:969` (`startStream`/`stopStream`) returns a canned
  `streamUrl` without invoking `camera_stream.py`; `:995` (`microphone.record`) returns
  success without capturing audio. Distinct from the v8.5.0 Fleet Command Center MJPEG proxy,
  which is a real path (see Recently Fixed). Any flow relying on the hardware-service
  stream/record path is a no-op on real hardware.
- 🟡 **`routes/setup/calibration.js` calibration services are stubs.** `:25` —
  `standardServoCalibration` and siblings return hard-coded
  `{pulseCalibrated:true, positionsCalibrated:true}` and suggested positions with no
  persistence, so calibration *status* shown through this route is not trustworthy. (The real
  stores — `server/calibration/store.js`, `services/actuatorPositionStore.js` — are separate
  and do persist; this is specifically the route's stub layer.)
- ⚪ **AI settings "Test connection" is a no-op.** `routes/aiSettingsRoutes.js:193` —
  `// TODO: Test actual API connection`; after checking a key is present it returns
  "connection successful" without making a request, so it can pass against an invalid/expired key.
- ⚪ **Character-resolution & bias tech-debt is baselined, not fixed.** Full machine-checked
  lists: `eslint-rules/no-direct-character-resolution.allowlist.json` (~12 files still read
  character state directly instead of `resolveCharacter(req)` — e.g.
  `controllers/motionTrackingController.js`, `webcamController.js`, `partsController.js`,
  `routes/setup/jaw-animation.js`, `head-animation.js`) and
  `tests/baseline/character-independence-allowlist.json` (72 orlok/char-3/hardcoded-IP
  entries). `npm run gate` blocks *new* violations; both lists only shrink. The
  `batchMoveServos` seam above is one such entry.

---

## Test Suite (known-flaky)

Intermittent failures noted in `CLAUDE.md` — they pass on retry and are treated as
non-blocking. Listed so a genuine regression here isn't dismissed as "the usual flake":

- 🟡 **VU meter** — audio level-meter test intermittently fails.
- 🟡 **Jaw-animation save-config** — save assertion intermittently fails.
- 🟡 **Calibration timeout** — calibration test intermittently times out.

---

## Data Hygiene

- 🟢 **Ghost character 6 data directory.** `data/character-6/` exists (audio-config.json,
  microphones.json) with no entry in `data/characters.json` — orphaned, likely a deleted
  test character. *Mitigated v8.2.3:* schema validator skips anything not in
  characters.json; those files are gitignored (service rewrites their timestamps each boot).
  *Long-term fix:* delete the directory or register character 6 via the `/add-character` skill.
- 🟡 **Groundbreaker character-ID mismatch.** `data/characters.json` lists Groundbreaker as
  **id 5**, but `config/animatronics.json` maps host `groundbreaker` to **characterId 7**.
  These must be reconciled before Groundbreaker comes online, or orchestration will target
  the wrong character context.

---

## Security / Ops

- 🔴 **Leaked SSH password committed as fallback.** `klrklr89!` appears as a committed
  fallback in the orchestration/deploy path. It is **not** used from the service environment
  (which reads `MONSTERBOX_SSH_PASSWORD`), but it must be **rotated** and removed from the
  repo; set `MONSTERBOX_SSH_PASSWORD` on every node instead.
- 🟡 **Dependabot: 3 high-severity vulnerabilities** on the default branch
  (github.com/arwpc/MonsterBox → Security → Dependabot). Review and patch within the
  "no new npm deps without approval" constraint (updates to existing deps are fine).

---

## Recently Fixed (for reference)

- ~~Remote webcams never streamed / stream died after 30 s~~ — fixed **v8.5.0** (proxy now
  forwards the upstream MJPEG boundary; `timeout:0` for endless bodies).
- ~~Orchestration broadcast/status reported `success:true` on total failure~~ — fixed
  **v8.5.0** (returns `{success,total,successful,failed,results}`).
- ~~jaw-animation reported "servo must be calibrated" for calibrated parts~~ — fixed
  **v8.1.6** (reads `calibration_profiles.json`, markers as fallback).
- ~~Three mixed character-resolution patterns (`readConfig().selectedCharacter`,
  `req.app.locals...`, `req.query.characterId`)~~ — resolved **v8.1.9** (canonical
  `resolveCharacter(req)`, enforced by `npm run audit:resolver`).
- ~~Per-character data-file shape divergence undetected~~ — fixed **v8.1.8** (schemas +
  startup validation).
- ~~No mechanical detector for character bias~~ — fixed **v8.2.2** (`npm run audit:independence`).
- ~~No pre-deploy gate blocking regressions~~ — fixed **v8.2.1** (`npm run gate`, pre-push + CI).
- ~~poseRepository.js path bug / Orlok missing idle poses / movement telemetry not
  connected~~ — fixed **v7.9.0**.
