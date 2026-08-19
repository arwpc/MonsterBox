# The part → model → calibration → hardware → API → UX chain

The operator's standing concern, in his words:

> *"All of these low level fixes and changes to parts transcend model all the way out to calibration
> — and out to UX. That has to be consistent, and somebody has to watch it and make sure those
> dependencies aren't switching around and breaking things. It's complicated."*

He is right, and it is worse than it looks. This document is the contract a reviewer checks the chain
against, so the next session inspects it instead of rediscovering it. Everything here was read out of
the code on 2026-08-19, not inferred.

## The six hops

| # | Hop | Owns |
|---|-----|------|
| A | **Part record** — `data/character-{id}/parts.json` | id, name, type, `config.*`, `modelId`, `pin`, `enabled` |
| B | **Model registry** — `data/models/*.json` | per-model defaults, `meta.usbId`, controls schema |
| C | **Calibration** — `data/calibration_profiles.json`, `server/calibration/` | capability kind, bounds, **`capability.invert`**, presets, motion model |
| D | **Hardware execution** — `services/hardwareService/`, `python_wrappers/` | safety limits, angle→pulse, the actual PCA9685 write |
| E | **API** — `routes/api/`, `routes/setup/`, `server/calibration/router.js` | what a client can ask for and what it is told happened |
| F | **UX** — `views/**`, `public/js/**` | what the operator sees, and what they believe they changed |

## The invariants — check these on any change that crosses a hop

### 1. `characterId` must be resolved ONCE per request and threaded all the way to hop D

**This is the invariant the codebase breaks most often, and every break addresses the wrong hardware.**
Part ids are unique only *within* a character. Every character has parts 1–4. Calibration is keyed
`"characterId:partId"`. A part id resolved without a character resolves against the node's mutable
`selectedCharacter`, and on a fleet node that is simply a different animatronic's servo.

Use `resolveCharacter(req)` from `services/characterContext.js`. It is the only supported path, and
`npm run audit:resolver` (a gate step) blocks direct reads of `selectedCharacter` outside its allowlist.
The audit catches *direct reads*; it cannot catch a handler that resolves correctly and then **drops**
the value one call later. That drop is the bug class. Grep for a function that takes `partId` without
an adjacent `characterId` and you have found a candidate.

### 2. `invert` is a CALIBRATION fact, not a part-record field

`grep -rn "invert" data/character-*/parts.json` returns **nothing**. It lives at
`data/calibration_profiles.json` → `"<char>:<part>"` → `capability.invert` (e.g. Mina's Neck, key `2:2`).
**Any code reading `part.config.invert` or `part.invert` gets `undefined` for every part on every
character.** Two separate investigations have already been sent the wrong way by this.

### 3. What the API reports must be what the hardware DID, not what the caller asked for

An inverted servo commanded to 60° drives to 119.6°. Reporting "Moved to 60°" is a lie that costs
hours, because the operator then debugs the servo. `controlPart()` already returns the driven value in
`appliedParams`, plus `safetyAdjustments` and `clamped`. Any endpoint that echoes the request instead
of reporting `appliedParams` is defective. The canonical shape is `describeServoMove()` in
`server/calibration/router.js` — keep every existing field, **add** `drivenAngle`, and say so in the
message when they differ.

### 4. Every motion path must go through `controlPart()`

`controlPart()` is where `blockAllMotion`, `noRetractBelowMin`, the angle window, the duration cap and
power-group serialization are enforced. A route that reaches the Python wrapper directly has silently
opted out of all of it — including the quarantine flag that `CLAUDE.md` says never relaxes.

### 5. A control the operator can change must reach hop D, or it must not exist

The operator's rule: *"it's worse than no functionality at all."* Before adding a field to a setup form,
trace it to a consumer at hop C or D. If nothing reads it, it is a ghost, and a ghost eventually costs
somebody a hardware teardown — exactly what `minPulse`/`maxPulse` did.

### 6. A field present on one character must be present on all of them

Type-level consumers switch on `part.type` and read a `config` key. If Orlok's servos carry a key that
Mina's do not, the same UI control behaves differently per animatronic and only one of them is tested.

## Known shape divergences at hop A (measured across characters 2, 3, 4)

These are live today. They are not all bugs, but each one is a place a consumer can read `undefined`
on one animatronic and a real value on another.

- **`id` is a STRING** in all 21 parts across all three characters — and becomes a **number** downstream
  (`calibration_profiles.json` stores `"partId": 2`; poses.json uses numbers, scenes.json uses strings).
  Compare with `String(partId)`.
- **`config.deviceId` type divergence:** Mina `"video0"`, Dragomir `"video0"`, **Orlok `1`** — string vs
  number for the same field. `python_wrappers/webcam_cli.py` now normalises all spellings; anything else
  reading it must too.
- **`pin` is polymorphic and not in the schema:** `null` for PCA9685 parts, a number for direct-GPIO
  parts — and *within Mina*, light 5 has `"pin": 16` while light 10 has `"pin": null`.
- **`modelId` has two incompatible namespaces:** slugs (`servo_miuzei_mg90s`) and bare epoch-ms strings
  (`"1759010196402"`, on every linear actuator on both Mina and Orlok).
- **`updated` is missing on 7 of 21 parts** — present on all of Orlok's, absent on several of Mina's and
  Dragomir's. Anything sorting by last-modified gets `undefined` for two animatronics.
- **`config.pca9685Frequency`** is on every servo but absent from Mina's PCA9685 *light*, so the
  "pca9685 part" field set is not uniform across types.
- **`markers`** exists on exactly one part in the fleet (Orlok's Jaw). Any UI reading `part.markers`
  renders for one part and nothing else.
- **`parts.schema.json` blesses 14 type spellings; only 7 occur in data.** `continuous-servo`,
  `continuous_servo`, `motor`, `stepper`, `led`, `sensor`, `linear-actuator` are dead vocabulary.
  Note the underscore/hyphen split: part types use `linear_actuator`, scene step types use
  `linear-actuator`.
- **`config.servoType`**, not `type`, is the sole continuous-rotation discriminator that selects the
  1000/1500/2000 µs branch in `pca9685_control.py`. Only Dragomir's Head Servo is `"continuous"`.
- **`enabled` is `true` on all 21 parts fleet-wide**, so the disabled branch of every consumer is
  exercised by zero data.
- **Prose can contradict structure:** Orlok's part 3 description states
  `GPIO 21=RPWM, 19=LPWM ... CORRECTED WIRING` while the structured fields say `rpwmPin: 19`,
  `lpwmPin: 21` — the opposite.

## What a chain reviewer should actually do

Run three passes with **different lenses** — redundant reviewers agree with each other, diverse ones
catch what redundancy cannot:

1. **Rename / drop / default.** Follow one field across adjacent hops. Where does it change name, get
   dropped, or acquire a default at two hops with two different values?
2. **Character independence.** For every part lookup, is a `characterId` present? Is it the *same* one
   used for the safety check, the bounds clamp, the adapter and the hardware call?
3. **Safety truth.** Does what the system *reports* match what it *did*? Is a safety value read from the
   same place it is written?

A finding is only real if it can be pointed at with a file:line on *both* sides of the hop boundary.

## Why hop D can never be closed by software

A PCA9685 is a one-way I²C→PWM driver and a servo is a dumb three-wire device with no back-channel.
**There is no way to ask what is plugged into channel 8.** Channel identity can only be established by
driving a channel and observing motion — see `docs/hardware/PCA9685-CHANNEL-MAP-MINA.md` for the method
and the acoustic-witness traps. USB devices are different: they *can* self-identify, which is what
`meta.usbId` on the model registry is for.
