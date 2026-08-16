# Garage Checklist — one animatronic at a time

**Version 9.2.1 · fleet state as of 2026-08-16 19:30**

Written to be read on a phone, standing next to the animatronic. Work one character
top to bottom, then move to the next.

Three characters are live: **Orlok**, **Mina**, **Sir Dragomir** — all on 9.2.1, all
confirmed speaking audibly in their own voice. **PumpkinHead, Groundbreaker and
Renfield are in storage** and nothing about them is verified.

---

## Read this first — safety

- **Never drive Orlok parts 2, 3, 4 or 5.** Parts 4 (Elbow) and 5 (Forearm) share one
  fuse and want *mutually exclusive voltages* — part 4 needs 9–12.6 V, part 5 needs
  4.8–7.4 V. Whatever that rail carries, one of them is wrong, and a stalling 150 kg
  servo is what keeps popping the fuse.
- **Part 3 (Bow) may move the opposite way to what you ask.** Its `parts.json` pins and
  its own description contradict each other, and it already sits at its mechanical
  minimum. It is blocked in software on purpose.
- **API success is not proof of motion.** There is no encoder feedback anywhere in this
  system. `success: true` means the I²C write returned. Confirm with your eyes.
- One wrapper, `motor_cli.py`, does **not** yet enforce safety limits. Every other
  wrapper now refuses a blocked part. Don't call that one directly.

---

## Things that changed today — expect these on every character

Tick once, fleet-wide, so they don't read as faults:

- [ ] **Parts that used to say "calibrated" now say they need calibration.** The
      calibration page was returning hardcoded `true` with no persistence at all. It
      now tells the truth. Nothing got worse — you are seeing reality for the first time.
- [ ] **Poses land slightly differently each run.** New per-pose jitter, bounded inside
      the calibrated window. A part with only a placeholder calibration gets *no* jitter.
- [ ] **Motion has real easing and real duration.** It used to move at whatever speed the
      servo managed on its own.
- [ ] **Poses that depend on dead parts now show as blocked** and are excluded from idle.
- [ ] **New `/schedule` page** under Activities → Scheduled Events. Shows when each
      scheduled event *actually next fires* in plain language.
- [ ] **The head-tracking status badge now appears.** It carried an inline `display:none`
      that could never be undone — it has likely never been visible before.

---

## Orlok — character 3 · 192.168.8.120 · this box

The most capable and the most damaged. Audio confirmed: 24.4 dB rise, 100% word recall,
canonical voice.

### Fix (needs your hands)

- [ ] **Measure the ch4/ch5 rail.** This is the single highest-value physical check on the
      whole fleet. Measure voltage at the ch4/ch5 servo connectors with the fuse in, then
      check continuity across the fuse.
      *Why it matters:* it gates part 5, which may be perfectly fine and has never been
      ruled out. Right now "dead servo" and "dead rail" are indistinguishable.
- [ ] **Part 2 (Left Arm) — swap onto part 1's known-good MDD10A channel.** PWM is verified
      present on GPIO 13 and identical to working GPIO 12, but there is zero motion at both
      50% and 95% duty. If it moves on part 1's channel → the driver channel is dead. If it
      still doesn't → harness, motor, or actuator.
- [ ] **Part 3 (Bow) — trace the wires.** Make `parts.json` and the part description agree
      about which pin is RPWM. Then drop `blockAllMotion` in `config/hardware-safety.json`
      but keep `noRetractBelowMin`.
- [ ] **Part 4 (Elbow) — confirmed dead.** Leave quarantined until the rail question is
      settled. Its 45–135 bounds are residue left by an old unit test, not a calibration.

### Verify (questionable)

- [ ] **Jaw (part 10) has only a placeholder calibration.** Run a real calibration pass on
      `/setup/calibration` with the jaw physically watched. Until then it gets no jitter,
      deliberately — there is no measured number proving an offset is safe.
- [ ] **Jaw depth during speech.** Perceptual mapping was fixed in 9.0; if opening still
      looks shallow, raise `sensitivity` on `/setup/jaw-animation` while watching it, until
      full travel is used without slamming the stops.
- [ ] **The 34-pose library has never been watched on hardware.** Expect any elbow component
      to do nothing. Head/lamp/actuator-1 poses are the trustworthy ones.
- [ ] **Scene 106 references part 11, which does not exist** on this character (his servos
      are 4, 5, 10, 15). Looks like it should be 15 — but it is your show data, so you
      decide. Fix in the Animation Studio.
- [ ] **ch15 held a pulse with no part mapped to it.** A startup reconcile now reports this.
      Worth a look at whether anything is physically attached there.

### Test the new functionality

- [ ] **Test button** on parts 10 (jaw), 15 (head), 8 (lamp), 1 (actuator, short move) —
      each should respond *physically*, not just return success.
- [ ] **Run a head/lamp pose twice.** It should land in a slightly different spot each time,
      and the movement should look eased rather than stepped.
- [ ] **Try to add a quarantined part in the Pose Editor.** It should refuse and show you
      the block reason verbatim.
- [ ] **Speak a line.** Jaw should animate with it, in his own voice.
- [ ] **Watch for sluggishness.** Motion now steps at ~12 Hz with a full safety round trip
      per frame, on SD-card-backed hardware. If a move feels slow or stuttery, say so —
      that is the one place today's work could plausibly hurt performance.

---

## Mina — character 2 · 192.168.8.140

Audio confirmed: 23.1 dB rise, 80% recall, canonical voice. Her voice was never wrong.

### Fix (needs your hands)

- [ ] **Neck (ch8) and Eye (ch11) do not move.** PWM is valid at the register level and the
      command path is identical to the working ch4 jaw. Narrowed to: dead servos, broken
      signal leads, loose header pins, or burned PCA9685 outputs.
      **Wire-swap diagnostic, no multimeter needed:** unplug the known-good Jaw servo from
      ch4, plug the Neck servo into ch4, cycle it.
      - Moves → ch8 output/wiring is dead. Remap Neck to a good channel in
        `data/character-2/parts.json` (same pattern as the v8.1.5 Eye ch12→ch11 fix).
      - Still doesn't → the servo itself is dead.
      Repeat for the Eye servo to isolate ch11.
      *Note:* the eye lights being on does **not** prove V+ is alive — the laser is a 3 V
      relay driven off the signal pin, not V+.

### Verify (questionable)

- [ ] **Jaw calibration is an auto-default 85–95** — a 10° window on a servo with far more
      travel. Re-calibrate on `/setup/calibration`; it flows through to jaw animation
      automatically.
- [ ] **Her speaker sits at 1.50, the top of the range.** She has no headroom left. If she
      is ever too quiet outdoors, the fix has to be the rig, not the slider.
- [ ] **Loud cues may clip.** Her level was tuned on speech, which peaks around −7.5 dBFS.
      Library files peak at 0.0 dBFS. Play one loud cue and listen for distortion.
- [ ] Confirm working, unchanged: ch0 Laser (via 3 V relay), ch4 Jaw, Coffin Door, Burning
      Rose (GPIO 16).

### Test the new functionality

- [ ] **Test button** on the jaw and the laser.
- [ ] **Speak a line** — jaw animates, her own voice.
- [ ] **Check the calibration page** now honestly reports which of her parts are uncalibrated.
- [ ] She has **no gesture vocabulary** and no pose library of her own yet — that needs the
      calibration pass above first. Inventing bounds for unmeasured hardware is how a part
      ends up looking calibrated when it never was.

---

## Sir Dragomir — character 4 · 192.168.8.130

The healthy one. No open hardware issues. Audio confirmed: 20.0 dB rise, 100% recall,
canonical voice.

### Fix

- [ ] Nothing known. This is the character to trust when you need a control.

### Verify (questionable)

- [ ] **He read FAINT on the first ear-check and AUDIBLE on the re-run.** The difference was
      his *microphone* floor (−26 dB vs −42.6 dB), not his speaker — cast level and word
      recall were identical. Something made noise near his mic for those 13 seconds. Worth
      knowing what, since it will also affect anything he tries to *listen* to.
      **Do not raise his volume in response to a FAINT reading** — he compresses above 0.85
      and word recall actually *falls* (94% → 69%).
- [ ] **His USB Audio Device mic jack reads a dead-flat −79 dB floor** — almost certainly
      empty. Harmless, but it is why the ear-check must record every capture device.
- [ ] **He is the loud one** — he carries a room at 0.55 where the other two need 1.30–1.50.
      Do not set a single fleet-wide volume.
- [ ] **Re-check his superpowers** (jaw, head tracking, lurk, motion). A browser test once
      fired a real fleet emergency stop and silently switched his jaw animation off.

### Test the new functionality

- [ ] **Test button** on jaw (ch0), Magic Box (ch8), Head (ch4 continuous).
- [ ] **Speak a line** — he is your best check that speech and jaw sync are healthy.
- [ ] **Play an audio-library file, then speak.** Library playback used to be stuck at
      whatever volume was requested *first* after a restart — that cache bug is fixed, and he
      is the character it was reported on. Both should now sound correct at their own levels.

---

## In storage — PumpkinHead (1), Groundbreaker (5), Renfield (6)

Nothing below is verified. Do not trust any claim about these three until the Pi is
powered and on the network.

- [ ] **All three need a deploy and an ear-check** the moment they are up:
      `./scripts/deploy-to-animatronic.sh <id> <ip>` then
      `node scripts/fleet-audio/earcheck.mjs --nodes <id>`.
      Confirm the version afterwards with `curl -sk https://<node>:3000/health` — a deploy
      that looked fine has silently left a node on an old build before.
- [ ] **Renfield's shake motor is wired but never driven.** RPWM 27, LPWM 22, R_EN 17,
      L_EN 23. His `parts.json` originally declared *both* enable lines on GPIO 17, which
      would have failed at pin setup with `GPIO_BUSY` — the motor would never have turned.
      Fixed in data only. Smallest safe motion first.
- [ ] **Renfield has no IP by design** (`ip: null`), so he fails fast until his Pi boots and
      mDNS supplies the real address. Do not invent an address for him.
- [ ] **PumpkinHead part 1 has a corrupted description** ("Test updated via comprehensive
      tests"). Left alone deliberately — writing the real one would be a guess until someone
      can confirm what it drives.
- [ ] **Groundbreaker's id was wrong** and is now reconciled to 5 everywhere. That mismatch
      is why he used to speak in the wrong voice.
- [ ] **The full six-node Dusk Ceremony leaves a 15-second silent hole** with these three
      absent, because their lines fall consecutively. Use
      `moments/dusk-ceremony-3node.json` until they are erected.

---

## Calibration — every part, once and for all

**Do this on `/setup/calibration`.** That page writes `data/calibration_profiles.json`,
which is the canonical store read by jaw animation, head tracking, gestures, poses,
scene execution and motion tracking. Calibrating there makes it stick everywhere that
matters.

*(There is a second, legacy `data/character-N/servo_calibrations.json`. It is only read
by the direct-GPIO servo path, and all three live characters run their servos through
the PCA9685 instead — so it does not undermine this. Mina's and Dragomir's legacy files
are empty anyway. Noted so you don't discover it later and wonder.)*

**Ground rules**

- Calibrate **after** fixing dead hardware, not before. A calibration of a servo that
  isn't moving records nothing real.
- **These part types need NO calibration:** lights, speakers, microphones, webcams,
  motion sensors. Only servos and linear actuators do.
- **Absolute servos** want min/max angle. **Continuous servos** are different — they have
  no position, so they calibrate for speed/direction, not angles. Don't try to set angle
  bounds on one.
- Set bounds to the **usable safe range**, not the mechanical extreme. Leave margin.
- The page now tells the truth about what is and isn't calibrated. A part reading
  "placeholder" has a fake 0–180 guess, not a measurement.

### Current state — measured just now

**Mina and Sir Dragomir have NO calibration profiles at all.** Every servo and actuator
on both is uncalibrated. That is the bulk of the work.

#### Orlok (char 3)

| Part | Type | Current profile | Action |
|---|---|---|---|
| 1 Right Arm | actuator | `minP 0 / maxP 1` | Re-do — that's a normalized default, not measured end positions |
| 2 Left Arm | actuator | placeholder | **Fix first** — dead |
| 3 Bow | actuator | placeholder | **Trace wiring first** — quarantined |
| 4 Elbow | servo | `45–135` | **Test residue, not a calibration.** Only after the rail question |
| 5 Forearm | servo | placeholder 0–180 | Gated on the rail |
| 10 Jaw | servo | placeholder 0–180 | ⭐ **Highest value — calibrate this one first** |
| 15 Head | servo | `60–180` | ⚠️ Re-do — profile says max 180 but safety clamps to 120. Set the real number |
| 14 PIR sensor | sensor | `12–180` | Spurious — a motion sensor has no angle bounds. Ignore |

#### Mina (char 2) — nothing calibrated

| Part | Type | Action |
|---|---|---|
| 1 Jaw | servo | ⭐ Calibrate — currently an auto-default 10° window (85–95) |
| 2 Neck | servo | **Fix first** — does not move (ch8) |
| 3 Eye | servo | **Fix first** — does not move (ch11) |
| 4 Coffin Door | actuator | Calibrate min/max position |

#### Sir Dragomir (char 4) — nothing calibrated

| Part | Type | Action |
|---|---|---|
| 1 Head Servo | servo | ⚠️ **Confirm continuous vs absolute first** — recorded elsewhere as continuous (ch4). If continuous, do NOT set angle bounds |
| 2 Jaw Servo | servo | ⭐ Calibrate |
| 3 Magic Box Servo | servo | Calibrate |

### Suggested order

1. **Sir Dragomir** — he's healthy, so nothing fights you. Three parts. Gets you a
   complete, known-good character and teaches you the flow.
2. **Orlok's jaw (10) and head (15)** — the two parts you'll notice most, both currently
   wrong.
3. **Mina's jaw (1) and coffin door (4)** — everything she can do today.
4. **Everything gated on repairs** — Orlok 1/2/3/4/5, Mina 2/3 — as each repair lands.

### After each part

- [ ] Re-open `/setup/calibration` and confirm it now reads calibrated, not placeholder.
- [ ] Move the part through a pose or the Test button and watch it respect the new range.
- [ ] For the jaw specifically: speak a line and watch the travel. Jaw depth is driven off
      these bounds, so a good calibration is what makes speech look right.

---

## Before the show

- [ ] **Drop a music track at `data/audio-library/dusk-theme.mp3`.** It does not exist, so
      both music steps in the Dusk Ceremony are silent no-ops right now. Only you can
      choose this.
- [ ] **Re-check every node's volume after any reboot.** `wpctl` volume is node-local
      runtime state — it is not in git, not deployed, and does not survive a reboot.
      Canonical values are in `scripts/yard-theater/speaker-volumes.json`.
- [ ] **Scheduled events fire on 31 October.** Confirm on `/schedule` — it will tell you
      how many days away that is.
