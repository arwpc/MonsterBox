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

> **Operator: start here.** The highest-value physical check on the fleet right now is
> **Orlok part 4 (Elbow) — six commanded moves, zero acoustic signature.** Measure the ch4/ch5
> rail with a multimeter before trusting anything on that rail (it also gates part 5's bounds).
> Details in the Orlok section below.

---

## Per-Animatronic Hardware

### Orlok — char 3 · `192.168.8.120` (primary dev box)
**No longer "fully operational."** The v9.0.0 hardware pass (2026-08-15) found one dead
actuator, one part quarantined for unsafe wiring, one part whose "calibration" turned out to
be test residue, and — most seriously — an elbow that accepts commands in total silence.
Software safety limits now live in `config/hardware-safety.json` (enforced by
`services/hardwareService/safetyLimits.js`). Working and confirmed this session: the jaw
(part 10) and the head (part 15); the arm actuator (part 1) was audible.

- 🔴 **Part 4 (Elbow) accepted six commanded moves with ZERO acoustic signature — CHECK THIS
  FIRST WITH A MULTIMETER.** Verified 2026-08-15: six commanded moves totalling ~95° of travel
  produced **no audible servo noise at all**, while the much smaller jaw servo (part 10, PCA
  ch3) and the arm actuator were plainly audible on the same microphone during the same
  session. The command path reported success — but there is no encoder feedback, so success
  only means the I²C write landed. The three candidate causes are all electrical: **the ch4/ch5 rail is
  unpowered (fuse already blown), the servo is disconnected, or the servo is dead.**
  - *Why it matters most:* this is the single highest-value physical check on the fleet. It
    also **gates part 5** — the forearm's bounds cannot be established while its rail's state
    is unknown.
  - *Diagnostic:* measure rail voltage at the ch4/ch5 servo connectors with the fuse in place,
    then check continuity across the fuse. If the rail is live and the fuse is good, swap the
    servo lead to a known-good channel to isolate servo vs. channel.
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
  - *See also* the zero-acoustic-signature finding at the top of this section — the rail may
    already be dead.
- ~~**PCA9685 channel 15 is being driven with no part configured on it.**~~ — **root-caused
  and fixed v9.0.0.** Nothing mysterious was writing to ch15: `controlPart()` and
  `batchMoveServos()` resolved the part by reading `selectedCharacter` off disk, and
  character-1 part 4 is an "Elbow" on **channel 15** while character-3 part 4 is an "Elbow" on
  channel 4. While that global value was flipped (which the test-mode branch of
  `setSelectedCharacter` did on every test run), "move part 4" on this node drove channel 15.
  See Recently Fixed. *Still worth a physical look:* if a servo is attached to ch15 it may have
  been held under load for a long time.
- 🟡 **Python wrappers bypass the safety layer entirely.** `safetyLimits` is enforced in the
  Node hardware service, so a direct call such as
  `python3 servo_cli.py move_to_pca 4 …` skips every clamp, block and power-group
  serialization — including part 3's `blockAllMotion`. Needs a guard at the wrapper
  boundary before the safety layer can be considered complete.
- 🟡 **Part 8 (Hand of Azura) light is UNPROVEN.** GPIO 16 was verified driving
  `ip → op`, `HIGH → lo`, but **no optical change was detectable** — the lamp is most likely
  outside the webcam's field of view. This is not "working" and not "broken"; it needs a
  human to look at the lamp while the pin is toggled.
- 🔴 **Agent-path jaw opening is shallow.** The jaw moves correctly and stays inside its
  calibrated 63–131 window (v9.0.0 stopped the 0–180 over-drive), but opening **tops out
  around 77–79° against a 131° ceiling** because the conversational agent's audio RMS is low
  relative to this character's configured jaw `sensitivity: 1`. **This is a tuning value, not
  a code defect** — it needs a pass on `/setup/jaw-animation` with the jaw physically watched,
  raising sensitivity until the full range is used without slamming the stops.
- ⚪ **The 34-pose library is authored and statically validated, NOT hardware-confirmed.**
  `data/character-3/poses.json` grew 8 → 34 in v9.0.0 inside the verified-safe envelope (head
  60–120, elbow 80–110, short actuator moves, lamp), excluding parts 2, 3, 5 and 10. No pose
  has been watched running on the physical animatronic. Given the part-4 finding above, expect
  the elbow component of any pose to do nothing until the rail is fixed.

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

- 🟡 **Part 1 "Wiper Motor" has a corrupted description.** `data/character-1/parts.json`
  part 1 reads `"description": "Test updated via comprehensive tests"` and carries a stray
  `config.testFlag` — the same damage class left by a historical hardware-test run and
  repaired on Orlok's part 1 in v9.0.0 (the test that caused it is fixed; see Test Suite).
  **Deliberately NOT fixed here:** this node is offline and its hardware unverified, so the
  real description would be a guess. Write it when someone can confirm what the part actually
  drives, following the convention used by Orlok part 2.

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
- ⚪ **`controlPart` / `batchMoveServos` still fall back to `selectedCharacter`.** Both now
  accept an explicit `options.characterId` (v9.0.0 — the pose engine, transition engine and
  `/api/parts/:id/test` pass it), but callers that omit it still land on
  `readConfig().selectedCharacter`. The seam is narrowed, not closed; it remains allowlisted
  until every caller passes a character.
- ~~**`orchestrationService.deployCode()` is broken (independent of the SSH credential).**~~
  — fixed **v9.0.0**. It built `` `./scripts/deploy-to-animatronic.sh ${ip}` `` — a single
  argument — while the script's usage is `<character_id> <ip_address> [--dry-run]`, so the IP
  landed in `$1` as the character id and the script exited 1 on its own usage check. It now
  passes the character explicitly (falling back to resolving it from the node registry by IP,
  parsed as an integer before it reaches a shell) and fails with a clear message when it
  cannot be determined. ⚠️ Still requires `MONSTERBOX_SSH_PASSWORD` in the service
  environment — see Security.
- 🟢 **Placeholder calibration profiles could outrank real, hand-set markers.** *(fixed
  v9.0.0 in every affected reader; kept here because the underlying design is still a trap.)*
  `data/calibration_profiles.json` gets a full-span **0–180 `autoGenerated` profile stamped
  for every uncalibrated absolute-servo** (`server/calibration/router.js:129`), and
  `autoGenerated` is only cleared when a human actually calibrates. Consumers that read
  `profile.bounds` without checking the flag treat that placeholder as a measurement.
  Audited every reader:
  - `jawAnimationSuperPowerService.js` — **was live**, driving a 63/131 jaw across 0–180 on
    every path including TTS. Fixed: real markers now win, placeholder is last resort.
  - `headAnimationSuperPowerService.js` — **was live**, the placeholder set `calibrated =
    true` so the `parts.json` markers fallback below it never ran. Fixed the same way.
  - `hardwareService/safetyLimits.js` — **was live**, the safety clamp treated the
    placeholder as a measured window, i.e. false confidence that a part was bounded. Fixed:
    placeholder bounds are ignored, so an uncalibrated part reads as uncalibrated.
  - `hardwareService/index.js:1723` and `:1876` (servo invert) — **benign, verified, not
    changed.** These read `bounds?.minAngle ?? 0` / `?? 180`, and a placeholder carries
    exactly 0/180, so it produces the identical legacy `180 - angle` result. Annotated in
    place so the next reader doesn't "fix" a non-bug.

  *Still worth doing:* centralize the placeholder check in the store's read path so a new
  consumer cannot reintroduce this by writing the obvious code.
- 🟡 **Changing a microphone device requires restarting the conversation session.** The
  continuous capture stream introduced in v9.0.0 (`serverSTTListener.startContinuousCapture`)
  binds one device for the life of the session. The old per-tick loop re-resolved the device
  every tick — which is part of what made each tick so expensive — so a mid-session device
  switch used to be picked up automatically. Toggle the conversation/agent off and on after
  changing a character's microphone.
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

Plus two hard (not intermittent) failures, confirmed **pre-existing**:

- ⚪ **Two `test:system` failures in `tests/system/parts-api.test.js`**, one of them
  "should dispatch servo parts without testResult wrapper". Verified 2026-08-15 that they fail
  **identically with the v9.0.0 changes stashed**, so they are not a v9.0.0 regression — they
  are an unreconciled expectation about the `/api/parts/:id/test` response shape. Not fixed in
  this release.

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
- ⚪ **Orlok scene 106 references a part that does not exist.** `data/character-3/scenes.json`
  scene 106 "Full Servo Test - All 4 Servos" drives parts 4, 5, 10 and **11**, but this
  character's four servos are 4, 5, 10 and **15** (`data/character-3/parts.json`). It looks
  like 11 should be 15, but it is show data and has deliberately **not** been guessed at.
  Since v9.0.0 the missing part no longer aborts the scene — hardware steps are non-fatal —
  so it plays through and reports the failed step. An operator should confirm the intended
  part and correct it in the Animation Studio.
- 🟡 **Character 1 part 1 description is test debris** — see the PumpkinHead section above.
  Left unfixed on purpose (node offline, hardware unverified).
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
- 🟢 **`MB_ADMIN_TOKEN` is still unset — remote access is now closed, local access is not.**
  Until v9.0.0, `requireAdmin` (`routes/api/systemRoutes.js`) only *authenticated* when
  `MB_ADMIN_TOKEN` was set; unset, it degraded to an Origin/CSRF check that **allowed any
  request without an `Origin` header** — i.e. every curl, script and non-browser LAN client.
  `POST /api/system/reboot` and `/shutdown` were reachable unauthenticated from the LAN.
  v9.0.0 allows no-`Origin` callers **only from loopback**, so remote unauthenticated
  reboot/shutdown is closed. **Still open:** anything running on the node itself (or anyone
  with a shell on it) can still hit these endpoints without a token, and the token path is the
  only supported way for a legitimate remote script to call them.
  *To fully close:* set `MB_ADMIN_TOKEN` in each node's `monsterbox.service` environment —
  note `.env` is **not** loaded by the app.
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

- ~~Hardware commands resolved to the WRONG character's physical channel~~ — fixed **v9.0.0**.
  `controlPart()` and `batchMoveServos()` read `selectedCharacter` off disk on every call and
  ignored the caller's context. Part IDs are unique only *within* a character — character-1
  part 4 is an "Elbow" on PCA **channel 15**, character-3 part 4 is an "Elbow" on **channel
  4** — so while that global value was flipped, every "part 4" command drove the wrong
  physical channel. **This was the cause of the long-standing "channel 15 driven with no part
  configured" mystery.** It was flipped constantly, too: the test-mode branch of
  `setSelectedCharacter` persisted to disk fire-and-forget, so any test run repointed the LIVE
  node at another character (the old guard only protected `req.app.locals`, which the hardware
  path never reads). Both functions now take an explicit `options.characterId`; `poseEngine`
  and `transitionEngine` pass the character they already knew — the two paths that move the
  fused rail. `setSelectedCharacter` no longer writes to disk from test mode or the test port:
  a full gate run now leaves `app-config.json` untouched.
- ~~`/api/parts/:id/test` could actuate a different character's part~~ — fixed **v9.0.0**. The
  part was loaded with `loadParts(req)` (canonical resolver) but `controlPart()` was called
  without the character, so the command re-resolved against `selectedCharacter` on disk.
- ~~One dead part ended the whole show~~ — fixed **v9.0.0**. Sequential scene steps were
  awaited with no `try/catch`, so a single failing hardware step aborted the entire scene.
  Hardware actuation steps (servo, motor, linear-actuator, light, pose, hardware,
  jaw-animation, head-tracking, goblin-video) are now recorded as failed and the scene plays
  on; control-flow steps (e.g. `sensor` gates) stay fatal on purpose. The scene still reports
  `success:false` with the failing steps listed, so a broken part is visible, not hidden.
- ~~Idle loop silently dropped lights and linear actuators~~ — fixed **v9.0.0**. It claimed
  every pose part as a servo and handed the lot to `transitionServos`, which filters on
  `angleDeg != null` — an idle pose that turns a lamp on had never lit anything. Non-servo
  parts now go through the pose engine; only real servos are claimed in the priority manager.
- ~~Pose duration set in the editor was ignored~~ — fixed **v9.0.0**. The editor writes
  `duration`/`state`, the pose engine read only `durationMs`/`action`, so UI-authored actuator
  poses ran for the 2000 ms default — most of the travel on a 500 ms-class part. Both
  spellings are accepted now, with a unit test that fails if a future read honours only one.
- ~~Canonical STT hung forever on every transcription~~ — fixed **v9.0.0**.
  `transcribeAudio()` wrapped the Buffer in `Readable.from()` with a synthetic
  `audioStream.path`; `form-data` `fs.stat()`s that path for the part length, it does not
  exist, so the multipart body never finished and the POST never completed (the axios
  `timeout` guards the wait for a *response*, not an unsent request body). **Measured >150 s
  hang → 988 ms.** The browser conversation path awaits this inline in the mic-loop tick, so
  one call wedged that session permanently. Verified end to end through the real speaker, air
  and USB mic.
- ~~The conversational agent heard only ~a third of what was said~~ — fixed **v9.0.0**. A
  six-second question reached it as the word "Hello." Four causes: spawn-per-tick mic capture
  (1452 ms of wall clock per 500 ms of audio → one continuous stream, duty cycle 34.4% →
  98.5%); one jaw angle per network chunk instead of per 50 ms frame (4 → 29 transitions on
  the opening line); the jaw driven 0–180 on every path; and echo suppression that stopped
  working after the first reply, so the agent heard its own voice and conversed with itself.
  Live proof: complete verbatim user turns and zero echo turns.
- ~~A placeholder calibration profile overrode hand-set jaw markers~~ — fixed **v9.0.0** for
  the jaw path. Verified by I²C register tracing: 115 register changes on the TTS path, 434
  across an agent exchange, **zero** samples outside the calibrated window, jaw parks at 62.7°
  instead of 0. ⚠️ Jaw travel visibly changed (it now stays inside the calibrated range).
  **The same latent bug exists in every other `bounds` consumer** — see Cross-Cutting above.
- ~~Remote unauthenticated reboot/shutdown~~ — fixed **v9.0.0**. The guard on the destructive
  `/api/system` endpoints let any request *without* an `Origin` header through, which is every
  curl and script, so anyone on the LAN could shut down a running animatronic. No-`Origin`
  callers are now allowed only from loopback; remote scripts must configure `MB_ADMIN_TOKEN`.
  Same-origin browser requests are unchanged and fleet orchestration is unaffected (it uses
  SSH for reboot/restart). *Local unauthenticated access remains — see Security above.*
- ~~UI-triggered fleet deploy never worked~~ — fixed **v9.0.0** (wrong argument order to
  `deploy-to-animatronic.sh`; see Cross-Cutting above).
- ~~Hardware tests left debris in live show data~~ — fixed **v9.0.0**. The continuous-servo
  suite creates a **real** part in the running node's `parts.json`, and its cleanup asserted a
  200 — so any failure threw out of the `after` hook and left a phantom servo behind, pointing
  at a PCA9685 channel and indistinguishable from real hardware. Cleanup now always runs,
  never throws, and prints a loud notice naming the part to delete if it could not. Historical
  damage to Orlok part 1 (description overwritten with "Test updated via comprehensive tests",
  stray `config.testFlag`) was repaired. **The identical damage on character 1 part 1 was
  deliberately left alone** — see PumpkinHead above.
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
