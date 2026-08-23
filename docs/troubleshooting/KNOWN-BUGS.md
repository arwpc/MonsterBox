# Known Bugs & Open Issues

> **Single source of truth for outstanding bugs across the MonsterBox fleet.**
> Organized by animatronic (for one-node-at-a-time work) plus cross-cutting software,
> data-hygiene, and security items.
>
> **Last hardware verification:** 2026-08-18 (10.0.x session) — **Orlok**, far-field
> microphone capture on the ReSpeaker XVF3800 array, proven twice end to end through real air
> (see *Far-field STT* below). The 2026-08-16 v9.2.0 pass — **Orlok** servo/gesture/I²C work
> plus **remote audio-only checks on Mina and Sir Dragomir** — still stands for everything it
> covered. See the per-part notes below for exactly what was proven and what remains unproven.
> Software items updated through the 10.0.x line. Hardware status may have changed since —
> re-verify on each node before relying on it. Update this file as issues are fixed (strike
> them through and note the version).

> ⚪ **Three of six nodes are UNVERIFIED — by choice, not by fault.**
> **PumpkinHead** (char 1) and **Groundbreaker** (char 5) are **deliberately unplugged** and
> are expected to be unreachable; they are not a mystery outage. **Renfield** (char 6) has
> never been on the network at all. Nothing in the 9.x or 10.x trains has been exercised on
> their hardware — treat every claim about them as untested, and re-verify from scratch when
> they are powered back up.
>
> 🟢 **The three live nodes all answered `/health` with `10.1.0` on 2026-08-19 07:14**
> (Orlok 192.168.8.120 · Sir Dragomir 192.168.8.130 · Mina 192.168.8.140), all serving HTTPS.
> The exact release number lives in `package.json` and nowhere else — read it there rather
> than trusting a number written into prose here, and remember that a `/health` version
> string is *not* proof the node runs that code (see the deploy-drift item below). Per-node
> version claims in the sections below were corrected to 10.1.0 in the 2026-08-19 log review.

> 📋 **Last log review: 2026-08-19 07:14–07:25 (v10.4 overnight session, from Mina).**
> `scripts/log-review.mjs` run on all three live nodes plus a direct `grep -a` sweep of
> **both** `/var/log/monsterbox.log` and `/var/log/monsterbox.err` on each. Findings folded
> into the sections below; the new ones are grouped under *Opened from the 2026-08-19 v10.4
> overnight log review*.
>
> ⚠️ **A fix only exists on a node that received the deploy** — this is not theoretical: the
> ear-check caught Sir Dragomir still speaking in his *retired* voice until v9.2.0 was actually
> deployed to his Pi. The three offline nodes have received nothing.

Legend: 🔴 blocking / broken · 🟡 reliability / intermittent · 🟢 mitigated, long-term fix pending · ⚪ constraint / gotcha (not a defect)

> **v9.0.0 release verification — 2026-08-16 00:43, on the Orlok node, real hardware.**
> Service healthy on v9.0.0 · quarantine holds on both parts 3 and 4 through the calibration
> API *and* the parts API (HTTP 409 with the reason) · a 175° head request clamps to 120 and
> reports `clamped: true` · panic completes 4/4 local actions in 28 ms · the USB mic captured
> 32044 bytes · mjpg-streamer served a 49 KB frame · all 10 pages HTTP 200 · browser suite
> 147 passed / 1 skipped / 0 failed · gate green.
>
> The clearest single proof is pose 1: it returns `success: false, partialFailure: true,
> executedParts: 2`, with the head and lamp moved and part 4 refused **carrying its full
> explanation**. Before v9.0.0 that same pose returned `success: true`, because one working
> part masked a dead one.

> **v9.2.0 verification — 2026-08-16, Orlok node, real hardware (I²C register sampling).**
> PCA9685 re-init glitch gone: 24 one-shot commands aimed at an unconnected channel produced
> **11 MODE1 SLEEP events and 53 no-pulse reads on the head channel before, 0 and 0 after**
> (daemon down — the direct path alone). With the daemon: two channels written **<1 ms apart**,
> a two-channel 50 Hz ramp **sustained 49.9 Hz**, **p50 round trip 3.37 ms** against 200–580 ms
> per process spawn. One gesture moved the head 98.8° → 119.6° and the forearm 103.9° → 109.9°
> concurrently, 478 samples per channel, **0 rejected reads, 0 SLEEP events**.
> ⚠️ *These are register-level measurements — they prove clean, concurrent pulse widths reached
> both channels, not that a servo physically moved. There is still no encoder feedback.*
>
> **Audio verified by ear** (`scripts/fleet-audio/earcheck.mjs`, each node recorded by its own
> microphones and transcribed with Scribe). Final fleet run with **all three live nodes on
> 9.2.0**: **Orlok AUDIBLE** (20.1 dB rise, 100% word recall), **Sir Dragomir AUDIBLE**
> (33.3 dB, 69% recall, **canonical voice confirmed**), **Mina AUDIBLE** (12.4 dB, 80% recall,
> **canonical voice confirmed**). **PumpkinHead, Groundbreaker and Renfield `OFFLINE` —
> untestable, not passing.** The Dusk Ceremony was separately verified end to end on real
> speakers: Mina 6.5 dB / 100% recall, Orlok 11.3 dB / 100%, Sir Dragomir 13.0 dB / 92% — all
> `HEARD`.

> **Operator: start here.** Part 4 (Elbow) is now **confirmed physically dead** by the
> operator and is software-quarantined, so the open question has moved from *"is it broken?"*
> to **"what is the ch4/ch5 rail actually doing?"** — measure it before trusting anything on
> that rail, because it still gates part 5 (Forearm), which may well be fine. After that:
> trace part 3's wiring, and swap part 2 onto part 1's known-good MDD10A channel.
> Details in the Orlok section below.

---

## Per-Animatronic Hardware

### Orlok — char 3 · `192.168.8.120` (primary dev box)
**No longer "fully operational."** The v9.0.0 hardware pass (2026-08-15) found a dead elbow
servo (since operator-confirmed), a dead left-arm actuator, a part quarantined for
contradictory wiring, and a part whose "calibration" turned out to be residue left by a unit
test. Software safety limits now live in `config/hardware-safety.json` (enforced by
`services/hardwareService/safetyLimits.js`), and parts 3 and 4 are blocked outright there.

**Confirmed working:** jaw (part 10), head (part 15), Hand of Azura lamp (part 8), speaker
(6), microphone (7), webcam (9), PIR sensor (14), and the right-arm actuator (part 1).
**Confirmed dead:** elbow (4), left-arm actuator (2). **Blocked pending a human:** bow (3).
**Unknown:** forearm (5) — may be fine, gated on the rail question. v9.2.0 sent it a clean
concurrent pulse (103.9° → 109.9°, verified at the registers) but **that is not proof it
physically moved**, and the rail question is unchanged.

**Status 2026-08-19:** serving **10.1.0** (`/health` 07:14), zero failed units. Speaker
AUDIBLE by ear (2026-08-16); servo command path rebuilt (see the verification block at the
top). No new physical work has been done on parts 2/3/4/5.

- 🔴 **Head tracking is refusing to drive the head — 239 log lines, the fleet's single
  loudest error signature (log review 2026-08-19).**
  `/var/log/monsterbox.err` on Orlok:
  `Head tracking: servo 15 has no usable calibrated window — refusing to drive it until it is calibrated`
  Part 15 has **no entry at all** in `data/character-3/servo_calibrations.json`, so
  `calibratedBounds()` correctly withholds a window and the v10.1 guard refuses the motion.
  This is the guard working as designed — but it means **head tracking on Orlok is a no-op
  right now**, and the "Confirmed working: head (part 15)" line above refers to *direct*
  head commands, not the tracking path. Reconciled here rather than left as a contradiction.
  - *What would prove it fixed:* a real min/max calibration written for part 15 through the
    calibration UI (`autoGenerated:false`, non-degenerate span), then zero
    `no usable calibrated window` lines across a head-tracking run.
  - *Grep:* `grep -ac "Head tracking: servo 15 has no usable" /var/log/monsterbox.err`
- 🟡 **STT still fails after the far-field fix — 9 `Transcription failed` lines across 3
  sessions (log review 2026-08-19).** The capture-method ladder is behaving exactly as the
  XVF3800 trap list predicts — `parec` (2), `ffmpeg` (8) and `arecord` (2) each produced
  **no audio**, the session fell back to per-chunk polling, and then transcription itself
  failed: `⚠️ Session stt_1787104886773_gpqp5w: Transcription failed (1/10): STT failed`.
  The *capture* half is understood (PyAudio is the only layer that streams from the array);
  the `STT failed` half is a **separate, still-open** failure and must not be assumed to be
  the same bug. Prove them apart: FRAMES first (non-zero bytes AND non-zero RMS), then the
  transcription call.
  - *Grep:* `grep -a "Transcription failed" /var/log/monsterbox.err`
- 🟡 **The `arm-fused-rail` voltage-class warning is real on Orlok** (27 lines this boot;
  it fires on **every** startup health check):
  `⚠ servoChannels: power group 'arm-fused-rail' mixes incompatible voltage classes (part 4 9.0-12.6V, part 5 6.0-7.4V) — no single rail voltage is in spec for all of them`
  Unlike the Dragomir sighting (which was the wrong-character audit bug, fixed in `645ac407`),
  **these two parts really are Orlok's and really do share one fused rail** — it is the same
  rail the operator is measuring for part 4. The warning should stay until the rail is
  resolved; it is data, not noise.
- 🟡 **Journal is 218 MB against a 64 MB cap, with ~82,000 warning+ lines this boot.** The
  fleet-wide journald cap from the 2026-08-17 OS baseline is **not holding on Orlok**
  (Mina and Sir Dragomir are both at 56 MB). Either the drop-in was lost on this node or
  something is out-flooding rotation. SD wear item — see the OS-baseline note.
  `journalctl --disk-usage` → *Archived and active journals take up 217.6M*.
- ⚪ **One USB disconnect this boot** — `Aug 18 23:20:58 orlok kernel: usb 1-1.2: USB
  disconnect, device number 4`. **No** over-current lines in `dmesg` at review time, so this
  is not (yet) the hub over-current fault that ate a webcam before. Watch for recurrence.

- 🔴 **Part 4 (Elbow) is PHYSICALLY DEAD — operator-confirmed 2026-08-15 ("the elbow is
  jacked"), and now software-quarantined.** `config/hardware-safety.json` sets
  `blockAllMotion` on part 4 so a dead servo cannot take the shared fuse with it; the
  re-enable instruction is one line in that file. Diagnosis history below, kept because it is
  a worked example of *how* the silence was read — and of how nearly it was read wrongly.
  The remaining open question is the **power/rail** state, which the operator is working out.
  **Part 5 (Forearm) may still be good** and has not been ruled out; it needs bounds
  established once the rail is settled.
- ⚪ *(historical detail for part 4)* Six commanded moves totalling ~95° of travel
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
- 🟢 **Part 8 (Hand of Azura) light WORKS** — operator-confirmed 2026-08-15 ("it's been
  good"). GPIO 16 was already verified driving `ip → op`, `HIGH → lo`; the automated check
  reported it UNPROVEN only because **no optical change was detectable from the head-mounted
  webcam**, which does not point at the lamp. Worth keeping as a worked example: an
  instrument's blind spot read as a fault, and the honest "unproven" verdict was the correct
  output at the time — the lamp was never actually in doubt, the camera was.
- ~~**Agent-path jaw opening is shallow.**~~ — **fixed v9.0.0.** Raw RMS was mapped
  linearly onto the servo range: linear in pressure, while the sense of "how open is
  that mouth" is logarithmic, and scaled by the voice rather than the character. It
  now uses a perceptual mapping (dBFS, rolling p90 of voiced frames as the loud
  reference, floor 20 dB below, gamma expansion). Measured by I2C register sampling
  on the agent path: max angle **77.53° → 130.73°** against a 131 ceiling, travel used
  **21.8% → 100%**, distinct positions **31 → 115**, with no over-travel either way.
- ⚪ **The 34-pose library is authored and statically validated, NOT hardware-confirmed.**
  `data/character-3/poses.json` grew 8 → 34 in v9.0.0 inside the verified-safe envelope (head
  60–120, elbow 80–110, short actuator moves, lamp), excluding parts 2, 3, 5 and 10. No pose
  has been watched running on the physical animatronic. Given the part-4 finding above, expect
  the elbow component of any pose to do nothing until the rail is fixed.

### Mina — char 2 · `192.168.8.140`
🟢 **Serving 10.1.0** (`/health` 2026-08-19 07:14; zero failed units, journal 56 MB — inside
the 64 MB cap). *Previously recorded here as 9.3.0 — corrected by the 2026-08-19 log review.*
(verified post-reboot 2026-08-18: zero failed units, boot-check READY,
canonical sink volume 0.90 auto-applied with its log line, `wpctl` reads 0.90 unmuted,
camera serving JPEG on :8090). Speaker and voice verified by ear 2026-08-16: **AUDIBLE**,
12.4 dB rise, 80% word recall, **canonical voice confirmed** against the committed agent
snapshot; 6.5 dB / 100% recall in the Dusk Ceremony. Her voice was never wrong — Mina was one
of the two characters the broken map happened to get right.

- 🔴 **Webcam control polling fails on every tick — `deviceId` is a device *name* where the
  Python CLI wants an *index* (found 2026-08-19 log review, Mina only).** 25 of the 26
  error lines in her `/var/log/monsterbox.err` are the same one:
  `❌ Hardware Error: Process exited with code 1`, and the matching `/var/log/monsterbox.log`
  line names the culprit:
  `🔧 Hardware Command: /usr/bin/python3 .../python_wrappers/webcam_cli.py list_ctrls video0`.
  Reproduced by hand on the node:
  `{"status": "error", "message": "invalid literal for int() with base 10: 'video0'"}` (exit 1).
  **Root cause:** `data/character-2/parts.json` part 7 ("Mina Cam") carries
  `config.deviceId: "video0"` alongside `config.devicePath: "/dev/video0"`, while
  `services/hardwareService/index.js:1061` does `runWrapper('webcam_cli.py', ['list_ctrls', String(deviceId)])`
  and `python_wrappers/webcam_cli.py` parses that argument as an int. The webcam itself is
  fine (`/dev/video0` exists; startup health reports `Webcam: OK`) — only the control-listing
  path is broken. Cost: a ~4 s Python spawn plus two error lines onto the SD card per poll.
  - *Fix direction:* make one side own the contract — either normalise `deviceId` to an
    integer index at the call site, or teach `webcam_cli.py` to accept `video0` /
    `/dev/video0`. Check the other characters' `parts.json` for the same string form before
    picking. **Note `data/character-2/parts.json` is currently uncommitted on this node.**
  - *Grep:* `grep -a -B2 "Hardware Error: Process exited with code 1" /var/log/monsterbox.err`
    then `grep -a "webcam_cli.py list_ctrls" /var/log/monsterbox.log`
- ⚪ **Test debris in her live logs, not a defect.** Repeated
  `🗑️ deleteCharacter: character 7 ("Temp") ... PERMANENTLY DELETED` and
  `Error creating pose: Error: Pose must have at least one part`
  (`services/poses/poseRepository.js:217`) are the system/pact suites exercising the create
  and delete paths against the *running* server. Both are the code refusing bad input
  correctly. Worth knowing so they are not chased as bugs — and worth remembering that
  suites run against a live node leave real state behind.
- 🟡 **Her speaker was too quiet to be intelligible at the default sink volume.** At **0.65**
  she scored `GARBLED` (10.2 dB rise, 47% recall); **raised to 0.90** she is `AUDIBLE`. Check
  this after any audio-stack change or reboot — `wpctl` volume is node-local and is not
  deployed. See the fleet speaker-balance item under Cross-Cutting. *2026-08-18: the
  v9.3.0 canonical auto-apply did its job on reboot — 0.90 applied and logged.*
- 🟡 **One crash on the first service start after the 2026-08-18 reboot — stale-PID
  race, auto-recovered.** First start (23:09:47) exited 1 with `MonsterBox already
  running (PID 933). Exiting.`; the systemd restart 4 s later judged the very same PID
  "not a running MonsterBox process", removed the stale file and started clean. Two
  liveness checks disagreed about PID 933 four seconds apart — a pre-reboot PID file
  plus boot-time PID reuse, and the "already running" path trusts a bare alive-check
  where the cleanup path verifies process identity. Orlok and Dragomir hit the same
  stale file on the same reboot and cleaned it without crashing — only the reuse race
  bites. Cost today: ~12 s of boot delay under `Restart=on-failure`. *Fix direction:*
  give the "already running" check the same is-it-actually-MonsterBox test the cleanup
  path already has. **Fix shipped 2026-08-18** in `services/resource/singleInstance.js`,
  deployed to all three online nodes: a PID file whose mtime predates the current boot
  is removed without probing (PIDs reset at boot, so any live match is reuse), and a
  process that vanishes between the alive-check and the `/proc` read now reads as
  stale instead of "assume ours". **Proof fixed:** two consecutive reboots with one
  clean start each.

🟡 **The "dead" Neck and Eye were software all along — awaiting one visual confirmation**
(2026-08-16 evening session, v9.2.1). Three compounding software bugs made the servos look
electrically dead, and each is now fixed:

1. `POST /api/parts/:id/test` read only `{position}`, while the Pose Editor and calibration
   pages send `{action:'moveToAngle', params:{angleDeg}}` — so **every UI servo command
   silently became "go to 50°"** with `success:true`. Commanding different angles did
   nothing visible, which read as a dead servo.
2. The Neck's calibration profile carried `{minAngle:108, maxAngle:108}` — a zero-width
   window captured by pressing Set Min and Set Max while the servo was not moving (because
   of bug 1). Every command clamped to exactly 108°: **frozen by its own calibration.**
   The profile is reset to uncalibrated, and every bounds writer now refuses a window that
   would pin a part (`isDegenerateWindow`, enforced in set-min/set-max, marker writes, the
   raw profile POST, and the jaw quick-adjust).
3. A leaked VU-meter polling loop on the calibration page stacked one Python+ALSA spawn
   loop per part selection, which is why the whole animatronic **got slower with every jaw
   command** — that was CPU starvation, not hardware.

After the fixes, all three servos sweep their full commanded ranges at the PCA9685 register
level with zero I2C errors and move concurrently in ~85 ms round-trips. **Still needed: eyes
on the hardware** to confirm the Neck and Eye physically track the (now-correct) register
writes. If they genuinely do not move despite correct sweeping registers, the wire-swap
diagnostic below still applies.
  - *Wire-swap (no multimeter):* plug the known-good Jaw servo into ch8/ch11 and cycle it.
  - *Note:* eye lights being on does **not** prove V+ is alive — the laser is a 3 V relay
    driven by the signal pin, not V+.
- 🟢 **Jaw calibration re-measured** (2026-08-16): profile now `{minAngle:22, maxAngle:91}`,
  autoGenerated:false — the old 85-95 auto-default is gone. Note `super-powers.json` still
  configures the jaw animation window as 17/153; the calibrated 22..91 correctly wins at
  drive time.

### Sir Dragomir — char 4 · `192.168.8.130`
🟢 **Serving 10.1.0** (`/health` 2026-08-19 07:14; journal 56 MB, avahi service file present
and owned by `remote`, rewritten 2026-08-19 01:37). *Previously recorded here as v9.3.0 —
corrected by the 2026-08-19 log review.*
🟢 **Back on the network** (verified 2026-08-17; the 2026-08-16 ~18:30
outage resolved with the fleet power-down/reboot — cause never determined, watch for
recurrence). His `library.json "not iterable"` flood is gone after the v9.3.0 deploy.
🟢 **Fully operational** as of 2026-04-18, user-confirmed. ⚠️ **The channel map previously
recorded here (and in the README) was WRONG.** `parts.json` — the source of truth, which
the calibration router itself re-syncs channels from — says: **Head ch0 (continuous),
Jaw ch1, Magic Box ch3.** The old "jaw ch0, magic box ch8, head ch4" claim matched nothing
on his chip; register audit 2026-08-17 confirms ch0/ch1/ch3 are his live channels.
The jaw-animation "servo must be calibrated" false block was fixed in v8.1.6.
- 🟡 **Jaw animation deliberately switched OFF 2026-08-17 pending calibration.** His jaw
  (part 2, ch1) has **no calibration profile, no parts.json markers, and a 0–180 superpower
  window** — TTS would drive the servo into its mechanical stops on every utterance (the
  exact over-drive v9.0.0 fixed on Orlok). Calibrate the jaw, then re-enable
  `jawAnimation.enabled` in `data/character-4/super-powers.json`.
- 🟢 **Stale Orlok voice tuning on this node — a missed deploy window, NOT a config
  writer** (log-review 2026-08-18). His copy of
  `data/character-3/ai-config/tts-config.json` reads 0.3/0.5 against the committed
  0.25/0.6. Mtime forensics: that file is stamped 2026-08-16 18:38 while every other
  character's tts-config on his disk carries the 2026-08-17 20:19–20:20 rsync stamp —
  Orlok's film-profile tuning was committed *after* that deploy and never re-pushed.
  No process wrote the file, so this is not the voice-clobber class. **Healed
  2026-08-18:** canonical committed copy pushed to his node; `git status` clean for
  the file. Kept as a worked example: mtime forensics distinguish a missed deploy
  window from an active config writer.

**v9.2.0 status:** running 9.2.0. Speaker and **voice** verified by ear on 2026-08-16 — the
ear-check first caught him speaking in his **retired** voice `SOYHLrjzK2X1ezoPC6cr` (39.3 dB
rise, 94% recall — audible, and wrong) because the fix had not yet been deployed to his Pi;
after deploying v9.2.0 he returned **AUDIBLE in his canonical voice `wXvR48IpOq9HACltTmt7`**,
checked against the committed agent snapshot (33.2 dB rise then, 33.3 dB / 69% recall on the
final fleet run). No servo work was done on this node.

- 🟡 **Something is asking him for character 999 — twice (log review 2026-08-19).**
  `/var/log/monsterbox.err`:
  `Error loading parts for character 999 : ENOENT: no such file or directory, open '/home/remote/MonsterBox/data/character-999/parts.json'`
  999 is a sentinel/test id, not a real character. Harmless today (the loader returns
  empty and logs), but it means some caller reaches the parts loader with an id that was
  never resolved through `resolveCharacter()`. Find the caller before it reaches a path
  that *writes*.
  - *Grep:* `grep -a "Error loading parts for character" /var/log/monsterbox.err`
- 🟡 **Pose "Neutral" is degraded — both his servos still lack angle windows.**
  `⚠️  Pose "Neutral" is degraded: Jaw Servo has no calibrated or configured angle window | Magic Box Servo has no calibrated or configured angle window`
  Same root cause as the jaw-animation-off item above, now visible in a second place: the
  pose path degrades instead of driving. Calibrating jaw (part 2, ch1) and Magic Box
  (part 3, ch3) closes both items at once.
- ⚪ **`servoChannels` and avahi `EACCES` lines in his `.err` are pre-fix history, not a
  regression** — verified 2026-08-19. His current boots read `✓ servoChannels: ok` with
  `Hostname "sirdragomir" → character 4 (already correct)`, and
  `/etc/avahi/services/monsterbox.service` is owned by `remote` and was rewritten
  2026-08-19 01:37. The `.err` file simply still holds the older lines. **The log-review
  collector replays them** — see the watermark caveat under Cross-Cutting.
- ⚪ **He is the loud one.** He carries across a room at sink volume **0.30**, where the two
  Unitek Y-247A nodes need ~0.5+ — see the speaker-balance item under Cross-Cutting before
  setting a single fleet-wide volume.

⚠️ **His jaw animation was found switched OFF** after a browser test fired a real fleet
emergency stop (see Security / Ops). It has been **restored**, but re-check any node's
superpowers after a suite run that predates the `httpNode` guard.

### PumpkinHead — char 1 · `192.168.8.150`
🔴 **Offline (long-term).** Not verified. Hardware state unknown until the node is powered
and reachable. **Still offline for the entire v9.2.0 session** — nothing in v9.1.0/v9.2.0 has
run on this node, including the wrong-voice fix that made him speak in Sir Dragomir's voice.

- 🟡 **Part 1 "Wiper Motor" has a corrupted description.** `data/character-1/parts.json`
  part 1 reads `"description": "Test updated via comprehensive tests"` and carries a stray
  `config.testFlag` — the same damage class left by a historical hardware-test run and
  repaired on Orlok's part 1 in v9.0.0 (the test that caused it is fixed; see Test Suite).
  **Deliberately NOT fixed here:** this node is offline and its hardware unverified, so the
  real description would be a guess. Write it when someone can confirm what the part actually
  drives, following the convention used by Orlok part 2.

### Groundbreaker — char 5 · `192.168.8.200`
🔴 **Offline (long-term).** Not verified. Also see the character-ID mismatch below.
**Still offline for the entire v9.2.0 session** — unverified, and he was one of the characters
speaking in Orlok's voice before v9.1.0.

### Renfield — char 6 · *no address (`ip: null` by design)*
🔴 **Has never been on the network. Nothing about this character is hardware-verified.** His
data, agent, fleet entry and placeholder image are complete and schema-valid; the Pi does not
exist yet.

- ⚪ **`config/animatronics.json` deliberately carries `ip: null`.** Measured on the Orlok node:
  `null` fails in **~126 ms** (`ENOTFOUND`, and it never passes `isValidHost()` so it is never
  dialled), a guessed `192.168.8.170` takes **~3100 ms** (`EHOSTUNREACH`, and could belong to
  a stranger's device), and `renfield.local` takes a full **~5000 ms** timeout. `isValidHost()`
  drops him from `getControllableAnimatronics()`, so superpower / volume / emergency-stop /
  fleet-health fan-outs skip him for free. **Do not "fix" this by inventing an address.**
  His `id` is 6 to match `characterId` 6 on purpose, so discovery collapses onto the config
  entry instead of producing a duplicate node (the mistake already present for Groundbreaker).
- 🟡 **Shake-motor wiring is corrected but UNVERIFIED on hardware.** `parts.json` declared
  **both BTS7960 enable lines on GPIO 17** (inherited from the Groundbreaker part it was copied
  from). `setup_bts7960_pins()` claims each enable line separately, and claiming the same line
  twice on one chip handle returns `GPIO_BUSY (-79)` — so **every shake command would have
  failed at pin setup, before the motor ever turned.** L_EN moved to GPIO 23 and the wiring
  (including "do not jumper the enables together") is spelled out in the part description.
  `npm run validate:schemas` passes; **nothing has been driven.**
- ⚪ **His character image is a placeholder**, not a photograph of the prop — it says so on its
  face. Replace it by uploading a real photo on the character setup page once the prop exists.

---

## Cross-Cutting Software Bugs

### Opened from the 2026-08-19 v10.4 overnight log review

- ⚪ **`scripts/log-review.mjs` only works from the repo root — a real trap for fleet runs.**
  It calls `readdirSync('data')` relative to the *current working directory*
  (`scripts/log-review.mjs:101`), and SSH lands in `/home/remote`, not the repo. So
  `ssh remote@<ip> node /home/remote/MonsterBox/scripts/log-review.mjs` dies with
  `Error: ENOENT: no such file or directory, scandir 'data'` — which reads like a missing
  data directory on that node, and is not. **Always** `cd /home/remote/MonsterBox` first:
  `ssh remote@<ip> "cd /home/remote/MonsterBox; node scripts/log-review.mjs"`.
- ⚪ **The collector's "since last review" watermark replays old lines after a reset.**
  Findings reported as *new* may be history that predates a fix — on 2026-08-19 that
  produced a Sir Dragomir report containing the `servoChannels` wrong-character warning and
  the avahi `EACCES`, both fixed weeks earlier and both disproved in one command by reading
  his *current* boot lines. **Rule: before reopening a fixed item on a replayed line, check
  the current boot** (`grep -a "servoChannels" /var/log/monsterbox.log | tail -3`), because
  `/var/log/monsterbox.err` carries no timestamps of its own.
- 🟡 **The mute-flag check cannot tell a muted show from a deliberately silent session.**
  All three nodes reported `[ERROR] audio: speaker mute flag is ON — the show plays
  silence` on 2026-08-19; that was **correct and intended** (the overnight session runs
  with speaker output off). As written, the check will cry wolf through every silent
  session and then be ignored on the night it matters. *Fix direction:* have it report the
  flag's value and **when/by what** it was last set (the state now persists in
  `data/speaker-state.json`), rather than treating ON as an error by itself.
- ⚪ **Fleet queue fan-out logs the two deliberately-unplugged nodes as errors on every
  operation.** From Sir Dragomir's `.err`:
  `Queue clear failed for PumpkinHead -> https://…/scenes/api/queue/clear [no-status]: connect EHOSTUNREACH`
  (4 `EHOSTUNREACH` lines, PumpkinHead + Groundbreaker, enqueue and clear). Expected — but
  it means a genuinely-new outage looks exactly like the two nodes that are off on purpose.
  Fan-out should skip nodes with no recent discovery rather than error per call.
- 🟡 **`Queue enqueue failed for Orlok … [500] {"success":false,"error":"Scene not found"}`
  is still happening** — the same `defaultSceneId` data mismatch recorded in the
  2026-08-16 sweep, now observed again on 2026-08-19 for **Orlok and Sir Dragomir**
  (not just the offline nodes). Fleet queue start still fans out a scene id the target
  does not have. Not fixed; evidence refreshed.
- 🟡 **`⚠️ Language code parameter NOT sent (langToSend="auto")`** on Sir Dragomir
  (`/var/log/monsterbox.log`, 2 lines). The STT/agent path resolves the language to the
  literal string `"auto"` and then omits the parameter entirely. Worth confirming that
  omission is the intended meaning of "auto" for the current ElevenLabs API rather than a
  value that failed to resolve.
- 🟡 **Two of three live nodes are carrying large uncommitted diffs.** Orlok and Sir
  Dragomir each report **71 modified tracked code files** and **HEAD 45 commits behind
  `origin/main`**; Mina has 9 modified files (including `data/character-2/parts.json`,
  which holds the webcam bug above). `deploy-all.sh` rsyncs files without moving git, so
  these working trees are the divergence — sync before work, and treat no node's git HEAD
  as evidence of what it runs.

### Opened from the 2026-08-17 post-reboot health pass

- 🟡 **`boot-init.sh` probed plain HTTP against the HTTPS server — the fleet-wide
  `monsterbox-init` unit has never enabled random poses since the HTTPS switch**
  (found 2026-08-18 via Dragomir's `curl: (52) Empty reply from server` boot line;
  same bug class as the boot-check probe fixed 2026-08-17). Its health-wait burned
  30 s of every boot, its `enable-random-poses` POST always failed, and the `|| true`
  swallowed it — "boot-init complete" was logged regardless. Only nodes with the
  boot-check unit got random poses, via the already-fixed
  `monsterbox-boot-complete.sh`. **Fixed 2026-08-18:** `https://` + `-k`, shipped to
  all three nodes. ⚠️ *Behavior note:* next boot, Orlok and Sir Dragomir will enable
  random poses at startup **for the first time ever** — the designed default a bug
  suppressed. Safety rails (blockAllMotion, calibrated bounds) still apply, but if
  poses-at-idle are unwanted during calibration work, disable there, not by relying
  on this bug. **Proof fixed:** post-boot, `enable-random-poses` state is on and
  boot-init logs no curl error.
- 🟡 **`monsterbox-boot-check` is only installed on Mina — Orlok and Sir Dragomir
  never report "READY FOR HALLOWEEN"** (found 2026-08-18). On Dragomir systemd says
  the unit could not be found; on both nodes `/var/log/monsterbox-boot.log` is 0 bytes
  (untouched since Aug 16 22:37) while Mina's shows the full readiness run. The unit
  file exists in the repo (`scripts/monsterbox-boot-check.service`) but was never
  installed/enabled on the other nodes — the 2026-08-17 boot-check fixes were only
  proven where the unit exists. **Fix shipped 2026-08-18:** unit installed + enabled
  on Orlok and Dragomir with `/var/log/monsterbox-boot.log` pre-created owned by
  `remote` (a root-owned log killed the script at its first `tee` under `set -e` —
  the old Mina bug), `deploy-to-animatronic.sh` now installs the unit on every
  deploy, and the unit's own Standard{Output,Error} moved to the journal — it was
  appending to the same file the script already tees to, double-writing every line
  to SD. **Proof fixed:** next reboot leaves a READY line on all three nodes.

- 🔴 **System tests on a live node send REAL fleet writes through the production
  process — confirmed live, not theoretical.** `test:system` sets `MB_TEST_MODE=1` for
  *mocha*, but the target is the production server's `:3100` listener, whose
  `orchestrationService.httpNode` guard keys on the **server's** env — unset in
  production. During the 2026-08-17 full-fleet test pass, Mina's scene suite fired
  `queue/clear` and `queue/enqueue` at Orlok and Sir Dragomir; playback was prevented
  only by the `defaultSceneId` data mismatch ("Scene not found") — luck, not a guard.
  *Fix direction:* requests arriving on the test listener should be tagged and refused
  by `httpNode` for writes, closing the egress regardless of which process serves them.
  Until then: full suites on a live node are an operator decision, and peers should be
  checked afterward (queues, superpowers, volumes).
- 🟡 **`tests/hardware/{continuous-servo,linear-actuator}-calibration` are rotted
  against a retired API** — they exercise six `/api/continuous_servo/:id/*` routes of
  which only `reset` still exists (the per-type calibration API became the unified
  `/api/calibration/:partId/*`). 2026-08-17 repaired their part-creation/cleanup (they
  now create and remove test parts correctly — five debris parts were left in Mina's
  live `parts.json` by earlier broken runs and have been removed) but the inner
  assertions need a rewrite against the unified API. Manual-only suites; not in the
  gate.
- ~~**Every test-suite run flattened the selected character's voice tuning to
  0.5/0.5.**~~ — **fixed 2026-08-17.** `tests/system/ai-audio.test.js` POSTed page
  defaults to the live `/api/elevenlabs/tts/config` and never restored; stability /
  similarity died while `voice_id` survived, so it read as "the voice is off" rather
  than "a file got clobbered". The test now snapshots and restores; verified on all
  three nodes (config intact after the save test). `scripts/log-review.mjs` flags this
  class as tts-config drift vs the committed canonical.
  **Recurred on Orlok, found 2026-08-20:** `data/character-3/ai-config/tts-config.json`
  drifted to stability 0.6 / similarity 0.4 / `eleven_flash_v2_5` (canonical: 0.25 /
  0.6 / `eleven_v3`). Canonical restored from HEAD + service restarted the same night,
  but the WRITER was not identified — the 2026-08-17 fix covered `ai-audio.test.js`,
  so something else also writes this file. Hunt the writer before trusting the file
  again (mega-session work item 1 covers this; suspect other suites or a save path
  that posts page defaults).
- ~~**`monsterbox-boot-check` could never pass**~~ — **fixed 2026-08-17**, twice over:
  a root-owned log file killed it at its first `tee` under `set -e`, and beneath that
  its readiness probes hit `http://localhost:3000` — plain HTTP against an HTTPS
  server — so the check had never actually passed since the HTTPS switch. Probes now
  use `https://` with `-k`.
- ⚪ **Canonical sink volumes now live in `config/animatronics.json` (`sinkVolume`:
  Mina 0.9, Orlok 1.3, Sir Dragomir 0.55)** — `wpctl` volume is node-local and was
  reset by both reboots and test suites with the canonical value recorded nowhere.
  `scripts/log-review.mjs` flags drift. The three offline nodes deliberately carry no
  value until they are ear-verified. *2026-08-18: the auto-apply is verified live on
  all three online nodes* — each logged "Sink volume set to canonical <v>" at boot and
  `wpctl` reads the canonical value (Mina 0.90, Orlok 1.30, Dragomir 0.55), unmuted.

- ~~**The startup servoChannels audit ran against the wrong character.**~~ — **fixed
  `645ac407`.** `runStartupHealthCheck()` ran BEFORE the hostname→character correction in
  `server.js`, and its channel audit resolves the character from `app-config.json` on
  disk — so a node carrying a stale `selectedCharacter` audited **another character's**
  channel map. Observed live on Sir Dragomir: booted with `selectedCharacter: 3`, warned
  about *Orlok's* `arm-fused-rail` power group and flagged his own jaw (ch1) as "driven
  but no part of character 3 is mapped to it", and persisted the false warnings to
  `startup-health.json` for the dashboard. The check now runs after the correction;
  Dragomir boots `servoChannels: ok` with his own channels `[0,1,3]` mapped.
- 🟡 **Something wrote `selectedCharacter: 3` into Sir Dragomir's `app-config.json`
  between his 2026-08-16 22:38 boot ("already correct") and the 2026-08-17 17:53 restart
  ("was 3, config updated").** The hostname guard healed it — and overwrote the file
  mtime, destroying the evidence — so the writer is unidentified. Nothing in that window
  should write character state on his node. **Tripwire:** any `(was N), config updated`
  line in a startup log means it happened again; find the writer before it flips a node
  mid-show. *2026-08-18 full-fleet reboot: clean* — Dragomir booted with
  `selectedCharacter: 4`, no new "(was N), config updated" line, and his startup audit
  reported `servoChannels: ok` on his own channels (the pre-fix wrong-character
  warnings survive only in stale pre-boot err-log content). Writer still unidentified;
  tripwire stays armed.
- ⚪ **Orlok ch15 still holds ~1025 µs with no part mapped** — survives service restarts
  because the PCA9685 is never power-cycled and v9.2.0's non-destructive init adopts the
  chip as-is. If a servo is physically on ch15 it has been energized for days. Clears on
  the next hardware power-down; eyeball the channel while the case is open.

### Opened from the 2026-08-19 séance session (Mina ↔ Orlok acoustic conversation)

- 🔴 **Per-model hardware defaults never reached the hardware for 36 of 59 fleet parts —
  the model was assigned, stored, schema-valid, and silently ignored.**
  `services/hardwareService/index.js:107` read `part.config.modelId`, but every
  `data/character-*/parts.json` stores `modelId` at the **top level, as a sibling of
  `config`**. Only 2 of 59 parts use the older nested form. So `getModelDefaultsForPart()`
  returned `{}` for everything else, and `modelDefaults` — the base layer of the
  `Object.assign({}, modelDefaults, normalized, params, …)` merge that builds every
  hardware command — was empty. Real values that never reached a servo: Miuzei 25 kg
  `minPulse 500 / maxPulse 2500 / neutralPulse 1500 / rotationRangeDeg 180`, and the
  continuous variant's `900/2100/360`. Nothing logged, nothing failed; parts silently used
  wrapper defaults. **Fixed 2026-08-19**: the read now accepts both shapes
  (`part.modelId || part.config?.modelId`). Model defaults remain lowest-priority in the
  merge and `applySafetyLimits()` still clamps against the calibration profile, so the fix
  can only fill gaps that were previously empty. Gate green; calibration 35 passing,
  system-parts 22 passing. *This is the archetype for the whole class below: a setting that
  is correct in the data, editable in the UI, and read from the wrong path.*
- 🟡 **`getModelDefaultsForPart()` reads only the GLOBAL model registry, never the
  per-character override.** It resolves `data/<file>_models.json` and ignores
  `data/character-N/models/*.json`, which exist for characters 1, 2 and 3. Custom
  per-character models are therefore inert on this path. Not fixed — flagged with the fix
  above; needs `characterId` threaded into the lookup.
- 🟡 **Missing/dangling `modelId` across the fleet, and no gate check catches it.**
  Verified 2026-08-19: PumpkinHead (char 1) **16 of 24 parts** have no `modelId`;
  Groundbreaker (char 5) **3 of 4**; Renfield (char 6) **2 of 3**. Mina, Orlok and Sir
  Dragomir are clean (0 problems each). Sir Dragomir has **no `data/character-4/models/`
  directory** at all, unlike chars 1–3. `npm run gate` validates schemas but never checks
  that a `modelId` resolves to a real registry entry — that check belongs in
  `validate:schemas`.
- 🔴 **A muted speaker is indistinguishable from a deaf node, and cost most of a session.**
  Post-reboot, Mina *and* Sir Dragomir came up with `muted: true`. `POST
  /conversation/api/say` returned `{"success":true}` in 4 s while emitting nothing; the only
  evidence was `🔇 Speaker muted — playback skipped` in `/var/log/monsterbox.log`. Proof of
  the split: with the mute on, Mina's own mic — feet from her own speaker — recorded flat
  room tone (max 250 ms RMS **0.007**) across a full utterance; unmuted, the same app path
  read **0.345** with 14/78 frames over gate, and direct `mpg123` read **0.591**. The mic and
  speaker were never faulty. *Fix direction:* surface `muted` in `/health` and in
  `npm run earcheck`, which currently proves capture but never reads the mute flag — so it
  scores a muted node exactly like a broken one.
- 🔴 **With AI disabled, `askAgentQuestion` returns the agent's opening line verbatim
  instead of answering the question — and reports success.** Reproduced three times
  (turns 1, 3 and 5 of the séance): with `GET /conversation/api/ai-status` reporting
  `enabled: false`, Mina's agent replied *"Wait — is someone there? …"* to three completely
  different prompts, including an explicit "sing a Romanian song" instruction. Orlok, same
  state, answered contextually — so it is not purely a function of the flag and needs
  triage. `POST /conversation/api/ai-on {enabled:true}` fixed it instantly and she composed
  an original Romanian verse. **Both nodes were shipped with AI disabled**, so this is the
  default state, and the failure is silent: the response looks like a real answer.
- 🟢 **Measured: the persistent chat session is 3–4× faster than `askAgentQuestion`,
  confirming the existing fix direction below.** Same hardware, same night, same pair:
  `askAgentQuestion` (fresh WebSocket per question) measured **10–13 s** end-of-speech to
  reply audio, while the persistent conversational session logged **2.4–3.6 s**
  `TOTAL-to-first-sound` over 24 consecutive turns (`speech-end→transcript` 2385–3549 ms,
  `transcript→first-audio` 5–92 ms). This is the hard number the *"this path should route
  into it"* entry was missing.
- 🟡 **`microphone_cli.py stream_raw` takes CHANNELS as its third argument, not duration —
  and there is no duration argument at all.** Signature is
  `_stream_raw(device_id, sample_rate, channels)`; it streams until the pipe closes. Passing
  a seconds value silently produces N-channel audio: `stream_raw default 16000 22` yielded
  22-channel data that read as 543 s of near-silence when interpreted as mono, which looks
  exactly like a dead microphone. Cost a wrong "the array is not hearing anything" conclusion
  tonight. Control duration with `timeout` and always pass `1`. *Fix direction:* reject a
  channels value above the device's `maxInputChannels` instead of accepting it.
- 🟡 **Enabling AI opens a continuous capture session that respawns `microphone_cli` and is
  not obvious from any UI.** `POST /api/ai-on` starts a persistent `chat_*` session that
  holds the mic open and re-spawns the capture process within ~2 s of being killed; the
  character then answers *anything* it hears, including the other animatronic. Echo
  suppression works correctly (23 of 40 frames `suppressed=true` while speaking, so the pair
  never talked over each other), but with AI on for two nodes the conversation is
  **self-sustaining and unbounded** — Mina and Orlok held 24 coherent turns unprompted and
  would have continued indefinitely, consuming ElevenLabs credits. Disabling AI stops the
  respawn cleanly. *Fix direction:* surface live-session state in the dashboard, and consider
  an idle/turn cap on unattended agent-to-agent exchange.

### Opened from the 2026-08-19 v10.1 session (persistence, deploy drift, ElevenLabs close-out)

**FIXED — Speaker mute did not survive a service restart.** `this._speakerMuted = false` lived only in
the `ServerPlaybackService` constructor (`services/serverPlaybackService.js:97`). Nothing wrote it to
disk, nothing restored it at boot, so *every* restart — a crash, `systemctl restart`, and critically
`npm run deploy:all` — silently re-armed every speaker in the house with no log line and no warning.
Found by tripping over it: a service restart to test an unrelated endpoint brought the node back
unmuted, hours after the household was woken at 00:20 and the fleet was muted in response. Now persists
to `data/speaker-state.json` (node-local, gitignored) and restores synchronously at construction, before
anything can ask whether it may make noise. Proven through a full fleet deploy+restart: all three nodes
came back `muted:true`. Missing file still defaults to unmuted, so it is non-regressive.

**FIXED — deploy drift: nodes report the new version while running old code.** Orlok and Sir Dragomir
both served `version: 10.0.1` over `/health` while `services/hardwareService/index.js` still contained
the pre-`af2c1037` `config.modelId` read and zero occurrences of the `part.modelId` fix. `deploy-all.sh`
rsyncs files without moving git, so a node's git HEAD is not evidence of what it runs — Sir Dragomir's
HEAD read `609245f5` (v9.3.0) with 107 dirty files while serving 10.0.1. **A version string is not proof
of a deploy. Grep the node for the actual fix.** Consequence: the modelId fix had been committed for a
full session but had never reached two of three nodes, so 36 of 59 fleet parts were still resolving to
`{}` model defaults on the hardware that matters.

**Sir Dragomir's neck — root cause was the undeployed modelId fix, not the channel.** The channel
transposition (head ch1 / jaw ch0) was already corrected in both repo and node. The remaining cause: his
Head Servo is a CONTINUOUS servo (`servo_miuzei_25kg_continuous`, minPulse 900 / maxPulse 2100 /
neutral 1500). On a continuous servo the pulse width sets **speed and direction**, with ~1500 µs = stop —
so generic 500–2500 defaults put the stop point and the whole speed curve in the wrong place. With the
model defaults unreachable, the neck could not behave correctly. Fixed by deploying.

**OPEN — Sir Dragomir has zero scenes and `defaultSceneId: null`.** `GET /scenes/api/` on
`192.168.8.130` returns `{"scenes":[]}`, and his `config/animatronics.json` entry has no
`defaultSceneId`. `startAllQueueLoops()` (`services/orchestrationService.js:601`) returns
`'No defaultSceneId configured'` for him, so he silently drops out of every fleet queue loop. Not an
error the operator ever sees — the fleet call still reports overall success.

**OPEN — browser tests cannot run while the service is running.** `npm run test:browser` starts its own
server on 3200, which hits `server.js`'s single-instance PID guard and exits, and Playwright reports it
as a *config* failure ("Process from config.webServer was not able to start") rather than the port/PID
conflict it is. The escape hatch already exists and is documented in `playwright.config.js:52` but is
not in CLAUDE.md's test table: `MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright
test tests/browser`. Port 3100 serves the full app.

**OPEN — `optimize_streaming_latency: 3` was mis-diagnosed as disabling the text normalizer.** It does
not; **level 4** does. Per current ElevenLabs docs: 0 = off, 1 = normal, 2 = strong, 3 = max latency
optimizations, 4 = max *plus* text normalizer off. Level 3 is still quality-degrading and all six agents
were on it (now all 0), but the "flattened the audio tags because the normalizer was off" explanation is
wrong and should not be repeated. The real normalizer control is the separate `text_normalisation_type`
field.

**OPEN — `text_normalisation_type` is inconsistent across the fleet.** Orlok `elevenlabs`; Mina and
Sir Dragomir `system_prompt`. Never reconciled or explained.

**OPEN — local `tts-config.json` cannot reach the conversational path, by design at the agent.** Every
agent has `overrides.conversation_config_override.tts.*` set to `false`
(`model_id`, `voice_id`, `stability`, `speed`, `similarity_boost`, `pronunciation_dictionary_locators`).
Only `text_only` and `language` are overridable. So no value tuned locally can affect an agent
conversation regardless of what MonsterBox sends — the UI must say so, or the controls must go.

**OPEN — Mina's agent differs from the others in two unexplained ways.** `suggested_audio_tags: []`
though her prompt uses `[whispers]`, `[sighs]`, `[sings]`, `[crying]`; and `ignore_default_personality:
false` where Orlok and Sir Dragomir are `true`, so ElevenLabs' default personality is blended into her.

**OPEN — PumpkinHead's agent prompt contradicts itself**: it states "You never use audio tags" while
carrying its own `# Audio Tags` section naming laughs / whispers / shouts / sighs.

**PERSISTENCE — a sweep of operator-facing settings found nine that do not survive a service
restart.** One shared root cause, five distinct defects. In each case the setting lives only in a
module-level binding or a singleton's constructor; the setter mutates RAM and returns success, nothing
writes it to disk, and nothing restores it at boot. The archetype is the speaker mute fixed earlier
tonight (`services/serverPlaybackService.js`, above) — same shape, and it is the reason the household
was woken. A restart is not a rare event on this fleet: `npm run deploy:all` restarts every node, so a
routine deploy silently reverts all of these at once. Worse than plain volatility, several of them leave
a *disk* copy behind that nothing re-arms, so the file and the runtime disagree and the UI reports the
file.

**REMOVED — `globalSpeedCap` is gone entirely (operator decision, 2026-08-19).** It was briefly
persisted this session after a sweep found it silently reset to 1.0 (fully permissive) on every restart.
The operator then decided he has no use for it — "remove that global speed cap forever" — so the binding,
both `/global-speed-cap` routes, the dead UI block in `calibration.ejs` and `data/motion-state.json` are
all deleted. The two `effectiveRate / globalSpeedCap` divisions in `planTimeAtSpeed` are gone too;
dividing by 1.0 was a no-op, so planner output is unchanged (verified: forward 0.2→0.8 @ 2000 msPerNorm
= 1200 ms; reverse with beta 0.2 = 1440 ms, reversal compensation intact).
**This is NOT the safety speed cap.** `safety.maxSpeedPct`
(`services/hardwareService/safetyLimits.js:216`) — the per-part cap that limits peak current draw and
which CLAUDE.md says NEVER relaxes — is untouched and still enforced. Two different things shared a name.
One user-visible consequence on `/setup/calibration/unified`: the slider is now a page-local *Move Speed*
that reaches preset `goto` only; jog/nudge never sent `speedPct` and now run at the adapter's own speed.

**OPEN — superpower: head tracking is armed only in an in-memory Map, and the disk copy lies.**
`headTrackingConfigs` is a `Map` in `controllers/motionTrackingController.js:20`. The parameters
(`panServoId`, `centerDeg`, `rangeDeg`, `smoothing`) *do* persist to `super-powers.json`; only the armed
bit is lost. That asymmetry is what makes it worse than volatile: `data/character-3/super-powers.json`
carries `headTracking.enabled: true` and **nothing re-arms it at boot**, while every status endpoint
answers from the Map. So the disk claims ON, the runtime is OFF, and the UI shows whichever the code
path happens to read.

**OPEN — superpower: motion / PIR watcher has no persisted field at all.**
`services/lurkMotionWatcherService.js` has `start()`/`stop()` and no stored enabled state anywhere.
A restart stops PIR polling silently — no error, no log line, and the dashboard toggle re-renders from
nothing. The character simply stops noticing people.

**OPEN — superpower: idle loop stops on shutdown and is never started again.** `let running = false`
in `services/movement/idleLoopService.js:55` is the whole state. `server.js:969` correctly calls
`idleLoop.stop()` during shutdown; there is no matching start on boot and no persisted flag, so an
animatronic left idling comes back inert after any restart or deploy.

**OPEN — AI-enabled does not survive a restart, and `ai_agent_state.json` outlives the session that
wrote it.** The agent socket lives in `services/elevenLabsWebSocketService.js`; a restart drops it, so
AI comes back **off**. That direction is fail-safe and correct. The defect is the leftover file:
`data/character-2/ai_agent_state.json` keeps whatever the last toggle wrote (`routes/conversation.js:716`)
and nothing clears or re-arms it at boot, so after a restart the disk can still read `enabled: true`
with no session in existence. *Partially refuted by adversarial verification:* `GET
/conversation/api/ai-status` (`routes/conversation.js:736`) already reconciles — it answers
`enabled: live` from `isAgentEnabledForCharacter()` and uses the file only for `characterId` and
`timestamp` — so the status endpoint does **not** report AI on when no socket exists. Any *other*
consumer reading the file directly still will. What remains open: nothing re-arms AI after a deploy, and
the stale file is a standing trap for the next reader.

**REFUTED by adversarial verification — these four are FINE, do not "fix" them.** Global speaker mute
(now persisted to `data/speaker-state.json` and restored at construction — see the FIXED entry above);
master/system sink volume (held by PipeWire/ALSA state, not by MonsterBox, and it comes back); default
sink and default source (likewise persisted outside the app); and the lurk-mode master flag (already
written to disk and read back at boot). Each was suspected during the sweep and each survived a real
restart.

### Opened from the 2026-08-18 v10 page sweep + adversarial review

- 🟡 **The OpenCV enable checkbox on `/setup/head-animation` will not stay
  checked** (needs triage). The full browser suite's *8.2 Tracking controls*
  fails with Playwright's `setChecked: Clicking the checkbox did not change its
  state` on `#ocvEnabled` — the element is visible, enabled and stable, the click
  lands, and the state reverts. Either a handler is rejecting the enable (no
  configured tracking servo / camera on this node) and silently resetting the
  box, or the toggle is genuinely stuck. Not investigated: it surfaced during the
  v10 release run and is not a v10 regression (nothing in this train touched that
  handler). *Triage direction:* watch the network tab while clicking — if an API
  refuses, the page must SAY so instead of quietly snapping the control back.

- 🟡 **The browser suite cannot run on a node whose service is up — and it needs
  `BASE_URL` set by hand.** Two separate traps, both hit on 2026-08-18 while
  trying to satisfy the v10 release gate:
  1. `acquireLock()` (`services/resource/singleInstance.js:67`) is
     unconditional, so Playwright's own `MB_TEST_MODE=1 TEST_PORT=3200 npm start`
     web server exits with *"MonsterBox already running (PID …)"* whenever
     `monsterbox.service` holds the PID file. The suite that the release is
     gated on therefore requires stopping the character first. This is not a
     regression — the lock has never had a test-mode exemption — but nothing
     documents it, and the failure reads like a test bug rather than a lock.
  2. Most specs default to `BASE_URL ?? 'http://localhost:3000'` while the
     spawned server listens on **3200**, so a bare `npx playwright test` fails
     every navigation. `BASE_URL=http://localhost:3200` is mandatory; the npm
     scripts should set it rather than relying on each spec's default.
  *Fix direction:* let the lock stand down when `MB_TEST_MODE=1` and the port is
  not the production one, and bake `BASE_URL` into the `test:browser` scripts.
  Until then: `sudo systemctl stop monsterbox.service`, run with `BASE_URL`
  set, and restart the service afterward.

- 🟡 **`earcheck.mjs` run from Mina falsely reports Orlok and Dragomir
  OFFLINE.** The script reaches peer nodes over SSH, and only Orlok holds the
  fleet's key-based trust — from Mina the connection is refused before a single
  frame is captured, and the row is written as `OFFLINE` even while the peer's
  `/health` answers 200 at 10.0.0. Every "OFFLINE" earcheck row conducted from
  Mina on 2026-08-18/19 is this, not silence (fleet-health showed all three
  nodes up at the same minute). The 3/3 AUDIBLE proof standard is unaffected
  when conducted from Orlok (committed artifact
  `scripts/fleet-audio/results/earcheck-2026-08-16T11-27-53.json`).
  *Fix direction:* either install the deploy key across nodes so any node can
  conduct, or teach earcheck to use the app APIs (say + STT capture) instead of
  SSH — and either way, distinguish "unreachable conductor path" from
  "node offline" in the verdict.

- 🟡 **The PIR watcher can respawn forever without ever falling back.**
  `services/lurkMotionWatcherService.js` (~240) — the rapid-failure counter
  resets to 0 on *any* exit that is non-rapid (>10 s uptime) or code 0, so a
  watcher that reliably dies *after* warm-up (a GPIO error that manifests once
  running, an OOM kill) never reaches `WATCHER_MAX_RAPID_FAILURES` and never
  latches into the degraded per-poll fallback. Only the restart *rate* is
  bounded, never the *count*: ~6600 journal lines/day onto SD plus a ~2 s
  motion-blind gap every cycle, all night. *Fix direction:* bound restarts over
  a rolling window, while still forgiving one blip in a watcher that has been
  healthy for days.
- 🟡 **A wedged PIR watcher is indistinguishable from a quiet room.**
  `services/lurkMotionWatcherService.js` (~208) — the Python side prints only on
  pin transitions, so `lastPollAt` (documented as "last proof the watcher is
  alive") goes stale for hours on a quiet pin. The degrade machinery triggers
  only on process *exit*, so a hung-but-alive child means motion-wake is
  silently dead for the night: a guest walks past the PIR and the character
  never wakes, while `getStatus()` still reports `active: true`. *Fix
  direction:* a cheap periodic heartbeat line from `gpio_pin_watcher.py`, with
  the Node side treating heartbeat-or-state as proof of life and degrading when
  proof stops arriving. Both of these were scoped in the v10 train and cut when
  the fixing agent was lost to an API error; the two higher-severity claim
  defects from the same review are fixed in `6e8a0b05`.

All found by agents reading code they were not the author of. None block v10.0.0;
each is scoped small enough to fix in a single wave.

- 🟡 **`runProbe()` on the unified calibration page is a simulation stub, but Save
  persists whatever the operator typed.** `views/setup/unified-calibration.ejs` —
  the Learn Movement panel's Run buttons only show an alert (its own comment says
  "in production, this would actually move the part"), yet **Save Learned Motion**
  writes the manually-entered deltas as if they were measured. On a hardware page
  that is a misleading contract: the operator believes they measured travel they
  never measured, and a bad open-loop span drives real actuator timing.
  *Fix direction:* either wire Run to a real timed run through the supervised
  calibration-override endpoints, or relabel the panel as a manual stopwatch
  procedure so Run reads as a timer, not a mover.
- 🟡 **Scene and pose names render unescaped into `innerHTML` on the classic
  dashboard.** `public/js/dashboard.js` `renderScenesList` (~1631) and
  `renderPosesList` (~1805) interpolate `scene.name` / `pose.name` /
  `pose.category` directly. A name containing markup breaks the row or injects
  HTML. The same file's `appendChatMessage` and all of `poses-editor.js` escape
  correctly, so the helper already exists — this is an oversight, not a gap.
- 🟡 **`esc()` does not escape quotes, in three places that interpolate into
  attributes.** `public/js/character-menu.js`, `views/setup/characters.ejs`, and
  `views/setup/character-images.ejs` each escape `& < >` but not `"` or `'`, then
  interpolate into `alt="…"` and `onclick="__imgs.setActive('…')"`. A character
  named with a double quote breaks out of the attribute; a filename with a single
  quote produces a dead button. One regex per file closes all three.
- ⚪ **Character-images actions fail silently.** `views/setup/character-images.ejs`
  — the upload / set-active / delete fetch chains have no `.catch` and no failure
  feedback, so a failed upload looks identical to a successful one. Its
  **Save & Return** button also performs no save (the active image persists on the
  check button; the handler only navigates) — the label overstates what happens.
- ⚪ **`/first-run` shows a tofu box where PumpkinHead's avatar should be.** The
  no-image fallback is a raw skull emoji and the RPi has no emoji font installed,
  so it renders broken on any client without one. A Bootstrap icon fixes it.
- ⚪ **`/setup/audio` never reaches `networkidle`** — 5 s Active Streams polling
  plus the VU meters keep the network busy, so any browser spec waiting on
  `networkidle` there is slow or flaky (related to the already-tracked VU-meter
  flake). Waiting on `load` is the reliable choice. Consider also gating the 5 s
  refresh on the panel's collapsed state to cut SD-era polling.

### Far-field STT — opened and closed 2026-08-18 (Orlok · ReSpeaker XVF3800)

> Orlok stood in a room with a working microphone, a working transcriber and a green health
> check, and heard **nothing**. Every layer reported success. These three entries are the
> anatomy of that silence — recorded in full because the failure *shape* (success everywhere,
> no audio anywhere) will recur on other devices, and it cost days to see the first time.
> Fixed on the 10.0.x line, commit `552dbbbf`.

> ⚠️ **Reopened in part, 2026-08-19.** "Closed" is now too strong. Orlok's
> `/var/log/monsterbox.err` still carries the full ladder —
> `continuous capture (parec) produced no audio` (2),
> `(ffmpeg)` (8), `(arecord)` (2), `continuous capture unavailable (all capture methods
> failed); falling back to per-chunk polling` — followed by **9 `Transcription failed
> (n/10): STT failed` lines across 3 sessions**. What `552dbbbf` fixed is the *silence*:
> the ladder now says out loud that it moved zero bytes instead of pretending to work, and
> that is exactly what these lines are. What is **not** closed is the outcome — the array
> still yields nothing to `parec`/`ffmpeg`/`arecord`, and transcription still fails after
> the fallback. See the Orlok section for the open item. Judge on FRAMES (non-zero bytes
> AND non-zero RMS) via `python_wrappers/microphone_cli.py`, never on "the device opened".

- ~~**A recorder can OPEN the XVF3800 source and deliver ZERO frames — and every layer above
  it calls that success.**~~ — **fixed 2026-08-18** (`552dbbbf`). The far-field silence was
  three faults stacked, each of which independently reported OK:
  1. **The recorder moved no bytes.** `parec`, `ffmpeg` and `arecord` all open the ReSpeaker
     XVF3800 source cleanly, exit 0, and stream **nothing**. Measured head-to-head on Orlok,
     same source, same 3-second window: `python3 microphone_cli.py stream_raw` → **69120
     bytes**; `parec` → **0 bytes**; `arecord` → **0 bytes**. Not a permissions error, not a
     busy device — an open handle that never yields a frame.
  2. **The ladder swallowed it.** `startContinuousCapture()` scored the zero-byte run as a
     failed candidate, walked the *entire* candidate list, and then **silently fell back** to
     the legacy ~0.3 s per-chunk path. The session went on "working" — at 0.3 s of speech per
     poll, which is a fragment, not a sentence.
  3. **Scribe returned an empty transcript, not an error.** ElevenLabs Scribe answers a bare
     fragment with `""` and HTTP 200. So the transcriber reported success for hearing nothing,
     the capture layer reported success for a fallback nobody asked for, and the health check
     reported success for a node that was deaf.
  **The fix:** a new `stream_raw` PyAudio subcommand in `python_wrappers/microphone_cli.py`,
  wired as the **FIRST** candidate in `startContinuousCapture()`
  (`services/serverSTTListener.js`); the pulse/ALSA recorders are retained *below* it as
  fallbacks, so nothing regresses on the USB-mic nodes. Tuning shipped with it:
  `vadSilenceDuration` **550 → 1200 ms** (`data/character-3/ai-config/stt-config.json`) —
  frames are 300 ms, so 550 ms closed the utterance after **two quiet frames** and
  guillotined the sentence-final decay.
  **Proof — two sentences, the second spoken by an adversarial verifier that had never seen
  the first:** said *"The crimson bell tolls seven times for the sleeping garden."* / heard
  *"The crimson bell tolled seven times for the sleeping garden"* = **90%**. Said *"Nine pale
  lanterns drift above the frozen orchard tonight."* / heard *"Nine pale lanterns drift above
  the frozen An orchard tonight"* = **100% in order**. **Zero fallback lines** in
  `/var/log/monsterbox.err` for those sessions, and the source-file mtimes predate the service
  start, so the running process demonstrably held the new code. Smoke **459 passing / 14
  pending**, unchanged.
  **See** `docs/hardware/RESPEAKER-XVF3800.md` → *"Capture traps — the zero-frames failure"*
  for the device-level detail and the reproduction commands.
  ⚠️ **Honest limits — read these before citing this as "far-field works":**
  - The gate is **narrow**: only **6 of 148 frames** cleared the 0.045 threshold against a
    room-tone floor of **0.033–0.041**. There is very little headroom between "speech" and
    "silence" here.
  - Proven **only for `deviceId: "default"`**, **only on Orlok**, and **only with Mina's TTS
    as the sound source**. No live human voice, no other distances or angles, no competing
    room audio.
  - **Only `test:smoke` was run.** No system, browser or hardware suite covers this path yet.
  - 🟡 *Residual, still open:* the 1200 ms window **bridges** truncation, it does not solve
    it. Even in the passing run the utterance still split in two, and Scribe inserted a
    spurious *"An"* at the seam. A real fix is endpointing that understands sentence decay,
    not a longer timer.

- ~~**The `vadThreshold` gate sat ABOVE all real speech — a default tuned for a lavalier,
  applied to a beamforming array.**~~ — **fixed/measured 2026-08-18.** The configured gate was
  **0.38** (the code default is `0.40`, `services/serverSTTListener.js`), while measured
  far-field speech through the XVF3800 arrives at roughly **0.17** and silence sits at
  **0.033–0.038**. The gate was therefore **above every sound the array would ever produce**:
  no frame could open it, ever. Now **0.045** — chosen because the room-tone floor measures
  0.033–0.041, so anything **≤ 0.042 gates open on silence** and anything much higher gates
  shut on speech.
  **The lesson worth keeping:** fixing this gate **alone changed no transcript**, because the
  capture fault above sat *underneath* it — a correct threshold applied to zero frames is
  still zero. A near-mic default is simply the wrong number for a beamforming array that
  delivers a normalized, distance-compensated signal; per-device VAD calibration is not
  optional, and the only trustworthy way to set it is to **measure the floor on that node**
  (`MB_DEBUG_AUDIO=1` prints the per-frame RMS the gate actually sees).

- ~~**Mic contention decided whether a session could hear at all — and it looked like
  flakiness, not a bug.**~~ — **fixed 2026-08-18.** The legacy poll tick was armed
  **unconditionally, ~10 ms into every session**, while the asynchronous
  "aggregate or poll?" config read was still in flight. That tick's recorder holds the
  microphone **EXCLUSIVELY for ~1.4 s**. On a device where **only** PyAudio can stream, the
  winner of that race decided whether the session could hear anything at all — so **identical
  sessions passed or failed on timing alone**.
  **Fixed:** the legacy tick now starts **only from the config callback**, with a **1500 ms
  safety kick** if the config read never resolves (so a broken config still yields a hearing
  session), plus a **one-retry-before-write-off** rule per capture method, so a transient
  collision with another recorder cannot permanently demote the only path that works on this
  device.
  **Diagnostic lesson — the reason this hid for so long:** *a bug that flips on timing
  presents as flakiness.* The tell was not an error message; it was that **identical sessions
  gave opposite results**. When a component is intermittently deaf, suspect an exclusive
  resource and a race before suspecting the network or the vendor.

### Opened from the 2026-08-16 evening evidence sweep (v9.3.0 session)

- 🟡 **"Mute Speaker" silences the show but not TTS — decide the intended semantics.**
  `playBufferOnCharacterSpeaker` (audio library, scene cues) honors the mute flag;
  `playAIOnCharacterSpeaker` (TTS/say/earcheck) ignores it. Tonight this meant a muted
  Orlok passed his ear-check while every library/scene play was silently skipped — the
  "audio is broken" report was a mute toggle left on by a dead conversation session
  (WS 1006). v9.3.0 makes the muted skips *honest* (response + log line), but the
  split behaviour is a product decision, deliberately unchanged.
- 🟡 **The app's reboot endpoint can never work**: `routes/api/systemRoutes.js` runs
  `sudo reboot`, but `monsterbox.service` sets `NoNewPrivileges=yes` — every attempt fails
  with "no new privileges". Fleet-wide (same unit file). Reboot via SSH instead; fixing it
  means a polkit rule or dropping the hardening flag — a deliberate decision, not a patch.
- 🟡 **`speaker_cli.py` accepts garbage device IDs and reports success** (observed casting
  to devices `"81"` and `"34"` — wpctl ids passed where ALSA names belong — with
  `status: success`). Masks silent-audio failures. Needs device validation in the wrapper.
  *Same failure family as the zero-frames capture bug* (*Far-field STT*, Cross-Cutting): a
  wrapper returning `success` for a path down which **no audio actually moved**. On the
  output side it is a device id that does not exist; on the input side it was a source that
  opened and delivered nothing. Both want the same rule: **a wrapper may only report success
  for bytes it can account for.**
- 🟡 **`jog-raw` has no per-part serialization**: two overlapping jogs on one part spawn two
  `actuator_cli.py` processes on the same pins → `'GPIO busy'` / `E_BUS_IO` (observed once,
  operator double-click during a 7.5 s home). Wants a per-part in-flight lock in the UI or route.
- ~~**avahi/mDNS is degraded on Orlok AND Mina** (`EACCES` writing the avahi service file);
  Sematext st-agent with a dead token floods journals (SD wear).~~ — **fixed 2026-08-17 at
  the OS level** (not in git; see the OS-baseline note below): the avahi file is now owned
  by `remote` on all three nodes and the app successfully rewrites it at startup (verified
  by mtime). The Sematext agents (**143,360 journal lines in one boot**) are disabled on
  Orlok. Also standardized: journald persistent + capped 64M fleet-wide (Dragomir was
  volatile — his power-cut post-mortem had evaporated), logrotate for
  `/var/log/monsterbox.{log,err}`, `Nice=-5` + `EnvironmentFile` drop-ins on Mina (she had
  neither — her app had no SSH secret), `goblin.service` disabled on Mina (crash-looped
  every boot), and Mina's `monsterbox-boot-check` unblocked (root-owned log file killed it
  at its first `tee` under `set -e`, every boot). ⚠️ **None of this is tracked in git** — a
  reimaged node loses it all; the full list lives in the Claude memory file
  `node-os-baseline.md` and should someday land in `install.sh`.
- 🔴 **Orlok hardware watch — ESCALATED 2026-08-17**: a **14-event `over-current` burst in
  six seconds (16:58:26–32)** knocked every device off the USB hub — WiFi, audio adapter,
  and the webcam, which re-enumerated `/dev/video0`→`/dev/video1` and came back **wedged**
  (UVC `Protocol error` on stream start; needs a physical replug or
  `echo 1-1.1 | sudo tee /sys/bus/usb/drivers/usb/unbind` then `bind`). The Pi's own supply
  is clean (`throttled=0x0`, zero under-voltage) — the fault is the **hub/downstream 5 V**,
  not the wall supply, and it is load- or time-triggered (49 min idle after reboot were
  clean before the burst). The Realtek WiFi adapter also faults/re-enumerates at every boot
  (`rtw_usb_reg_sec ... status: -71`). *Mitigation shipped:* mjpg-streamer now binds the
  stable `/dev/v4l/by-id/` path (survives re-enumeration) at reduced 15 fps / q60 —
  operator confirmed phone-monitoring resolution is sufficient; less USB bandwidth and CPU.
  *2026-08-18 post-reboot:* one boot-time `usb 1-1.4: USB disconnect, device number 5`
  at 23:10:03 (enumeration churn; **no over-current lines this boot** as of the first
  log-review pass).
- ~~**Sir Dragomir data check**: `library.json` "not iterable" flood + power-cut
  NUL-corrupted log.~~ — **verified fixed 2026-08-17**: two clean boots since the v9.3.0
  deploy with zero library errors; log files NUL-free on all three nodes. His journal is
  now persistent (capped), so a future power cut leaves a post-mortem.
- ⚪ **Cross-node queue enqueue 500s**: `defaultSceneId` in `config/animatronics.json` names
  scenes some targets don't have (Orlok/PumpkinHead: scene 100 — "Scene not found" on every
  start-all). Data decision: give each node a defaultSceneId that exists in its scenes.json.

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
  **v9.2.0 consequence found the hard way:** because the stray directory is root-owned, rsync
  cannot replace it and **`scripts/deploy-to-animatronic.sh` aborts on exit code 23 before it
  restarts the service** — see the deploy entry below. It was removed from the one node
  deployed to this session; it is presumably still present on the others.
- ~~**`deploy-to-animatronic.sh` aborts on rsync exit 23 and leaves the node running the OLD
  build.**~~ — **fixed v9.2.0.** Root-owned files that rsync cannot replace — `certs/`, and the
  stray `data/ai-config/` above — make rsync exit 23, and because the script ran under `set -e`
  the abort happened **before the `systemctl restart`**. The code landed on disk, the service
  kept serving the previous build, and the deploy *looked* like it did nothing — which is
  exactly how a fleet ends up silently running mixed versions. **This is what made Sir Dragomir
  keep speaking in his retired voice after the fix had already reached his disk.** rsync status
  is now checked explicitly: **23 and 24 warn and continue to the restart; any other non-zero
  status refuses to restart on a partial deploy.**
  - ⚪ **Still true and still the rule: confirm the version after every deploy** —
    `curl -sk https://<node>:3000/health`. A node that has not been redeployed since this fix
    still carries the old script.
  - The stray `data/ai-config/` is safe to remove on any node
    (`sudo rm -rf /home/remote/MonsterBox/data/ai-config`); `certs/` is expected to be
    root-owned and must be left alone.
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
  ✅ **Re-confirmed still open 2026-08-18**, after the `stream_raw` rewrite of the candidate
  ladder in that same function. `deviceId` is a closure parameter of
  `startContinuousCapture()` (`services/serverSTTListener.js:718`), fixed at the single call
  site `startContinuousCapture(state.deviceId, …)` (`:416`), and `state.deviceId` is written
  once in `startSession()` and never re-read from the part config. Each relaunch re-resolves
  the *Pulse source* for that same `deviceId` (30 s cache), so a source that moves underneath
  a stable device name is picked up — **but changing which microphone the character uses is
  not.** One device per session still holds.
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
- 🔴 **A model speaks gesture ids aloud instead of calling the gesture tool — the ElevenLabs
  client tool is STAGED, NOT LIVE.** The MonsterBox handler shipped in v9.1.0, but the agent
  side is withheld. Measured on the **live** path (real Agents WebSocket conversations, tool
  declared and answerable — not a simulation): Orlok, the only character with a shipped
  `gestures.json` and therefore the only one with anything to gain, over 5 probes and 30
  replies produced **0 correct tool calls and 9 replies (30%) speaking `[hand_glow]` aloud**,
  two leaks per run on four consecutive runs. The other four agents were quiet; Mina made the
  fleet's single correct call. His prompt is the most bracket-primed in the fleet (a standing
  `[Romanian accent]` rule plus a ten-entry audio-tag list), which points at priming rather
  than at the ids being inherently unsafe.
  - *Fix worth trying next (departs from spec §5.2, needs a clean 30-reply probe before it
    ships):* per-character tools with `gesture_id` as an **enum**, and a `# Body` section that
    names intents but **no ids**, so there is no identifier in the prompt to echo.
  - Everything needed to apply it is staged in `config/elevenlabs/gesture/`; the judge harness
    now measures leakage on every run. Live agents are byte-identical to the committed
    snapshots.
- ⚪ **`eleven_v3` ignores `voice_settings.speed` entirely.** Measured against the live API:
  identical output duration across the whole 0.7–1.2 range, where `eleven_multilingual_v2` goes
  **~10.7 s to ~6.0 s on the same text**. Per-character tuned speeds are therefore only sent on
  the conversational agent path (`eleven_v3_conversational`) and deliberately **not** to v3,
  where they would look configured and do nothing. Do not "fix" a speed slider that appears to
  have no effect on the say/scene path — it genuinely has none.
  - Related: `style` exaggeration is **absent from the `TTSConversationalConfig` schema** and
    cannot be set on `eleven_v3_conversational` at all (verified against the live API schema,
    not assumed).
- 🟡 **The fleet's speaker rigs are badly mismatched — a daylight level-balancing pass is
  OUTSTANDING.** Measured 2026-08-16: **Sir Dragomir carries across a room at sink volume
  0.30**, while **Mina and Orlok (both Unitek Y-247A adapters) are inaudible below ~0.5** —
  Mina scored `GARBLED` at her 0.65 default and only became `AUDIBLE` at 0.90. Consequences:
  - **A single fleet-wide master volume does not mean the same thing on each node.** One
    rehearsal level made two nodes look dead when it actually suited exactly one of them.
    `earcheck.mjs --volume-map` and `verify-moment.mjs --volume` exist for this reason.
  - `wpctl` volume is **node-local and is not deployed** — it survives nothing and must be
    re-checked per node after a reboot or an audio-stack change.
  - *Not done:* an outdoor, daylight pass setting each node's level by ear at yard distance.
    The numbers above are indoor/night rehearsal levels.
- ⚪ **The ear-check capture window must outlast the slowest character's line.** The default was
  widened **9 s → 13 s** in v9.2.0: a slow-speaking character runs past 11 s, and a short window
  clipped the tail and scored a perfectly good node `GARBLED`. Measured on one node, same
  configuration: **53% word recall at 9 s vs 80% at 15 s.** If a node reads as GARBLED, re-run
  with `--seconds` raised before believing it.
- ⚪ **The gesture engine ships recipes for exactly one character.** `data/character-3/gestures.json`
  is the only file; every other character is a silent no-op by design. The recipes are also
  authored around **that node's** blocked parts — the bow gestures are expressed as head bows
  because the bow-at-waist actuator and elbow are safety-blocked.
- ⚪ **Character-resolution & bias tech-debt is baselined, not fixed.** Full machine-checked
  lists: `eslint-rules/no-direct-character-resolution.allowlist.json` (~12 files still read
  character state directly instead of `resolveCharacter(req)` — e.g.
  `controllers/motionTrackingController.js`, `webcamController.js`, `partsController.js`,
  `routes/setup/jaw-animation.js`, `head-animation.js`) and
  `tests/baseline/character-independence-allowlist.json` (72 orlok/char-3/hardcoded-IP
  entries). `npm run gate` blocks *new* violations; both lists only shrink. The
  `batchMoveServos` seam above is one such entry.

---

- 🟡 **`/api/system/volume` GET and PUT use different scales.** GET returns a **0.0–1.0
  fraction** (`routes/api/systemRoutes.js:166`, straight from `wpctl get-volume`), while PUT
  expects **0–100** (`:185`, `parseInt`). Any client that round-trips the value without
  converting shows 65% volume as "0" and writes back something meaningless. The control bar
  normalises explicitly, but the API itself should pick one scale. *Found 2026-08-15 by the
  control bar reading its own slider back as zero.*
- ⚪ **There is no `/api/characters`.** The fleet character list lives at
  `/setup/characters/api/characters`; `/api/characters` returns the 404 **HTML page**, so a
  client that does not check `content-type` gets a parse error rather than a clear 404. Worth
  a redirect or a real alias, since the intuitive path is the one that does not exist.
- ⚪ **The browser suite cannot run while the service is running.** `playwright.config.js`
  spawns its own server on 3200, and `services/resource/singleInstance.js` refuses a second
  MonsterBox process unconditionally — correctly, since two servers on one Pi would both reach
  for the same GPIO and I²C. The consequence is that `npm run test:browser` always failed on a
  live node with `MonsterBox already running (PID …). Exiting.` Use
  **`npm run test:browser:solo`** (added v9.0.0), which stops the service, runs the suite, and
  restarts it on every exit path including Ctrl-C.

- ~~**The head twitches to exactly 60° and 120° whenever a non-daemon servo command runs.**~~
  — **root-caused and fixed v9.2.0.** The suspicion was right and the mechanism is now
  measured: `pca9685_init` ran the reset/SLEEP/prescale/wake sequence on **every** command
  (every command is a new process), and **writing the prescaler requires MODE1 SLEEP, which
  stops the oscillator and drops PWM on all sixteen channels** for the length of that write.
  Two fixes to the direct path, so it is safe even with no daemon: init is **non-destructive**
  (the chip is probed and adopted as-is if already awake at the right prescale, so the full
  sequence runs once per power cycle), and channel writes are **one atomic 4-byte block write**
  instead of four separate byte writes that a concurrent writer could interleave into a pulse
  width nobody asked for. Plus the persistent daemon below.
  **Measured on the Orlok node, 24 one-shot commands aimed at an unconnected channel while
  sampling the head channel: before 11 SLEEP events / 53 no-pulse reads → after 0 / 0.**
  *(The evidence only became visible because the I²C sampler gained `--mode1`: the LED registers
  keep their values through a re-init, so counting MODE1 SLEEP entries is the only
  register-level proof of a cross-channel drop.)*
- ⚪ **All servo traffic now goes through one persistent daemon** (`python_wrappers/servo_daemon.py`
  + `services/hardwareService/servoDaemonClient.js`), which owns the I²C bus. `batchMoveServos`
  and single-part PCA `moveToAngle` send to it and **fall back to spawning `servo_cli.py` if it
  is absent** — a missing daemon degrades, it does not disable a servo. Things to know:
  - The daemon is a **transport, not a policy engine.** `applySafetyLimits()` still runs in Node
    first; the resulting window is passed down so the daemon can only **narrow** (angles clamped
    to 0–180 unconditionally, an optional per-move min/max intersected on top, never
    substituted). Power-grouped parts still do **not** join a batch — the fused elbow/forearm
    rail stays serialized with its cooldown.
  - **Shutdown deliberately leaves servos holding their last position.** Releasing everything
    would drop the head under gravity.
  - `jaw_servo_daemon.py`'s **name is load-bearing** — `jawServoDaemon.js` spawns it and
    `singleInstance.js` reaps orphans by matching it in the process table.
  - A second daemon never binds the socket twice; it stands by and takes over if the owner
    exits. The socket file is removed on clean shutdown (v9.2.0), so callers stop paying a
    refused connection first.
- 🟡 **MJPEG never drops stale frames.** The stream is genuinely realtime for a fast
  consumer — measured 19.95 fps raw and proxied with zero frame loss and an 81 ms p50
  capture-to-delivery, the proxy adding ~12 ms. But a *slow* consumer accumulated
  **+18 s of latency over 20 s** on both the raw and proxied paths, because
  MJPEG-over-TCP has no frame-dropping: it just queues. Anything that falls behind
  drifts unboundedly rather than skipping to live.
- 🟡 **`askAgentQuestion` opens a brand-new agent WebSocket per question.**
  `services/elevenLabsWebSocketService.js` — signed-URL fetch, handshake and
  `conversation_initiation` on every turn, with no conversation memory carried
  across. Measured end-of-speech to reply audio is **10-13 s**, and this is very
  likely most of it. A persistent headless session already exists
  (`setAgentEnabledForCharacter`); this path should route into it.
- ~~**Agent turn-taking is tuned for a phone assistant, not an animatronic.**~~ — **retuned
  v9.2.0.** ⚠️ *This entry was also **factually stale** and the correction is worth keeping: it
  claimed `turn_timeout` was **15 s** and implied `turn_eagerness: "patient"` fleet-wide. Live
  and snapshot state was **7 s on five agents and 12 s on Orlok**, and **only Orlok was ever
  "patient"**. Verified against `config/elevenlabs/agents/*.json`.* Retuned per character
  rather than uniformly, for a yard rather than a phone:
  - `turn_eagerness` — Orlok `patient` → `normal` (patience belongs in the voice, not in the
    silence); Sir Dragomir, Groundbreaker, Renfield → `eager`. **Mina and PumpkinHead stay
    `normal` deliberately** — both do close work with small children, who hesitate mid-sentence,
    and eager turn-taking buys speed by risking talking over them.
  - `turn_timeout` — Orlok 12 → **8 s**, Mina 7 → **6 s**, the other four 7 → **5 s**. This is
    the silence before the character re-engages, and the BECKONING blocks written for exactly
    that moment were waiting roughly twice as long as they needed to.
  - `soft_timeout_config` — **enabled fleet-wide** (was `-1`/disabled) at **1.5–2.5 s** per
    character, so a slow turn is an in-character murmur instead of dead air. The filler lines
    had been written and shipped in 8.5.1-ai and had **never once played**;
    `disable_until_first_user_message` is set so a filler can never be the first thing a guest
    hears.
  - **Current shipped state** (`config/elevenlabs/agents/*.json`, 2026-08-16): Orlok
    normal/8 s/2.5 s · Mina normal/6 s/2.5 s · PumpkinHead normal/5 s/2.0 s · Sir Dragomir
    eager/5 s/2.0 s · Groundbreaker eager/5 s/2.0 s · Renfield eager/5 s/1.5 s.
  - ⚠️ **Turn-taking is an audio-path setting and has NOT been verified with a live guest.**
    The judge panel is a text simulation and cannot exercise it.
- 🟡 **Echo leakage persists during the agent's own reply.** Suppression was fixed once
  in v9.0.0 (gap-based utterance detection, monotonic deadline) but a live exchange
  still logged two spurious "user" turns (`"Yes."`, `"..."`) while the character was
  speaking. May need real acoustic echo cancellation rather than time-based
  suppression.
  **2026-08-18:** the ReSpeaker XVF3800 array now supplies **on-device AEC on Orlok** — which
  is exactly what this entry asks for. **Re-measure on Orlok before writing any more
  time-based suppression**; the right fix may be to *remove* code rather than add it. Left
  open deliberately: hardware AEC is claimed by the vendor, not yet measured here, and the
  other nodes still have no AEC at all.

## Test Suite (known-flaky)

Intermittent failures noted in `CLAUDE.md` — they pass on retry and are treated as
non-blocking. Listed so a genuine regression here isn't dismissed as "the usual flake":

- 🟡 **VU meter** — audio level-meter test intermittently fails.
- 🟡 **Jaw-animation save-config** — save assertion intermittently fails.
- 🟡 **Calibration timeout** — calibration test intermittently times out.

Plus two hard (not intermittent) `test:system` failures. **An earlier revision of this file
called both "confirmed pre-existing." That was wrong, and the correction matters more than
the entry:**

- ~~**`tests/system/parts-api.test.js` — "should dispatch servo parts without testResult
  wrapper"**~~ — this was a **real v9.0.0 regression**, not pre-existing, and is fixed.
  Commit `5db5b823` declared `const hw = {...}` inside the `GET /:id` handler while
  referencing it from `POST /:id/test`, so every non-`motion_sensor` branch — servo, light,
  linear actuator, motor, generic — threw a ReferenceError and returned HTTP 500. **The
  operator "Test" button was dead for nearly every part.** Fixed in `86541e54`. There is also
  only **one** such test in that file, not two. The "pre-existing" label came from a claim
  that was relayed rather than reproduced; the release verification run caught it by reading
  the actual response body (`{"error":"Failed to test part","message":"hw is not defined"}`)
  instead of trusting the label.
- ⚪ **`tests/system/orchestration.test.js:97` — "returns status for a known node"** — expects
  200, gets 404. **Environmental, genuinely pre-existing.** The test hardcodes node id 1
  (PumpkinHead, `192.168.8.150`), which is physically offline (`EHOSTUNREACH`). v9.0.0 touched
  neither the route nor the test. Underlying fragility worth fixing: the route maps
  `success:false → 404` (`routes/api/orchestrationRoutes.js:1171`), conflating "unknown node"
  with "node unreachable" — those deserve different status codes, and the test should not
  depend on a specific node being powered on.

**Process note worth keeping:** a "known pre-existing failure" label is a claim like any
other. Verify it against the current tree before it is allowed to suppress a red test — this
one hid a dead operator control for several commits.

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

- ~~**Ghost character 6 data directory.**~~ — **resolved:** character 6 is **Renfield**,
  registered in `data/characters.json` and (since v9.2.0) in `config/animatronics.json`. The
  directory is no longer orphaned. *Historical note: it was previously an unregistered
  leftover, mitigated in v8.2.3 by having the schema validator skip anything not in
  characters.json.* His **hardware** remains entirely unverified — see the Renfield section.
- ⚪ **Orlok scene 106 references a part that does not exist.** `data/character-3/scenes.json`
  scene 106 "Full Servo Test - All 4 Servos" drives parts 4, 5, 10 and **11**, but this
  character's four servos are 4, 5, 10 and **15** (`data/character-3/parts.json`). It looks
  like 11 should be 15, but it is show data and has deliberately **not** been guessed at.
  Since v9.0.0 the missing part no longer aborts the scene — hardware steps are non-fatal —
  so it plays through and reports the failed step. An operator should confirm the intended
  part and correct it in the Animation Studio.
- 🟡 **Character 1 part 1 description is test debris** — see the PumpkinHead section above.
  Left unfixed on purpose (node offline, hardware unverified).
- ~~**Groundbreaker character-ID mismatch (5 vs 7) — producing a phantom character-7.**~~ —
  **resolved as of 2026-08-17.** `config/animatronics.json` now maps host `groundbreaker` to
  **characterId 5**, matching `data/characters.json`; the registry is a clean 1–6. The stray
  character 7 ("Temp") was deleted from the registry and its `data/character-7/` directory
  removed (the app's `deleteCharacter` logged the permanent deletion on Mina 2026-08-17
  16:40; no node carries the directory any more). *Historical context:* the mismatch is why
  the wrong-voice bug hit Groundbreaker (registered under 7 against a voice map keyed 5).
  His hardware remains offline and unverified.

---

## Security / Ops

- ~~**A test run could reach the real yard.**~~ — **fixed v9.2.0, after it actually happened.**
  A browser test with a stale route interceptor fired a genuine `POST /api/panic {fleet:true}`
  **twice** during a suite run, **disarming superpowers across every reachable node**. Sir
  Dragomir's jaw animation was found switched off afterwards and has been restored. Nothing in
  the run reported it — it surfaced only by diffing the nodes. Route-level `MB_TEST_MODE` guards
  existed but had **missed `/api/panic` entirely**, and `orchestrationService` had none at all.
  The guard now sits on **`orchestrationService.httpNode`**, the single egress point every
  inter-node call passes through, so no route, script or future test can go around it.
  **Reads are still allowed deliberately** (a test asking a node how it is doing is harmless,
  and blocking it would push tests toward mocking the code under test); **writes are refused and
  reported as refused.**
  - *Still true and worth repeating:* the orchestration **system** tests must be run against a
    test-mode server. Running them against production fires real fleet commands.
  - *If you ran a suite before this fix:* re-check each node's superpowers (jaw, head tracking,
    lurk, motion) — they may be silently off.
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

### 2026-08-20 late session (audio output, both XVF3800 nodes)

- ~~**Mina inaudible / Orlok "very very quiet" — one cause, two presentations.**~~ — **fixed
  2026-08-20, proven by ear-check on both nodes.** The reSpeaker XVF3800 ships with its mono
  DAC path (`amixer` control `'PCM',1`) at **40/60 = −20.00 dB** while the stereo `'PCM',0`
  sits at 0 dB. Every software layer checked out (sink volume canonical, unmuted, streams
  exiting cleanly), which is why the V11-HANDOFF §11 investigation concluded "signal reaches
  the array, no sound in the room" and suspected Mina's powered subwoofer. It was the mixer.
  Set to 60/0 dB + `alsactl store` on Mina and Orlok; ear-check transcripts after the fix:
  Mina word-perfect ("Mina here, testing my voice at the new volume…"), Orlok transcribed
  with minor mishears. **Provisioning implication — closed 2026-08-22:** install.sh Step 15
  now normalizes `'PCM',1` → 0 dB on every XVF3800 card present (before `alsactl store`),
  so a reimaged or newly provisioned array no longer arrives 20 dB quiet. Landed for Mina's
  rebuild; first hardware run is her post-rebuild acceptance (docs/hardware/MINA-REBUILD.md).
  Note: Mina's canonical 1.0 sink volume was set while the DAC was −20 dB; re-tune by ear.

- 🟡 **Orlok's audio sink WEDGED for ~40 min (2026-08-20 22:26–23:05) — cause unknown,
  cleared, watching.** A `pw-play` hung from 22:26 (survived SIGTERM), app playback returned
  `playback_timeout` on a 4-second line, capture children overran their deadlines, and even a
  direct `pw-play Front_Center.wav` timed out — the sink itself was stuck, not the app. The
  no-suspend rule WAS active (`/etc/wireplumber/main.lua.d/51-monsterbox-nosuspend.lua`), so
  sink-suspend is not the explanation. `systemctl --user restart pipewire pipewire-pulse
  wireplumber` + a service restart cleared it; ear-check green afterward. Started ~2 min
  after a `monsterbox.service` restart — if it recurs after a restart, suspect a race between
  the service's audio clients and the USB sink coming back.

### v9.1.0 / v9.2.0 (2026-08-16 — Halloween session)

- ~~**Four of six characters spoke in the WRONG voice on the say/scene path.**~~ — fixed
  **v9.1.0**. A hardcoded per-character voice map in `services/aiConfigStore.js` never tracked
  the agent-side voice changes: **PumpkinHead spoke in Sir Dragomir's voice**, Sir Dragomir in a
  voice retired from his agent, and **Renfield and Groundbreaker both spoke as Orlok** (no map
  entry → global fallback; Groundbreaker is registered under characterId 7 against a map keyed
  5). Only Mina and Orlok were correct. An earlier fix wrote camelCase `voiceId` into the
  character configs while **every reader uses snake_case `voice_id`**, so it was dead on arrival
  and the wrong voices shipped anyway. Voice identity is now **data**, synced into
  `data/character-{id}/ai-config/tts-config.json` from the committed agent snapshots in
  `config/elevenlabs/agents/`; a character with no configured voice warns once instead of
  silently impersonating someone else. ⚠️ **Only effective on a node that received the deploy.**
- ~~**Saving anything on the AI settings page deleted the character's `voice_id` and
  `speed`.**~~ — fixed **v9.2.0**. `saveTTSConfig` wrote the request body straight over the
  file, and that page exposes only model/stability/similarity — so every save dropped the two
  fields that are the character's *identity*, and the character carried on in the shared
  fallback voice with nothing logged. Caught live when a browser-test pass stripped a
  character's voice mid-run. **Saves now merge**; the same partial-save bug was silently
  dropping `microphonePartId` on the STT side. The ear-check gained the outside check that would
  have caught it: it compares the voice a node **actually used** against the canonical snapshot.
- ~~**`sceneExecutor` looked up calibration profiles without a `characterId`.**~~ — fixed
  **v9.2.0**. Part IDs are unique only *within* a character, so the lookup fell back to whichever
  character the **node** has selected — **clamping one character's motor step from 2000 ms to
  0 ms using another character's calibration.** Previewing any character's scenes on a shared
  node was affected. `characterId` is now threaded through all four lookups and the three preset
  resolvers.
- ~~**Gesture light steps never fired.**~~ — fixed **v9.2.0**. `setLight` called a
  `controlLight()`/`setLight()` pair that does not exist on the hardware service; light parts
  take `turnOn`/`turnOff` through `controlPart`. Since most recipes pair a servo with a light,
  **every gesture was quietly reduced to the single-part motion the design exists to refuse.**
  A gesture now reports 3/3 steps where it reported 2/3.
- ~~**Every audio step in every Yard Theater moment was a no-op.**~~ — fixed **v9.2.0**.
  `POST /api/orchestration/animatronic/:id/play-audio` requires an `audioId` and 400s without
  one; `perform.mjs` only ever sent `filename`. Both Thomas moments are audio-only, so **the
  Thomas moment would have been silent on Halloween.** Filenames now resolve to that node's own
  `audioId` (ids are per-node), and a file missing from a node's library is skipped with a
  warning. Related: **`thomas-whisper.mp3` was in no node's library at all** — it sat in
  `data/audio-library/` but never in `files/` and was absent from `library.json`. Now registered.
  (`dusk-theme.mp3` is still missing **on purpose** — an optional music bed that skips
  gracefully.)
- ~~**Every Halloween cron line would have failed at the redirect and never run.**~~ — fixed
  **v9.2.0**. `/home/remote/yard-theater-logs/` did not exist. Verified against real cron with a
  temporary entry, not by reading it: the `cd /home/remote/MonsterBox &&` prefix is load-bearing
  (cron runs with `cwd=$HOME`), `/usr/bin/node` is on cron's PATH, `harvest.mjs` resolves its key
  from `/etc/monsterbox/elevenlabs.key` with no interactive environment, and Node's timezone is
  `America/Chicago` so the 18:30 / 20:47 / 02:00 slots mean what the comments say. The 2am
  harvest now runs `scrub-test.mjs` first and **only harvests if it passes.**
- ~~**The night-memory PHI scrubber was a deny-list and leaked real names.**~~ — rebuilt as an
  **allow-list**, **v9.2.0**. An adversarial corpus of **36 cases broke the old one 23 times**;
  the worst failure was structural rather than a missing pattern — "collapse a capitalized pair
  unless *either* word is canon" left **"Emily Rodriguez" completely intact**, because Emily is a
  canon name. It had also never seen O'Brien, McDonald, hyphenated or three-part names, ALLCAPS,
  lowercase transcripts, ages, schools, handles, links, dates, or an unnumbered street. Now **any**
  run of two or more consecutive capitalized tokens collapses to its first token unless the whole
  run is an explicit canon *phrase*, so unseen surnames are removed too. A token-wise canon rule
  was tried first and **rejected on real data** (a live transcript summary carried "Aaron Warner"
  straight through it). `isClean()` drops any remaining line carrying a digit, an `@` or a URL
  rather than publishing it. **51/51 pass**, and the canon cases assert what must *survive* so the
  suite cannot pass by deleting everything.
- ~~**mDNS discovery was dead on this node.**~~ — fixed **v9.2.0**. `avahi-utils` had never been
  installed here, and `avahi-daemon` was not running on one other node. **All three live nodes now
  advertise `_monsterbox._tcp` and discover each other**, which is what lets a node auto-appear
  when it boots. The three offline nodes remain undiscoverable until they are powered.
- ~~**`views/components/control-bar.ejs` pointed at a `placeholder.png` that never existed.**~~ —
  fixed **v9.2.0**. **Every page in the app fired a 404** and leaned on the `img onerror` handler
  to hide the broken image. The Fleet Command Center now loads with 0 failed requests and 0
  console errors (both were non-zero).
- ~~**Renfield had no fleet entry, so his Pi would boot as the wrong character.**~~ — fixed
  **v9.2.0**. Being absent from `config/animatronics.json` was not neutral:
  `getHostnameCharacterId()` maps hostname → characterId from that file, so without an entry his
  Pi would boot as whatever `app-config.json` held and advertise *that* identity over mDNS. See
  the Renfield section for why his `ip` is `null` and why that is the right answer.
- ~~**`deploy-to-animatronic.sh` refused to run without an exported `PASSWORD`.**~~ — fixed
  **v9.2.0**. It demanded a password even on a fleet where SSH key auth already works, punishing
  the more secure configuration. It now prefers keys, falls back to the password, and reports
  which mode it used. *(The rsync-exit-23 abort is a separate, still-open problem — see
  Cross-Cutting.)*
- ~~**`--hours 0` was silently rewritten to 26**~~ (a `|| 26` on the parsed value) — fixed
  **v9.2.0**.

### Earlier

- ~~**Head tracking was configured to sweep -61° to +259°.**~~ — fixed **v9.0.0**.
  `super-powers.json` had `centerDeg: 99` with `rangeDeg: 160`. It only ever survived
  because the safety clamp caught it, which means the head would have pinned against
  a limit for seconds at a time and looked broken. Retuned to 90/28, matching the
  62-118 that was physically validated, and part 15 now has an explicit 60-120 window
  in `config/hardware-safety.json`.
- ~~**`microMovement` was configured on every character and read by nothing.**~~ —
  fixed **v9.0.0**. The idle liveliness block sat in each `movement-config.json` with
  no consumer; `services/speechExpressionService.js` now implements it, so the
  character drifts between turns instead of holding perfectly still.

- ~~**The panic button never reached the fleet.**~~ — fixed **v9.0.0**. `public/js/dashboard.js`
  fired `POST /api/orchestration/stop-all`, which **does not exist and returns 404**. The real
  routes are `/api/orchestration/emergency-stop` and `/api/orchestration/stop-all-queue-loops`.
  Audio and scene-queue stops did land, so the button appeared to work — the fleet-wide stop
  silently did nothing. Both the dashboard and the new global control bar now call the routes
  that exist, verified by HTTP status.

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
  *See also:* the continuous stream introduced by this fix is the very thing that later
  fell back to the legacy per-chunk path **silently** on the ReSpeaker XVF3800 — the direct
  descendant bug, *Far-field STT* under Cross-Cutting.
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
  ⚠️ **Do not cite this as proof that an empty capture can never be reported as success.**
  That guard only ever covered the per-**chunk** path. The **continuous** stream is exactly
  where zero frames slipped through silently for months — see *Far-field STT* under
  Cross-Cutting. Still fixed; just narrower than it reads.
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

---

## Chain consistency defects — opened 2026-08-19, CONFIRMED and UNFIXED

Found by a six-hop review of part → model → calibration → hardware → API → UX, each verified by an
adversarial second pass. The contract these violate is
`docs/development/PART-MODEL-CALIBRATION-UX-CHAIN.md`. **All still open.**

### Two corrections that have already misled multiple investigations

- **`invert` is NOT a part-record field.** `grep -rn "invert" data/character-*/parts.json` returns
  nothing. It lives in `data/calibration_profiles.json` under `capability.invert` (Mina's Neck = key
  `2:2`). Anything reading `part.config.invert` or `part.invert` gets `undefined` for every part on
  every character.
- **`minPulse` / `maxPulse` / `neutralPulse` are dead data**, still presented as editable live tuning
  in `views/setup/models.ejs` and `views/setup/calibration.ejs`. Zero hits in the wrappers; pulse
  mapping is hardcoded (standard 500–2400 µs, continuous 1000/1500/2000). Editing them changes
  nothing and the UI reports success. **Removal is agreed but not yet done.**

### Open — `characterId` resolved at one hop and dropped at the next

Part ids are unique only *within* a character, so an unscoped lookup addresses a different
animatronic's hardware. `npm run audit:resolver` catches direct `selectedCharacter` reads; it cannot
catch a handler that resolves correctly and then drops the value.

- **Linear-actuator jog bypasses `controlPart()`**, so the entire safety layer — including
  `blockAllMotion` on a quarantined part, which CLAUDE.md says never relaxes — never runs.
- **Setup calibration page** reads a part scoped by `characterId` but writes it back to the node's
  `selectedCharacter`.
- **`POST /setup/calibration/api/standard_servo/:id/move`** picks the part from one character and the
  hardware + safety envelope from another.
- **Calibration `goto`** judges safety for the resolved character, then clamps bounds and executes
  against `selectedCharacter`.
- **The calibration adapter cache is keyed by bare `partId`** (`server/calibration/router.js:15`,
  read at :785, written at :822, deleted at six sites). On a process serving more than one character
  the adapter built for one character's part 1 is returned for another's. Fixing it means threading
  `characterId` through `getOrCreateAdapter()` and all eight cache sites — deliberately deferred
  rather than done untested.
- **Nothing tells the Python wrapper which character it is running for**, so `servo_cli.py`'s
  independent guard re-resolves `selectedCharacter` and can load a different character's safety entry
  than Node just enforced.
- **Model defaults resolve without `characterId`** (`services/hardwareService/index.js:105`), so the
  per-character override directory is chosen by `selectedCharacter`.
- **Webcam control routes** resolve part ids against `selectedCharacter`.

### Open — reported state vs actual state

- **`bounds.minAngle`/`maxAngle` is written as a travel window but read as the invert reflection
  axis**, so recording a bound on an inverted servo shifts its whole coordinate system.
- **The configured safety angle window is enforced on the PRE-invert angle**, so the value that
  actually reaches an inverted servo can sit outside the window.

### Open — UX honesty

- **`#headTrackToggle` is never disabled** even when
  `GET /conversation/api/lurk-mode/capabilities` reports `headTracking: false` (as it does on Mina).
  Clicking it 400s and the dashboard silently reverts the checkbox. The honest UI disables it; this
  was left undone because seven call sites across four browser specs click that toggle and disabling
  it would break them. Fix the specs and the UI together.
- **A stale `deviceId` (e.g. `"pulse"`) remains in some `stt-config.json` files.** It is inert in
  `elevenLabsWebSocketService` (`getSTTConfig()` returns an explicit literal that never carries
  `deviceId`), but the raw file is read directly elsewhere — audit those paths before trusting the
  operator's mic selection.

### Open — fleet

- **Sir Dragomir has ZERO scenes and `defaultSceneId: null`**, so he silently drops out of every
  fleet queue loop. `services/orchestrationService.js:602-607` does return
  `success:false, 'No defaultSceneId configured'` for him, but the aggregate fleet call still reads
  as fine. He needs at least one scene authored.

### Head tracking — SHELVED for Halloween 2026 (operator call, 2026-08-23)

After the full chain was rebuilt and verified in code (auto-restarting tracker, honest
crash reporting, calibrated-window drive mapping, restored HOG reach, robust tracker
fallback, read1 stream reads), live tracking on Sir Dragomir still did not reach a
show-usable feel in time, and the operator shelved it: **run Halloween without head
tracking.** Lurk mode's other superpowers (jaw, idle, motion sensor, AI) are unaffected
— just leave the Head toggle off.

State of the code at shelving:
- Final commit `eaffabf` is on main / both claude branches. The last fix (stream reads
  starving the tracker to <1 fps — read(n) blocking inside the drain loop; loopback-
  proven 15.3 fps after) was pushed but **never verified on the node**. If anyone
  retries, it is one command:
  `cd /home/remote/MonsterBox && git fetch origin main && git checkout origin/main -- scripts && sudo systemctl restart monsterbox.service`
  then watch the FPS readout on /setup/head-animation — ~10 fps means the starvation
  is gone and tracking is worth re-judging; still ~1 fps means the bottleneck is
  elsewhere (stream connect, CPU) and the shelving stands.
- Everything else from the same sessions IS live and confirmed by the operator:
  dashboard no longer drags the viewing computer, video is real-time fleet-wide,
  server latency fixed (/health 2.9s → 19ms on the node).
