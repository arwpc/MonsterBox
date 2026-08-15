# Known Bugs & Open Issues

> **Single source of truth for outstanding bugs across the MonsterBox fleet.**
> Organized by animatronic (for one-node-at-a-time work) plus cross-cutting software,
> data-hygiene, and security items.
>
> **Last hardware verification:** 2026-08-15 (v9.0.0 session) — **Orlok only**, and only
> partially: see the per-part notes below for exactly what was proven and what remains
> unproven. All other nodes were last verified 2026-04-18 (v8.1.6 session). Software items
> updated through v9.0.0. Hardware status may have changed since — re-verify on each node
> before relying on it. Update this file as issues are fixed (strike them through and note
> the version).

Legend: 🔴 blocking / broken · 🟡 reliability / intermittent · 🟢 mitigated, long-term fix pending · ⚪ constraint / gotcha (not a defect)

---

## Per-Animatronic Hardware

### Orlok — char 3 · `192.168.8.120` (primary dev box)
**No longer "fully operational."** The v9.0.0 hardware pass (2026-08-15) found one dead
actuator, one part quarantined for unsafe wiring, and one part whose "calibration" turned
out to be test residue. Software safety limits now live in `config/hardware-safety.json`
(enforced by `services/hardwareService/safetyLimits.js`).

- 🔴 **Part 2 (Left Arm) does not move.** PWM was **verified present on GPIO 13** — the
  toggle pattern is identical to the working GPIO 12 — but there is **zero motion at both
  50% and 95% duty**. The fault is therefore downstream of the Pi: the MDD10A channel, the
  harness, motor power, or the actuator itself.
  - *Next diagnostic:* move part 2 onto part 1's known-good MDD10A channel. If it moves →
    the driver channel is dead; if it still doesn't → harness/motor/actuator.
- 🔴 **Part 3 (Bow at the Waist) — contradictory wiring, software-quarantined.**
  `parts.json` declares `rpwmPin:19, lpwmPin:21`, while the part *description* says
  "GPIO 21=RPWM, 19=LPWM — CORRECTED WIRING". `linear_actuator_control_v2.py` drives
  `rpwmPin` for `"extend"`, so **if the description is correct, `"extend"` physically
  retracts** a part that is already sitting at its mechanical minimum. A direction-string
  guard cannot help when the string and the physical effect disagree, so part 3 is blocked
  outright via `blockAllMotion` in `config/hardware-safety.json` (v9.0.0).
  - *To clear:* a human traces the wires, makes `parts.json` and the description agree,
    then drops `blockAllMotion` and keeps `noRetractBelowMin`.
- 🔴 **Part 4 (Elbow) bounds are test residue, not a calibration.** Its 45–135 window was
  written by `tests/unit/calibration-unified-api.test.js`, which parked the servo at an
  extreme and then called set-min/set-max on every `npm run test:smoke` (the test was fixed
  in v9.0.0 — see Test Suite below). **Part 4 needs a genuine, supervised calibration pass.**
  Until then the 45–135 numbers in the profile and in `hardware-safety.json` mean nothing
  physical.
- 🟡 **Part 4 is a 270° servo driven through a 0–180 mapping.** `pca9685_set_angle` maps
  0–180 → 500–2400 µs, while the part's profile declares `usMin/usMax` 500–2500 that
  `gotoAngle()` never reads. Two mappings that disagree: a commanded angle does not
  correspond to a real-world angle on this part. Reconcile before trusting any pose value
  for part 4.
- 🟡 **Elbow (ch4) + Forearm (ch5) shared fuse — root cause is ELECTRICAL, not software.**
  Diagnosed v9.0.0. The two servos have **mutually exclusive voltage domains on one shared
  rail**: part 4 `servo_rds51150sg_150kg` needs 9–12.6 V with a 7.4–8.3 A stall draw, part 5
  `servo_hooyij_ds3240mg` needs 4.8–7.4 V. Whatever single voltage that rail carries, either
  part 5 is over-volted or part 4 is starved into stalling — and a stalling 150 kg servo is
  exactly what pops the fuse.
  - *Real fix (hardware, not yet done):* separate rails and separate fuses, or a per-servo
    regulator so each servo sees its own voltage domain.
  - *Shipped in v9.0.0 as MITIGATIONS ONLY — this issue is NOT resolved:* speed caps
    (`maxSpeedPct: 40`), duration caps, angle clamps, and a serialized `arm-fused-rail`
    power group with a 400 ms cooldown so ch4 and ch5 are never energized concurrently
    (`batchMoveServos` now issues power-grouped servos serially instead of in one
    `batch_pca` call).
  - *Do NOT* run full-range sweeps on ch4/ch5 without supervision.
- 🟡 **PCA9685 channel 15 is being driven with no part configured on it.** Observed holding
  ~1923.8 µs. **Cause not identified.** If a servo is physically attached to ch15 it is
  being held under load indefinitely. Check the channel physically and trace what is writing
  to it.
- 🟡 **Python wrappers bypass the safety layer entirely.** `safetyLimits` is enforced in the
  Node hardware service, so a direct call such as
  `python3 servo_cli.py move_to_pca 4 …` skips every clamp, block and power-group
  serialization — including part 3's `blockAllMotion`. Needs a guard at the wrapper
  boundary before the safety layer can be considered complete.
- 🟡 **Part 8 (Hand of Azura) light is UNPROVEN.** GPIO 16 was verified driving
  `ip → op`, `HIGH → lo`, but **no optical change was detectable** — the lamp is most likely
  outside the webcam's field of view. This is not "working" and not "broken"; it needs a
  human to look at the lamp while the pin is toggled.

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

- ~~**Calibration profile part-ID collision.**~~ **FIXED — the long-term fix is done**
  (corrected 2026-08-15; this entry previously claimed it was only mitigated).
  `server/calibration/store.js` keys every profile by `` `${characterId}:${partId}` ``
  (`scopedKey()`), resolving the character through `selectedCharacterId()` when the caller
  doesn't pass one, with a bare-key fallback so pre-existing legacy profiles still load.
  `tests/unit/calibration-character-scope.test.js` covers the scoping. Profiles are now safe
  to sync across nodes. *Historical context:* part IDs are only unique within a character
  (Orlok part 1 = linear_actuator, Mina part 1 = servo, Dragomir part 1 = continuous-servo
  all collided on key `"1"`), and before v8.1.4 a `git pull` propagated Orlok's
  open-loop-linear profile, causing `"Action 'jog' not supported for part type: servo"` on
  Mina and Dragomir. Recovery if a legacy file misbehaves: delete it → restart service →
  profiles auto-rebuild.
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
- 🔴 **`orchestrationService.deployCode()` is broken (independent of the SSH credential).**
  `services/orchestrationService.js:382` builds
  `` `./scripts/deploy-to-animatronic.sh ${ip}` `` — a single argument — but the script's
  usage is `<character_id> <ip_address> [--dry-run]` and it exits 1 on its own usage check.
  Any UI-triggered deploy therefore fails before it does anything. `npm run deploy:all` from
  the CLI is unaffected.
- ⚪ **`.env` is never loaded — put env vars in the systemd unit.** The app does not use
  `dotenv` anywhere, so a `.env` file has **no effect** on the running service. Both
  `MONSTERBOX_SSH_PASSWORD` and `MB_ADMIN_TOKEN` must be set in `monsterbox.service` (or a
  systemd drop-in). This is a live trap: putting them in `.env` looks correct, changes
  nothing, and leaves SSH fleet control disabled and the admin endpoints open.
- 🟡 **`routes/setup/calibration.js` calibration services are stubs.** `:25` —
  `standardServoCalibration` and siblings return hard-coded
  `{pulseCalibrated:true, positionsCalibrated:true}` and suggested positions with no
  persistence, so calibration *status* shown through this route is not trustworthy. (The real
  stores — `server/calibration/store.js`, `services/actuatorPositionStore.js` — are separate
  and do persist; this is specifically the route's stub layer.)
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

Plus one that was not flake at all:

- ~~**The unit suite was physically stressing Orlok's fused rail.**~~ — fixed **v9.0.0**.
  `tests/unit/calibration-unified-api.test.js` selected `parts.find(type === 'servo')`,
  which on this node is the 150 kg elbow (part 4) on the shared elbow/forearm fuse. Every
  `npm run test:smoke` drove it to **both** extremes and then called set-min/set-max, which
  rewrite the profile from wherever the test parked it. The test now selects through
  `safetyLimits.isTestSafePart()` (skipping power-grouped, quarantined and excluded parts)
  and snapshots/restores the whole calibration file verbatim, so a run leaves zero drift.
  **Open consequence:** part 4's 45–135 bounds are that test's residue and still need a real
  calibration pass — see the Orlok section above.

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

- 🔴 **Leaked SSH password — ROTATION STILL REQUIRED.** The literal is now gone from the
  working tree (v9.0.0: removed from `services/orchestrationService.js`, 16 shell/python
  scripts, 5 docs, and the goblin-management view; every path reads
  `MONSTERBOX_SSH_PASSWORD` via `requireSshPassword()` and fails loudly when unset;
  `sshpass -p` → `sshpass -e` so it no longer appears in the process table).
  **It remains in git history**,
  so the credential is still compromised. Operator actions: (1) change the `remote` account
  password on every node, (2) set `MONSTERBOX_SSH_PASSWORD` in each node's
  `monsterbox.service` environment — note `.env` is *not* loaded by the app, so the systemd
  unit (or a drop-in) is the only place that works, (3) optionally purge history.
  Until step 2 is done, SSH fleet control (reboot / service restart / config push / deploy)
  is disabled by design and reports a clear error.
- 🔴 **`MB_ADMIN_TOKEN` is unset, so destructive `/api/system` endpoints fail open.**
  `requireAdmin` (`routes/api/systemRoutes.js:31`) only *authenticates* when
  `MB_ADMIN_TOKEN` is set; with it unset it degrades to an Origin/CSRF check, and any
  request without an `Origin` header (curl, scripts, any non-browser LAN client) is allowed.
  `POST /api/system/reboot` and `/shutdown` are therefore reachable unauthenticated from
  the LAN today. Set `MB_ADMIN_TOKEN` in each node's service environment to close this.
- 🟡 **`npm audit` is clean, but GitHub Dependabot still reports 3 high — discrepancy
  unresolved.** Locally (v9.0.0) `npm audit` went **2 high → 0**: `brace-expansion`
  1.1.13→1.1.18 / 2.0.3→2.1.4 and `js-yaml` 4.3.0→4.3.1, both transitive and
  **devDependency-only** (mocha/nodemon). Cleared with a plain `npm audit fix` — patch bumps
  only, no new deps, no breaking upgrades. **However, GitHub's Dependabot reported 3 high on
  the last push and those alerts have not been read**, so we cannot say which package the
  third one is or whether the two overlap. `gh` is not authenticated on this node, which is
  why the alerts couldn't be pulled directly. *To close:* authenticate `gh` (or open the
  repo's Security tab) and reconcile the three alerts against the local tree — do not treat
  the clean local audit as proof the Dependabot alerts are gone.

---

## Recently Fixed (for reference)

- ~~Hardware safety limits not enforced through unified calibration~~ — fixed **v9.0.0**.
  The `// TODO: Re-implement safety limits using unified calibration profiles` at
  `services/hardwareService/index.js:1567` is gone; `services/hardwareService/safetyLimits.js`
  clamps angle to the intersection of calibrated bounds and configured limits, caps
  speed/duration, hard-blocks retraction of a part pinned at its mechanical minimum
  (including the bounds-bypassing jog-raw path), and serializes parts sharing a power rail
  with a cooldown. Limits are committed in `config/hardware-safety.json` so they deploy with
  the code and survive a calibration reset; a profile's own `safety` block may only tighten
  them. Parts with no configured limits are pass-through. 19 unit tests.
  **Caveats:** the Python wrappers bypass this layer entirely, and the ch4/ch5 fuse problem
  is only *mitigated* by it — both still open above.
- ~~`/api/calibration/:partId/goto` clamped only to 0–180~~ — fixed **v9.0.0** (now clamps
  to the profile's calibrated angle window, closing a bypass around the safety layer).
  `/nudge` is deliberately left unclamped — it is the operator's supervised tool for
  discovering limits, and clamping it would make a window impossible to widen.
- ~~Hardware-service webcam + mic paths are simulated~~ — fixed **v9.0.0**.
  `startStream`/`stopStream` now probe the real mjpg-streamer service that
  `webcamController` proxies, return the real proxy/snapshot URLs (no more fabricated
  `http://localhost:8080`), try to start the service once, and report an honest failure
  otherwise; `stopStream` detaches rather than killing a service shared by other consumers.
  `microphone.record` delegates to `serverSTTListener.captureChunkWav` (the one canonical
  capture path) and reports real byte counts — an empty capture is now a failure, not a
  success. Verified on Orlok's USB mic: 32044 bytes for 1 s @ 16 kHz mono, peak 2096 /
  RMS 931 (non-silent).
- ~~Motor `stop` never stopped the motor~~ — fixed **v9.0.0** (it sent direction `'stop'`,
  which `motor_control.py` rejects; now drives PWM low at speed 0 and releases the pins).
- ~~Conversation start/stop does not open/close the ElevenLabs WebSocket~~ — fixed
  **v9.0.0**. `setAgentEnabledForCharacter()` creates a headless session and starts the
  agent socket plus the server mic loop; `_waitForAgentReady()` polls until the socket is
  genuinely OPEN so the route reports what actually happened; teardown is idempotent.
  Also fixed underneath it: `getAgentIdForCharacter` returned null for **every** character
  (it resolved the fleet registry through `cfg.dataPath` and so read a per-character copy
  instead of `data/characters.json`) — the feature could not have worked for anyone.
  Verified live on hardware: three on/off cycles, 7 starts paired to 7 stops, 0 lingering
  connections.
- ~~AI settings "Test connection" is a no-op~~ — fixed **v9.0.0** (`routes/aiSettingsRoutes.js`
  now makes a real `getVoices()` call instead of reporting success whenever a key string
  exists, so it can no longer pass against an invalid/expired key). Related: the STT
  fallback model was a TTS model (`eleven_multilingual_v2`) that the STT endpoint rejects —
  now `scribe_v2`.
- ~~Leaked SSH credential present in the working tree~~ — removed **v9.0.0** from
  `services/orchestrationService.js`, 16 shell/python scripts, 5 docs and the
  goblin-management view. **This is a working-tree fix ONLY. The credential is still in git
  history and MUST still be rotated on every node** — see the open 🔴 item under Security.
- ~~Unauthenticated arbitrary file deletion via SSH-key endpoint~~ — fixed **v9.0.0**.
  `DELETE /api/system/ssh/keys/:name` passed the raw route param to `fs.unlink`, allowing
  `../` traversal; `safeKeyName()` now rejects (rather than rewrites) bad names in both
  `deleteSSHKey` and `deployKeyToHost`, with a reserved-name guard, and all three
  `/ssh/keys` routes are gated by `requireAdmin`. *Note `requireAdmin` itself still fails
  open until `MB_ADMIN_TOKEN` is set — see Security.*
- ~~Python wrapper resource leaks~~ — fixed **v9.0.0**: `servo_cli.py` leaked a gpiochip
  handle when a move failed mid-flight (accumulating, since `test_servo` moves 4× per
  process); `linear_actuator_control_v2.py` exited a bad pin config with the chip open and
  the BTS7960 R_EN/L_EN still driven HIGH; `motor_cli.py` had no subprocess timeout, so a
  wedged `motor_control.py` hung forever **with the motor energized** (now bounded to
  duration + 10 s); `speaker_cli.py` never unlinked its temp file; `microphone_cli.py`
  silent exit-1 paths now report a reason on stderr. All 18 wrappers `py_compile` clean.
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

---

## Appendix — July 2026 Stability Audit (58 findings, all RESOLVED in v8.3.1)

Historical record of the 14-subsystem adversarially-verified audit (75 raw → 58 verified:
2 critical, 14 high, 21 medium, 21 low, +1 follow-up). **58 fixed · 1 intentionally
unchanged (#50).** Nothing here is open — kept so the fleet's full bug history lives in one
file. Design notes and detail: `docs/development/STABILITY-AUDIT-2026-07.md`. Items still
worth an on-hardware confirmation are cross-referenced to the live sections above.

| # | Sev | Category | Location | Finding | Status |
|---|-----|----------|----------|---------|--------|
| 1 | critical | security | `routes/api/characterImagesRoutes.js:57` | Path traversal → arbitrary file read via character image endpoint | ✅ |
| 2 | critical | security | `services/systemService.js:176` | Unauthenticated OS command injection via `since` param | ✅ |
| 3 | high | security | `routes/api/characterImagesRoutes.js:92` | Path traversal → arbitrary file deletion via image DELETE | ✅ |
| 4 | high | security | `routes/conversation.js:439` | Unauth path traversal + OOM DoS in `/api/play-audio` | ✅ |
| 5 | high | character-independence | `server/calibration/store.js:4` | Calibration/actuator stores global (partId only) → cross-character corruption | ✅ (re-verify on hardware) |
| 6 | high | crash | `services/audioLoopService.js:142` | Spawned audio child lacks 'error' handler → uncaught crash | ✅ |
| 7 | high | security | `services/characterImageService.js:42` | Path traversal in character image delete/read | ✅ |
| 8 | high | crash | `services/elevenLabsTTSService.js:13` | TTS/STT singletons throw at import when key unconfigured → no boot | ✅ |
| 9 | high | correctness | `services/goblinPlaylistService.js:228` | `getGoblin()` never awaited — playlist deploy always fails | ✅ |
| 10 | high | correctness | `services/goblinVideoService.js:22` | `getGoblin()` never awaited — video ops always 'offline' | ✅ |
| 11 | high | character-independence | `services/jawAnimationSuperPowerService.js:33` | Jaw config ignores requested characterId | ✅ |
| 12 | high | rpi-stability | `services/movement/movementTelemetry.js:80` | Telemetry rewrites growing file to SD every 30s | ✅ |
| 13 | high | data-integrity | `services/movement/transitionEngine.js:326` | `record()` wrong arg order → telemetry corruption | ✅ |
| 14 | high | rpi-stability | `services/scenes/sceneExecutor.js:930` | Analytics rewrites whole file twice per scene — SD thrash + race | ✅ |
| 15 | high | rpi-stability | `services/scenes/sceneQueue.js:135` | Duration/loop re-exec with no delay — busy-loop / spawn storm | ✅ |
| 16 | high | security | `services/systemService.js:343` | SSH key deploy/generate shell/arg injection | ✅ |
| 17 | medium | data-integrity | `controllers/webcamModelsController.js:12` | Webcam models split-brain across two files | ✅ |
| 18 | medium | character-independence | `routes/api/partsApi.js:73` | `/api/parts` ignores query characterId/type | ✅ |
| 19 | medium | security | `routes/api/systemRoutes.js:471` | Unauth destructive control endpoints | ✅ |
| 20 | medium | security | `routes/setup/jaw-animation.js:138` | Unvalidated characterId → config write path | ✅ |
| 21 | medium | security | `server.js:847` | Full app exposed over plaintext HTTP on 3100 | ✅ |
| 22 | medium | rpi-stability | `services/AudioHealthMonitor.js:117` | Self-recovery permanently disabled after 5 lifetime restarts | ✅ |
| 23 | medium | leak | `services/elevenLabsRealtimeSTTService.js:177` | Auto-reconnect leaks WS + keepalive interval | ✅ |
| 24 | medium | error-handling | `services/elevenLabsWebSocketService.js:1658` | `askAgentQuestion` never settles if WS stalls in CONNECTING | ✅ |
| 25 | medium | correctness | `services/goblinDeploymentService.js:21` | Facehugger deploy copies from non-existent dir | ✅ |
| 26 | medium | rpi-stability | `services/goblinManagerService.js:408` | `fetch()` timeout option ignored — handlers hang | ✅ |
| 27 | medium | correctness | `services/hardwareService/index.js:677` | Continuous-servo `rotateContinuous` drops duration | ✅ |
| 28 | medium | data-integrity | `services/jawAnimationSuperPowerService.js:223` | Non-atomic super-powers.json writes corrupt on power loss | ✅ |
| 29 | medium | security | `services/orchestrationService.js:30` | Hardcoded SSH password in shell commands | ✅ (rotate — see Security above) |
| 30 | medium | data-integrity | `services/poses/poseRepository.js:76` | Non-atomic poses.json rewrite risks total loss | ✅ |
| 31 | medium | rpi-stability | `services/randomPoseService.js:131` | Safety amplitude scaling is a no-op — full-range servos | ✅ |
| 32 | medium | correctness | `services/resource/memoryMonitor.js:58` | WARNING suppresses subsequent CRITICAL pre-OOM log | ✅ |
| 33 | medium | race | `services/resource/singleInstance.js:26` | EPERM treated as 'not running' → second instance starts | ✅ |
| 34 | medium | correctness | `services/scenes/armedModeService.js:208` | Armed-mode timeout doesn't cancel running scene | ✅ |
| 35 | medium | error-handling | `services/scenes/sceneExecutor.js:881` | Concurrent-step failures swallowed — false success | ✅ |
| 36 | medium | data-integrity | `services/scenes/scenesService.js:29` | scenes.json non-atomic, unserialized — corruption/lost data | ✅ |
| 37 | medium | rpi-stability | `services/serverPlaybackService.js:461` | One-shot AI playback has no timeout — blocked device hangs | ✅ |
| 38 | low | correctness | `controllers/charactersController.js:19` | `getAll()` references undefined `__dirname` in ESM (dead) | ✅ |
| 39 | low | race | `controllers/webcamController.js:278` | Unserialized RMW of parts.json in setControls | ✅ (withFileLock) |
| 40 | low | error-handling | `public/js/dashboard.js:1642` | Play-button spinner never restored on throw | ✅ |
| 41 | low | error-handling | `python_wrappers/gpio_read.py:8` | No error handling; leaks mmap/fd, silently disables motion | ✅ |
| 42 | low | rpi-stability | `python_wrappers/webcam_cli.py:59` | Capture writes JPEG to /tmp every call, never deletes | ✅ |
| 43 | low | security | `routes/api/audioLoopRoutes.js:56` | Plays arbitrary local file path from user input | ✅ |
| 44 | low | character-independence | `routes/scenes/api.js:379` | Scene CRUD ignores resolved characterId | ✅ |
| 45 | low | race | `routes/scenes/api.js:314` | Concurrent scene create/edit → duplicate IDs / lost updates | ✅ |
| 46 | low | security | `routes/setup/calibration.js:87` | Path traversal (read) via unvalidated characterId | ✅ |
| 47 | low | race | `routes/setup/jaw-animation.js:173` | Concurrent super-powers.json writes clobber (jaw vs head) | ✅ (withFileLock) |
| 48 | low | error-handling | `server.js:600` | Body-parse recovery references undefined partsController | ✅ |
| 49 | low | rpi-stability | `server.js:822` | Perf-monitor setInterval logs every 5s, never cleared | ✅ |
| 50 | low | rpi-stability | `server/calibration/router.js:333` | Sync `fs.writeFileSync` on calibration move path | ⚪ Intentional (crash-recovery durability) — not changed |
| 51 | low | race | `server/calibration/store.js:31` | RMW race in JSON calibration store | ✅ |
| 52 | low | data-integrity | `services/configService.js:26` | `updateSelectedCharacter` non-atomic RMW race | ✅ |
| 53 | low | security | `services/goblinDeploymentService.js:130` | `testSSHConnection` exposes password via `sshpass -p` argv | ✅ |
| 54 | low | rpi-stability | `services/lurkMotionWatcherService.js:158` | Spawns python3 every poll indefinitely | ✅ |
| 55 | low | race | `services/movement/idleLoopService.js:141` | Idle-loop transitions not cancellable after stop() | ✅ |
| 56 | low | correctness | `services/movement/servoCommandBuffer.js:101` | Overwrites higher-priority pending command | ✅ |
| 57 | low | race | `services/poses/poseRepository.js:105` | Concurrent pose add/update/delete → dup IDs / lost updates | ✅ |
| 58 | low | rpi-stability | `services/resource/singleInstance.js:41` | Stale-PID removal doesn't verify PID owner → false 'running' | ✅ |
| 59 | high | correctness | `python_wrappers/servo_cli.py:90` | Null byte broke **all** PCA9685 servo moves since v7.9.6 | ✅ (confirm a real servo move per node) |
