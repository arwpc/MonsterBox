# Mina — PCA9685 channel map

## ⚡ CURRENT MAP — rewired by the operator during the rebuild, 2026-08-22

The operator physically re-pinned Mina's harness. This supersedes everything below:

| Part (id) | NEW channel | Old channel (pre-rebuild) |
|---|---|---|
| Eye (3) | **ch3** | 11 |
| Neck (2) | **ch7** | 8 |
| Jaw (1) | **ch11** | 4 |
| Servo Channel Laser / LED (10) | **ch15** | 0 |

Part ids are unchanged, so the jaw's measured 22–91° calibration window still
belongs to part 1. Her node's `parts.json` (and any restored backup of it) still
carries the OLD channels — landing the new map is a rebuild-acceptance step
(`MINA-REBUILD.md` §3a: four override curls). The 2026-08-19 "only ch4 responds"
verdict below described the OLD pin landing and is closed by the rewire; it is
kept as the historical record and as the method for any future sweep.

---

## Historical: map as measured 2026-08-19 (pre-rebuild wiring)

Answers the operator's live question: *"I think Mina has his servos on zero, four,
nine, 11, but I may be wrong."*

**Result: the hypothesis is refuted, and so is the off-by-one theory. Mina has exactly
ONE responding servo, on channel 4 (the Jaw). Channels 0–3 and 5–15 are all silent,
including 9 and 11. This is not a channel-mapping bug; it is a physical/wiring problem.**

Do NOT remap `data/character-2/parts.json`. The current channels are as good as any
other number, because no other channel has anything responding on it.

## Method

One PCA9685 at 0x40 (`i2cdetect -y 1` — single device, no second board).
Each channel was commanded through `python_wrappers/servo_cli.py move_to_pca`, which
bypasses `parts.json` and drives the raw channel, then `release`d.

Two independent witnesses per channel:

1. **Acoustic** — `arecord -D plughw:4,0` (the SONix camera mic, card 4), 48 kHz mono.
   Scored as the **delta between a baseline window and the active window inside the same
   recording**, so ambient drift cancels instead of being mistaken for signal. Reported in
   a 1–8 kHz band, where servo gear whine lives and room rumble does not.
2. **Register** — `python_wrappers/i2c_servo_sampler.py` read the LEDn registers during
   every probe, proving the commanded PWM actually reached the chip.

### Witness validation (this is the step that makes the result trustworthy)

| Control | Band delta | Meaning |
|---|---|---|
| Idle, no command (×2) | **+0.0, +0.0 dB** | clean null — the metric does not invent signal |
| ch4 Jaw, 30° excursion | **+13.9 dB** | known-good servo is unmistakable |
| ch4 Jaw, 60° excursion | **+18.3 dB** | scales with excursion, as a real servo should |

Noise floor across all silent channels: **±0.7 dB**. Against an 18 dB positive control,
the witness has ~25 dB of headroom. A servo moving anywhere in the head would be seen.

**Capture trap — this bit every previous session.** Mina's ALSA `default` routes to the
Unitek Y-247A (card 3, C-Media), whose capture side is dead: it reads **−76.8 dBFS** on
room tone that the camera mic reads at **−49.1 dBFS**. Recording from `default` scores
every channel silent and looks like a successful negative result. **Always address the
camera mic by card number (`plughw:4,0`).**

## Measured map

Excursion 75°↔105° (30°), four oscillations per channel, ch4 held inside its calibrated
22–91° window.

| ch | parts.json says | Band delta | Register confirmed PWM | Verdict |
|----|-----------------|-----------|------------------------|---------|
| 0  | Servo Channel Laser (light, relay) | +0.4 | yes (7 transitions) | silent — relay, not expected to sound |
| 1  | — | −0.2 | yes | silent |
| 2  | — | −0.3 | yes | silent |
| 3  | — | +0.0 | yes | silent |
| **4** | **Jaw (servo)** | **+13.9 / +18.3** | yes | **MOVES — the only live channel** |
| 5  | — | −0.3 | yes | silent |
| 6  | — | −0.2 | yes | silent |
| 7  | — | +0.1 | yes | silent |
| 8  | **Neck (servo)** | −0.2 (also −0.2 at 60°) | yes | silent |
| 9  | — (operator's hypothesis) | +0.2 (also −0.2 at 60°) | yes | **silent — hypothesis refuted** |
| 10 | — | +0.4 | yes | silent |
| 11 | **Eye (servo)** | −0.2 (also −0.4 at 60°) | yes | silent |
| 12 | — (Eye's pre-v8.1.5 channel) | +0.0 | yes | silent |
| 13 | — | +0.0 | yes | silent |
| 14 | — | −0.2 | yes | silent |
| 15 | — | +0.0 | yes | silent |

Candidates 8, 9 and 11 were re-probed at a **60° excursion** to rule out an under-driven
servo. All three stayed at the noise floor while the jaw rose to +18.3 dB at the same
excursion.

## What this narrows the fault down to

The PCA9685 is fine and the software is fine:

- The chip is present, addressed, and accepting writes (`i2cdetect` + register readback).
- Commanded PWM reached **every** channel — the sampler saw 6–7 clean transitions and the
  right angles (59.95° → 119.62°) on channels that produced no sound.
- **V+ is live**, because the jaw on the same chip and the same rail moves.
- The chip's output stage is enabled, for the same reason.

So the remaining causes are all physical, and all on the other side of the header:

1. **Signal wires not landed on the channels `parts.json` names** — most likely. Nothing is
   plugged into 8/9/11, or the leads sit on a different header row (signal vs V+ vs GND).
2. **The neck/eye servos are on a separate power rail that is off.** The jaw proves *a*
   rail is live; it does not prove *their* rail is.
3. **The servos are dead** — the same conclusion already reached for Sir Dragomir's neck.
4. **They are wired to GPIO, not the PCA9685.** History supports this being possible:
   these parts carried GPIO pins 12/16/17/18/19/20/21 before v7.9.6 moved Mina to PCA9685
   channels, and v8.1.5 moved the Eye ch12→ch11. Both were **software-only edits that were
   never physically verified.** GPIO pins were deliberately NOT swept — blindly driving
   GPIO outputs risks whatever else is attached to them.

**A PCA9685 cannot report what is attached to it.** It is a one-way I2C→PWM driver and a
servo has no back-channel, so this is the only method available and the answer must come
from a human with eyes on the harness.

## For the operator — three checks, in order

1. **Follow the jaw's harness back to the header and note which physical row/pin it uses.**
   That is the known-good reference. Then check whether the neck and eye leads are on the
   same kind of row at channels 8 and 11.
2. **Confirm the neck/eye servos share the jaw's V+ rail.** A meter on their V+ pin while
   the jaw is moving settles cause #2 immediately.
3. **Move one known-good servo onto channel 8** (swap the jaw lead over temporarily). If it
   moves on 8, the channel and all the software above it are proven, and the fault is the
   neck servo or its wiring. If it does not, the fault is on the board side of channel 8.

Reproduce any of this with: `/tmp/chsweep/sweep.sh <ch> <lo> <hi> <label>` (see this doc
for the method; the script records, commands, samples registers, and prints the delta).
