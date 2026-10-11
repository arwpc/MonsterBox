# Mina — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 2 |
| **Hostname** | mina |
| **IP Address** | 192.168.8.140 |
| **Status** | Active — fully operational |
| **Data Directory** | `data/character-2/` |
| **ElevenLabs Agent** | agent_8401k3f1dx98e05t94yp6kz4vf8n |
| **TTS Voice** | hkk1bPcdsxSQCLzLFMT2 (The Siren's Voicemail) |

Mina is a coffin-themed vampire animatronic with a motorized door, jaw/neck/eye servos, eye laser, and prop lighting.

## Hardware status (2026-10-11 overnight findings)

Authoritative detail: `docs/hardware/PCA9685-CHANNEL-MAP-MINA.md` (Current section) and
`docs/hardware/OPERATOR-TODO.md`. Measured on her node with her ReSpeaker plus a spectral servo-whine detector and
chip readback. The parts table, PCA9685 table, GPIO table, Super Powers and Poses sections below this one still carry
the 2026-09-25 map and windows; they are **historical where they disagree with this section**.

Channel map in force since the operator's 2026-10-10 20:35 rewire (PCA9685 0x40, 50 Hz): neck ch15, eye ch14, jaw
ch10, laser ch11; coffin door Cytron MDD10A DIR GPIO17 / PWM GPIO18 (`invertDirection: true`, API extend = DIR high);
Burning Rose lamp GPIO16; PIR GPIO26.

| Part | Status | Detail |
|---|---|---|
| Neck (2, ch15) | Works | Free travel about 110-138 raw degrees (silent at 95 and 145-170, hunts at 140). Profile 2:2 = 110-136, centre 123, no invert. The old 48-180 inverted window (2026-08-23) is dead. |
| Eye (3, ch14) | Works | Free about 68-112. Profile 2:3 = 70-110, centre 89. |
| Burning Rose lamp (5), PIR (9), mic/speaker (ReSpeaker XVF3800) | Work | |
| Jaw (1, ch10) | Does NOT work: servo fault | Does not position-follow (whines only when a pulse train first appears after a release; ignores width changes while energized, via API and raw register writes). Uncalibrated. In `config/physical-faults.json`; jaw animation disabled on her node. Needs a servo swap. |
| Coffin door (4) | Does NOT move: motor side | DIR/PWM pins toggle correctly; motor silent on 2 s jogs at 100 % both ways. Suspect MDD10A VIN, common ground, M1 vs M2. |
| Laser (10, ch11) | Does NOT light: power | A PCA output pin cannot power the module; needs the modelled relay (`relay_aceirmc_3v_1ch`) or a MOSFET. |

Both calibration profiles are node-local (`data/calibration_profiles.json` on her node). Her poses were re-aimed into
these windows (commit `626f13a3`). The windows were measured acoustically, not yet confirmed by the operator's eyes.

## Hardware Parts (2026-09-25 map, historical channels)

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Jaw | servo | PCA9685 channel **11** (operator-confirmed at the rig 2026-09-25), addr 0x40, model: Miuzei MG90S |
| 2 | Neck | servo | PCA9685 channel **7** (operator-confirmed at the rig 2026-09-25), addr 0x40, model: Miuzei MG90S |
| 3 | Eye | servo | PCA9685 channel **3** (operator-confirmed at the rig 2026-09-25), addr 0x40, model: Miuzei MG90S |
| 10 | Servo Channel Laser | light | PCA9685 channel **15** (operator-confirmed at the rig 2026-09-25) — full-on/full-off only, no PWM dimming (wired to signal + GND) |
| 4 | Coffin Door | linear_actuator | MDD10A driver, GPIO 5 (dir) / 13 (pwm), 15s max, **invertDirection: true** |
| 5 | Burning Rose | light | GPIO 16, model: generic 12V light |
| 6 | Speaker | speaker | ReSpeaker XVF3800 4-Mic Array (USB), volume 100% |
| 7 | Mina Cam | webcam | /dev/video0, USB (HHWei USB Camera, replaced the failing SONix camera 2026-08-20) |
| 8 | Microphone | microphone | ReSpeaker XVF3800 4-Mic Array (USB) |
| 9 | PIR Motion Sensor | motion_sensor | GPIO 26, PIR generic |

**Total: 10 parts** — 3 servos, 1 PCA9685 light (laser), 1 linear actuator, 1 GPIO light, 1 speaker, 1 webcam, 1 microphone, 1 PIR sensor

## PCA9685 Servo Controller

I2C at address `0x40` (64), 50 Hz:

**Operator-confirmed at the rig, 2026-09-25** (full history and register-readback proof:
`docs/hardware/PCA9685-CHANNEL-MAP-MINA.md`). `data/character-2/parts.json` carries this map
exactly — no further edit needed. A 2026-08-23 note previously stated the 2026-08-22 rewire
plan had never been physically landed; that statement is now superseded, since confirmed at
the rig.

| Part | Channel | Type | Notes |
|------|---------|------|-------|
| Eye | 3 | Standard servo | Eye movement — **uncalibrated** (placeholder, never had Set Min/Max run) |
| Neck | 7 | Standard servo | Head tracking pan — window 48–180°, inverted, centre 132 (measured 2026-08-23, **predates** this channel change; awaits eyes-on re-confirmation) |
| Jaw | 11 | Standard servo | Jaw animation sync — calibrated window 28–84° |
| Laser | 15 | Light, full-on/full-off | Eye laser/LED, wired to the channel's signal + GND only — no PWM dimming |

## GPIO Assignments

| GPIO | Part | Direction |
|------|------|-----------|
| 5 | Coffin Door DIR | Output (MDD10A) |
| 13 | Coffin Door PWM | Output (MDD10A) |
| 16 | Burning Rose | Output (relay) |
| 26 | PIR Motion Sensor | Input |

## Super Powers

- **Jaw Animation** — Servo part 1 (PCA9685 ch11), calibrated window 28°–84°; re-enabled 2026-09-25
- **Head Tracking** — Pan servo part 2 (PCA9685 ch7), webcam part 7, 120° range, person detection mode; the 48–180° inverted window/centre-132 preset predates the 2026-09-25 channel confirmation and awaits eyes-on re-check

## Scenes

| ID | Name | Steps | Description |
|----|------|-------|-------------|
| 1 | Coffin Awakening | 5 | Door opens, TTS speech, jaw+neck move, door closes |
| 2 | Interactive Conversation | 4 | AI conversation with eye movement |
| 3 | Full Performance Spectacular | 8 | Rose light, door, speech, neck sweep, AI questions |
| 100 | Halloween Audio Loop | 2 | Looping audio with delay |

## Poses

Six poses authored 2026-08-31 (jaw + neck only; both inside the measured windows jaw 28–84°,
neck 48–180°). The eye has no calibrated window yet, so no pose uses it.

| ID | Name | Category | Parts Used |
|----|------|----------|------------|
| 1 | Rest | idle | Jaw 32°, Neck 114° |
| 2 | Listening At The Wall | idle | Jaw 32°, Neck 60° |
| 3 | Speaking Softly | expression | Jaw 56°, Neck 114° |
| 4 | Whisper | expression | Jaw 38°, Neck 60° |
| 5 | The Long Breath | expression | Jaw 56°, Neck 168° |
| 6 | Startled | performance | Jaw 78°, Neck 168° |

Note: the neck's "centre" is recorded three ways — calibration preset 132°, the poses' 114°,
and `headTracking.centerDeg` 114° — and the window itself predates the channel change. One
eyes-on measurement on ch7 should settle all three (see `docs/hardware/OPERATOR-TODO.md`).

## Coffin Door Wiring Note

The coffin door actuator's direction pin polarity is **inverted** compared to Orlok's actuators. `invertDirection: true` in parts.json swaps extend/retract at the software layer so API commands match physical movement:
- API "extend" (open) → hardware sends dir=1 (HIGH)
- API "retract" (close) → hardware sends dir=0 (LOW)

## Configuration Files

- `data/character-2/parts.json` — 10 hardware parts
- `data/character-2/poses.json` — 8 named poses
- `data/character-2/scenes.json` — 4 animation sequences
- `data/character-2/super-powers.json` — Jaw animation + head tracking
- `data/character-2/ai-config/tts-config.json` — ElevenLabs v3, Siren voice
- `data/character-2/ai-config/stt-config.json` — Scribe v2 STT with VAD
