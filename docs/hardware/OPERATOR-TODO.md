# Operator hardware to-do — things only hands can fix

Software cannot close any of these. Each one has been isolated to a physical cause with evidence,
so none of them needs re-diagnosing from scratch.

Last updated 2026-08-19 (v10.1.0 session).

---

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

Until the circuits are added, keep `blockAllMotion` on Orlok parts 4 and 5 in `config/hardware-safety.json`.

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
- Dragomir: move the **jaw servo from ch0 → ch1**, then `POST /api/calibration/1/nudge?characterId=4
  {"dir":"max","scale":"med"}`. Turns → ch1 and V+ are fine, **the head servo is dead**. Doesn't turn →
  the fault is the **ch1 channel / harness / power**. Also meter V+ at the ch1 header pin against ch0's.
- Mina: move the **jaw servo from ch4 → ch8**, cycle, then → **ch11**. Treat ch8 + ch11 as ONE suspected
  shared V+/harness branch rather than two coincidental dead servos.
- Orlok: meter the MDD10A output at the GPIO18/13 channel during a jog and compare against the working
  GPIO23/12 channel on the same board; check that motor lead.

**Warning from the existing notes:** on Mina, the eye laser lighting proves nothing about V+ — it is a
3 V relay driven off the signal pin.

---

## 3. Two dead USB capture inputs (will corrupt ear-checks)

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
