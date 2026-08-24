# Operator hardware to-do — things only hands can fix

Software cannot close any of these. Each one has been isolated to a physical cause with evidence,
so none of them needs re-diagnosing from scratch.

Last updated **2026-08-22** (v11.0 production-readiness audit + bench session; §C jaw moved to ch1, §G watchdog added).

---

# ⚑ v11 CONSOLIDATED CHECKLIST — 2026-08-21

Ordered by what unblocks the most. Items 1–3 are new this session.

## A. USB 5 V rail is browning out on the dev node — **highest priority**

**2026-08-21 update: now 831 over-current events in one boot (was 155, then 447). At that
point the camera stopped answering snapshots entirely — HTTP 000, 0 bytes — while the
service still reported active.**

**Evidence:** 447 `over-current change` events in `journalctl -k -b` on one boot (155 measured four
hours earlier, so it is accelerating). `usb2-port1: over-current change #47`, `usb2-port4: #27`, and
repeated `usb 1-1.1` / `usb 1-1.2` disconnect-and-re-enumerate cycles — those two are the camera and
the ReSpeaker 4-mic array. The camera moved `/dev/video1 → /dev/video0` at 03:03.

**What it explains, so these are NOT separate faults:**
- 144 motion-tracker spawn/kill cycles (camera drops → stream read times out → tracker respawns,
  ~2.4 s of CPU each for the `cv2` import)
- the one remaining browser-suite failure (`webcam-capture` snapshot timeout)
- the 2026-08-17 incident where mjpg-streamer crash-looped 42 times

**Fix:** a **powered USB hub** for the camera and the mic array. The Pi's 5 V rail cannot carry both.

**Software stopgap that WORKS but does not last.** A USB port reset recovers the camera — it is the
software equivalent of unplugging and replugging it. Verified 2026-08-21: dead camera (snapshot
HTTP 000, 0 bytes) restored to a valid 47 KB JPEG. Then it died again during the next test-suite run.
So this buys minutes to hours, not a fix.

```bash
# 1. Find the camera's USB device node (it was 1-1.1, product "USB Camera", 0c45:6366)
for d in /sys/bus/usb/devices/*/; do
  [ -f "$d/product" ] && grep -qi "USB Camera" "$d/product" && echo "$d"
done
# 2. Toggle authorization = replug
echo 0 | sudo tee /sys/bus/usb/devices/1-1.1/authorized
sleep 3
echo 1 | sudo tee /sys/bus/usb/devices/1-1.1/authorized
sleep 6
# 3. Restart the streamer and confirm a REAL frame (not just a 200)
sudo systemctl restart mjpg-streamer
curl -s -o /tmp/f.jpg -w '%{http_code} %{size_download}\n' 'http://localhost:8090/?action=snapshot'
file /tmp/f.jpg     # must say "JPEG image data", and bytes must be > 1 KB
```

**2026-08-21 11:30 — the stopgap STOPPED WORKING.** The reset succeeded once, then stopped
recovering the camera at all. Current state: the device re-enumerates and authorizes
(`Found UVC 1.00 device USB Camera (0c45:6366)`, `authorized to connect`) and appears on the bus, but
attaches DEGRADED — `Failed to query (GET_INFO) UVC control 5 on unit 1` and
`cannot get freq at ep 0x84`. mjpg-streamer then reports a clean start
(`Frames Per Second: 15`, `Format: JPEG`) while delivering ZERO frames: port 8090 listening,
snapshot hangs indefinitely. So the camera is no longer recoverable in software.

Also note the counters: `usb2-port1` reached over-current **#232** with ports 2, 3 and 4 reporting
too (#153/#142/#137). Multiple ports on the USB 3 root hub, not one bad device — so suspect the
rail/hub rather than the camera itself. Try: a powered hub, a different port, and a known-good cable,
in that order. The camera also migrated `/dev/video0` -> `/dev/video1` during this, and the
`/dev/v4l/by-id/` symlink followed it correctly, which is exactly why the launcher resolves by-id.

**This is deliberately NOT automated.** Auto-resetting USB on failure would keep the camera limping
and hide an escalating hardware fault — and the counter has gone 155 -> 447 -> 831 -> 857 in one
session. Note the device path is `1-1.1`; the ReSpeaker mic array is `1-1.2`, so toggling the camera
does not disturb audio.

**How to tell it is dead without guessing:** `GET /setup/calibration/api/webcam/health` now reports
`mjpgStreamer.running` as "frames are actually flowing" plus a `notStreamingReason`. The old field
returned `true` whenever mjpg-streamer's web server answered, which it does happily with a dead
input plugin — so the dashboard showed a healthy camera that was delivering nothing. The journal
signature to confirm it is: `libv4l2: error turning on stream: Protocol error` /
`Can't enable video in first time`.

**Note:** `data/character-3/parts.json` still records `devicePath: /dev/video1, deviceId: 1` while the
camera is now at `video0`. Harmless today only because `scripts/mjpg-launcher.sh` resolves via
`/dev/v4l/by-id/`. Do not "fix" it by hardcoding a bare device node.

## B. Dedicated supplies + fuses for the damaged arm parts — voltage matters

Operator plan is a dedicated supply and a 5 A fuse each. **Verified against the manufacturer
2026-08-21: the RDS51150 150 kg servo is a 12 V part, operating range 9–12.6 V, stall 8.0 A @ 12 V.**
12 V is correct. **24 V would destroy it.** If the installed servos are genuinely 12–24 V they are a
different model — read the label off the case and update `data/models/servo_models.json` before wiring.

A 5 A fuse will open on a stall (8 A) as intended, and may also open on a legitimate high-torque move.

## C. Confirm the knight's head servo — ✅ RESOLVED 2026-08-22: NOTHING is dead

**Bench verdict (operator, 2026-08-22): jaw drives great on ch1, magic box great, and the
HEAD SERVO IS ALIVE on ch4** — it rotates, occasionally all the way around (which stresses
the wires; that behavior was the software scale bug, now fixed — see below). The 2026-08-19
"+0.4 dB dead channel" reading is closed as a probe artifact. The second software problem
(the 0–180-vs-900° scale) is **fixed in v10.4.0**: the calibration surface, adapters, and
wrapper conversion all speak the Stingray's REAL degrees now. What remains is hands-on:
**BENCH-CHECKLIST K3** — declare `rotationRangeDeg` on the node's part 1, calibrate a
cable-safe window in real degrees, stamp Calibrated, then remove the part-1 entry from
`config/physical-faults.json`. Until K3 is done the head stays hands-off (K2).

Historical record of the disagreement this section existed to settle:

- 2026-08-19: ch4 driven 1645/1348 µs → **+0.4 dB** (no motion), while ch0 jaw → **+29 dB**. Recorded
  below as a dead channel.
- 2026-08-21: ch4 driven `move_to_pca 60→90` (1167→1444 µs) → **+10.33 dB**, against a −0.14 dB idle
  control and 0.78–1.44 dB on every other channel. That looks like real motion.
- A follow-up re-probe read only 1.01–1.78 dB — **but that probe was invalid**: it used
  `move_to_pca_multi 88→92`, which is a **4 µs** change (the multi path uses a 0–1800 scale), below a
  typical 3 µs deadband. It commanded essentially nothing.

**2026-08-22 update: Aaron has physically moved the jaw servo to ch1** and declared it a config
change. The repo's config copy and docs now say ch1 (the node's own `parts.json` on Sir Dragomir
must say ch1 too — command below). What remains is the 2-minute half of the test:

```bash
# On Sir Dragomir (or from any machine on the LAN):
# 1. Make the node's own config match the physical move (jaw = part 2 → channel 1)
curl -sk -X POST "https://192.168.8.130:3000/setup/calibration/api/parts/2/overrides" \
  -H 'Content-Type: application/json' -d '{"overrides":{"channel":1}}'
# 2. Nudge the jaw (part 2, now ch1) — the servo is known-good, so:
curl -sk -X POST "https://192.168.8.130:3000/api/calibration/2/nudge" \
  -H 'Content-Type: application/json' -d '{"dir":"max","scale":"med"}'
# Turns → ch1 and V+ are fine, and the HEAD servo (ch4) is the dead element.
# Doesn't turn → the fault is the ch1 channel / harness / power.
```
(The earlier note said `/api/calibration/1/nudge` — part 1 is the head; the part to nudge after
the move is the JAW, part **2**.) Also meter V+ at the ch1 header pin against ch0's.

**Second, independent problem on the same part — this one is software and is why it "cannot be
calibrated":** the head is a goBILDA Stingray-2, `rotationRangeDeg: 900` (manufacturer-confirmed),
but its calibration profile treats it as a 0–180 absolute servo over the same 500–2500 µs span. **One
degree in the calibration UI is five degrees of real head movement.** Its profile is also
`autoGenerated: true`, so every runtime consumer refuses to drive it. Do not calibrate this part until
the scale is fixed, or the first sweep will tear the head cabling.

## D. Knight's head cabling — **eyeball the loom before and after K3** (renewed 2026-08-22)

The 2026-08-21 question ("did the 60→90 probe over-rotate it?") is now moot in the best way —
the channel is alive (see C), so that probe DID move it ~125°, and the operator reports the
head has since rotated "all the way around and stressed the wires" more than once at the
bench. Before running BENCH-CHECKLIST K3, inspect the cable loom for chafe/stretch and
re-slack it; after K3's window is set, confirm the loom stays relaxed at both window ends.

## E. Mina's neck/eye channels — ⚠️ REOPENED: the rewire never happened (2026-08-23)

**Retracted.** This section previously declared the ch8/ch11 fault closed by a
2026-08-22 harness rewire. Asked directly on 2026-08-23, the operator confirmed
**Mina's harness is UNCHANGED**. The rewire was planned, never wired.

So the shared-branch hypothesis is live again, exactly as measured 2026-08-19:
neck **ch8** (+2.3 dB) and eye **ch11** (+2.8 dB) both carry correct PWM and are
both silent, against a jaw **ch4** control at +14 dB. Treat ch8 + ch11 as ONE
suspected shared V+/harness branch, not two coincidental dead servos (§2).

**Do NOT run the `MINA-REBUILD.md` §3a override curls** — they would move the jaw
off ch4, the only channel with a servo known to respond. `parts.json` (jaw 4 /
neck 8 / eye 11 / laser 0) is correct and needs no change.

Next step is hands, not software: swap the known-good jaw servo ch4 → ch8, cycle,
then → ch11. Full history: `docs/hardware/PCA9685-CHANNEL-MAP-MINA.md`.

## F. Orlok's head window was restored from documentation — confirm it physically

`data/calibration_profiles.json` held a `0–180` placeholder for part 15 while
`docs/character_orlok.md` records a human calibration of **3°–169°** (2026-08-19 23:45). The
documented window was restored so head tracking would stop refusing (it now offers only the two
servos with real measured windows and reports `canEnable: true`). **Please confirm 3°–169° is still
right at the rig** — it is doc-sourced, not re-measured.

## G. Enable the liveness watchdog on each live node — one command (2026-08-22, UP-5)

The app swallows uncaught exceptions by design and its systemd drop-in sets
`Restart=on-failure`, so a process that wedges mid-show stays "active (running)" forever while
every page times out — nobody restarts it but a human. New in the repo: a root systemd **timer**
that curls `/health` once a minute and restarts `monsterbox.service` after 3 consecutive failures
(never touching a service you stopped yourself). Fresh installs get it from `install.sh`; the
three live nodes need it enabled once, after the next deploy:

```bash
ssh remote@<node>
sudo bash /home/remote/MonsterBox/scripts/install-monsterbox-watchdog.sh
# confirm:
systemctl list-timers monsterbox-watchdog.timer --no-pager
```

The decision logic is unit-tested (`tests/unit/liveness-watchdog.test.js`), but the installed
timer firing on a real node is **UNVERIFIED from the cloud** — after installing, prove it once:
`sudo systemctl start monsterbox-watchdog.service` and check
`journalctl -u monsterbox-watchdog.service -n 5` shows a clean (silent-success) run.

---

# Earlier items (2026-08-19, v10.1.0 session) — still open unless noted

## 1. Dedicated 10 A circuits for Orlok's elbow and forearm  ← operator action

**Parts:** Orlok (char 3) part 4 "Elbow" (PCA ch4) and part 5 "Forearm Rotation" (PCA ch5).

**The actual problem, in the operator's words:** these two are wired on the same power feed, they max
out together and blow a fuse. This is the ONLY genuine current problem on the fleet.

**Fix:** give each one its own dedicated 10 A circuit.

**Context that matters, so nobody re-litigates this:** the supply is **30 A / 800 W**, every big part is
driven directly at 12 V, and everything else is a small dedicated RC-car-class servo — the kind that run
concurrently all day on this hardware. There is **no general current issue**. Software speed caps were
removed in v10.1.0 precisely because they were solving a problem that does not exist; do not reintroduce
them. Once these two have their own circuits, the shared-fuse concern is gone entirely.

~~Until the circuits are added, keep `blockAllMotion` on Orlok parts 4 and 5 in `config/hardware-safety.json`.~~ **Superseded 2026-08-21.** The 2026-08-20 operator ruling emptied that file permanently. The equivalent protection now lives in `config/physical-faults.json`, which stops autonomous code (scenes, queue loops, poses, test suites, head-tracking pan selection) from choosing these parts while still letting the operator drive them by hand to verify a repair.

---

## 2. Dead servo channels — signal is perfect, nothing turns

All four were verified 2026-08-19 by sampling the PCA9685 LEDn registers at 200 Hz through the command
window, with each node's own mic as an acoustic witness (validated with positive and idle controls).
In every case **the PWM is correct and the part is silent**, so the fault is downstream of the chip:
dead servo, broken/unseated signal lead, missing V+, or a burned output driver.

| Node | Part | Channel | Evidence |
|---|---|---|---|
| Sir Dragomir (4) | 1 Head Servo (neck), **multi-turn 900°** (goBILDA Stingray-2, *not* continuous — corrected 2026-08-20) | PCA **ch4** | 1645 µs CW / 1348 µs CCW, correct duration, clean release, no creep → **+0.4 dB**. Same chip, same rail, ch0 jaw → **+29 dB** |
| Mina (2) | 2 Neck | PCA **ch8** | PWM correct and changing 1445↔1763 µs, invert applied → **+2.3 dB** vs ch4 jaw **+14 dB** |
| Mina (2) | 3 Eye | PCA **ch11** | Now drives 1133↔1445 µs → **+2.8 dB**. Had **never been driven since chip init** before this test |
| Orlok (3) | 2 Left Arm of Manipulation | GPIO 18/13, MDD10A | GPIO pins claimed and driven; 3 commands incl. a 2.75 s drive all read **+6.4–6.7 dB**, identical to the idle control |

**The 5-minute diagnostic for each (needs hands):** swap in a known-good servo.
- Dragomir: **DONE 2026-08-22 (physical half)** — Aaron moved the jaw to ch1. What remains is the
  nudge verdict: see **§C above / BENCH-CHECKLIST K1** for the exact commands. The part to nudge
  is the JAW (part **2**) — an earlier version of this bullet said part 1, which is the 900°
  multi-turn HEAD that must never be nudged while uncalibrated (its scale bug can wrap the
  head cabling).
- Mina: move the **jaw servo from ch4 → ch8**, cycle, then → **ch11**. Treat ch8 + ch11 as ONE suspected
  shared V+/harness branch rather than two coincidental dead servos.
- Orlok: meter the MDD10A output at the GPIO18/13 channel during a jog and compare against the working
  GPIO23/12 channel on the same board; check that motor lead.

**Warning from the existing notes:** on Mina, the eye laser lighting proves nothing about V+ — it is a
3 V relay driven off the signal pin.

---

## 3. Two dead USB capture inputs (will corrupt ear-checks)

**Sir Dragomir update 2026-08-22: superseded on his node** — the operator installed a
ReSpeaker XVF3800 4-mic array + speaker (same model as Orlok's). His capture path is now the
array (PyAudio only — judge on FRAMES), not the old adapters. Bring-up + proof:
BENCH-CHECKLIST **K4**. The paragraphs below remain true for Mina.

Both nodes carry a **Unitek Y-247A** whose capture side reads a flat **−79.7 dBFS** — a dead input, not a
quiet room. The camera mic on each node reads ≈ −50 dBFS and hears everything.

**On Mina, ALSA `default` routes to that dead input.** Any ear-check recording from `default` on Mina
will score her deaf. Record from the camera-mic card explicitly. This will bite `npm run earcheck`.

> **Before replacing either adapter, read section 4.** Mina's USB 5 V rail is tripping over-current,
> and a browning-out hub is indistinguishable from a failed capture input. The Unitek may be fine.

---

## 4. Mina's USB 5 V rail is tripping over-current  ← operator action

`dmesg` on Mina shows **24 over-current events this boot**, across five different ports
(`usb2-port1`, `usb2-port2`, `1-1-port1`, `1-1-port3`, `1-1-port4`), plus the webcam dropping off
the bus and re-enumerating three times:

```
usb usb2-port1: over-current change #1
usb 1-1-port4:  over-current change #3
usb 1-1.4: USB disconnect, device number 5   → 6 → 7
```

Everything hangs off one rail behind **two cascaded hubs**:

| Port | Device | Note |
|---|---|---|
| — | VIA Labs hub `2109:3431` | first hub |
| — | Genesys Logic hub `05e3:0610` | **second hub, chained behind the first** |
| `1-1.2` | C-Media Audio Adapter (Unitek Y-247A) | the adapter whose capture side reads a flat −79.7 dBFS |
| `1-1.4` | Microdia Streaming Camera | the device that keeps disconnecting |

**Why this is not cosmetic.** A sagging 5 V rail and a dead peripheral look identical from software.
Section 3 records the Unitek's capture side as dead on the strength of a −79.7 dBFS floor — but that
adapter shares a browning-out rail with a camera that cannot hold a connection. The capture side may
be starved rather than broken, and replacing the adapter would fix nothing.

It also undermines calibration: a part measured through a USB path while the rail is sagging can read
differently run to run, so **settle the power before the calibration session**, or the windows
measured may not be the windows that hold.

**Operator action, cheapest first:**

1. Move the camera to a **powered** USB hub, or straight onto a root port, so it is not sharing with
   the audio adapter behind two chained hubs.
2. Re-check with `dmesg | grep -c over-current` after a clean boot. Zero is the goal.
3. Only if over-current is gone and the Unitek capture is *still* flat, treat it as genuinely dead.
4. If over-current persists on a bare root port, the Pi's own 5 V supply is the suspect — check the
   PSU rating and the cable, not the peripherals.

**Evidence:** `dmesg` on mina, 2026-08-20. Surfaced by the standing log review after commit #2270.

### Planned fix (operator, 2026-08-20): remove the USB hub, plug straight into the Pi

Aaron's call, and it is the right one — the Pi 4B has four ports and Mina only has two USB devices.
Removing both cascaded hubs takes the camera and the audio adapter off a shared, sagging rail.

**Expect these to change on replug, and re-verify each:**

| Thing | Will it move? | How to re-check |
|---|---|---|
| ALSA card index (`plughw:3,0`, `plughw:4,0`) | **Yes, very likely** | `arecord -l` / `aplay -l` — enumeration order changes with port order |
| `/dev/videoN` | **Yes, likely** | `v4l2-ctl -d /dev/videoN --info` to find the one whose Card type is `Streaming Camera` |
| PipeWire `node.name` | **No** | keyed by vendor/product (`alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo`), not by port. The WirePlumber no-suspend rule matches on this, so it survives |
| Sink volume | Resets on replug | `node scripts/fleet-audio/apply-volumes.mjs --nodes 2` (canonical 1.5) |

**Already broken, and this is a symptom of the same fault:** `data/character-2/parts.json` part 7
"Mina Cam" pins `devicePath: /dev/video0`, and **`/dev/video0` does not exist** — the camera is
currently `/dev/video1`. It disconnected and re-enumerated three times (device 5 → 6 → 7) under the
over-current, and the config was never updated. Fix the path after replugging, once it has settled.

**Success criterion:** after a clean boot with no hub, `dmesg | grep -c over-current` should read
**0**. It was 24 at the start of the 2026-08-19 session and 40 by the end — it climbs during normal
operation.

**Then, and only then**, re-test whether the Unitek capture side is genuinely dead (section 3). If it
starts hearing once it has a stable rail, it was never broken and no adapter needs buying.



---

## 5. Sir Dragomir has no scenes

`GET /scenes/api/` on 192.168.8.130 returns `{"scenes":[]}` and his `config/animatronics.json` entry has
no `defaultSceneId`, so `startAllQueueLoops()` skips him and he silently drops out of every fleet queue
loop. The fleet call still reports overall success, so nothing surfaces it.

---

## 6. Software follow-ups these findings created

### Store a USB signature with the Model (operator's idea — worth building)

USB parts (webcam, microphone, speaker) DO expose a stable signature: `idVendor:idProduct`, and often a
serial, visible via `lsusb -v` / `/sys/bus/usb/devices/*`. Saving that alongside the part's `modelId`
would let MonsterBox detect a device that moved ports or was swapped, instead of silently opening the
wrong `/dev/video*` or capture card. This directly addresses the two dead Unitek capture inputs and the
`deviceIndex` / `deviceId` settings a sweep found to be silent no-ops.

**Important scope limit:** this works for USB only. **It cannot work for servos.** A PCA9685 is a one-way
I2C→PWM output driver with no feedback path, and a servo is a dumb 3-wire device (V+, GND, signal) with no
back-channel. There is no way to ask "what is plugged into channel 8." The only way to map servo channels
is empirically — drive one channel at a time and observe motion. Do not chase a software solution here.

### minPulse / maxPulse / neutralPulse are dead data

`grep -rn "minPulse\|maxPulse\|neutralPulse"` across `services/hardwareService/index.js`,
`python_wrappers/servo_cli.py`, `pca9685_control.py` and `servo_daemon.py` returns **zero hits**. The pulse
mapping is hardcoded in `pca9685_control.py`: standard `SERVO_MIN_US 500` / `SERVO_MAX_US 2400`;
continuous `neutral 1500, min 1000, max 2000`. Confirmed empirically — commanding Dragomir's jaw to 131°
produced 1880 µs, and `500 + 131/180*1900 = 1882.8`.

So every `minPulse`/`maxPulse` value in `data/models/servo_models.json` is decoration. **Decide: wire them
through, or delete them.** As written they read like configuration and they sent two separate
investigations after the wrong cause.

### Calibration nudge starts from a fabricated 90°

`server/calibration/adapters/AbsoluteServoAdapter.js:12` hardcodes `this.currentAngle = 90`, and
`getOrCreateAdapter()` in `server/calibration/router.js` passes the stored position only to
`OpenLoopLinearAdapter`, not to the servo adapter. Observed live: Dragomir's jaw was physically at 131.5°,
a `{"dir":"min","scale":"fine"}` nudge reported *"Nudged min at fine"* and drove it to **88°** — a 43.5°
jump, and below its calibrated minimum of 97°. The smallest, safest-looking control on the page is the one
that hits a mechanical stop. Seed the adapter from the position store, and refuse dir/scale nudge when the
position is unknown.

### Mina: only ONE of three servos responds — channels 8/9/11 are physically dead (measured 2026-08-19)

Your hypothesis was *"Mina has his servos on zero, four, nine, 11."* **Measured answer: no — and it is not
an off-by-one either.** All sixteen channels were swept with an acoustic witness and register readback.
**Channel 4 (Jaw) is the only channel with anything responding on it.** Channels 0–3 and 5–15 are all at
the noise floor, including 9, including 11, and including 12 (where the Eye used to be mapped before
v8.1.5). Full method and per-channel numbers: `docs/hardware/PCA9685-CHANNEL-MAP-MINA.md`.

The software above it is exonerated — the chip accepted every write and the register sampler saw the
correct angles go out on the silent channels, while the jaw on the same chip and the same V+ rail moved
+18 dB. **Nothing in `parts.json` needs remapping.** The fault is on the far side of the header.

Three checks, in order:

1. Follow the **jaw's** harness back to the header — that is your known-good reference — then compare how
   the neck and eye leads sit at channels 8 and 11 (signal row vs V+ row is the classic one).
2. Meter the neck/eye servo **V+ while the jaw is moving.** The jaw proves *a* rail is live; it does not
   prove *theirs* is.
3. **Swap the jaw lead onto channel 8.** If it moves there, channel 8 and all the software is proven good
   and the fault is the neck servo or its wiring. If it does not, the fault is board-side.

Worth knowing: these three parts carried **GPIO pins** (12/16/17/18/19/20/21) until v7.9.6 moved Mina to
PCA9685 channels, and v8.1.5 moved the Eye ch12→ch11. Both were software-only edits that were never
physically confirmed. If the neck and eye were never actually rewired to the PCA9685, that alone explains
the result. GPIO pins were deliberately not swept — blindly driving GPIO outputs risks whatever else is on
them.

### Sir Dragomir has no scenes, so he silently sits out every fleet show

`data/character-4/scenes.json` is an empty array and his `defaultSceneId` is `null`. When you start a
fleet queue loop, `services/orchestrationService.js:602-607` returns
`success:false, "No defaultSceneId configured"` for him — but the aggregate fleet call still reads as
a success, so the only visible symptom is that Dragomir stands there while the other two perform.

Nothing is broken in software. **He needs at least one scene authored**, and then a `defaultSceneId`
set so the fleet loop has something to enqueue.
