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
| Sir Dragomir (4) | 1 Head Servo (neck), continuous | PCA **ch1** | 1645 µs CW / 1348 µs CCW, correct duration, clean release, no creep → **+0.4 dB**. Same chip, same rail, ch0 jaw → **+29 dB** |
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

---

## 4. Sir Dragomir has no scenes

`GET /scenes/api/` on 192.168.8.130 returns `{"scenes":[]}` and his `config/animatronics.json` entry has
no `defaultSceneId`, so `startAllQueueLoops()` skips him and he silently drops out of every fleet queue
loop. The fleet call still reports overall success, so nothing surfaces it.

---

## 5. Software follow-ups these findings created

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
