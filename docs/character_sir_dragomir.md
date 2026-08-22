# Sir Dragomir — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 4 |
| **IP Address** | 192.168.8.130 |
| **Hostname** | dragomir |
| **Status** | Online (deployed 2026-03-29) |
| **Data Directory** | `data/character-4/` |
| **TTS Voice** | Harry - Fierce Warrior (`SOYHLrjzK2X1ezoPC6cr`) |

Sir Dragomir is a skull-based animatronic knight with head rotation, jaw servo, and a "magic box" servo mechanism.

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Head Servo | servo | PCA9685 **ch4**, **multi-turn position** (900° / 2.5 turns), model: goBILDA Stingray-2 |
| 2 | Jaw Servo | servo | PCA9685 **ch1** (operator moved it off ch0 at the bench, 2026-08-22 — ch0 suspected dead, pending the nudge test in docs/hardware/BENCH-CHECKLIST.md), standard (180°), model: Miuzei MG90S |
| 3 | Magic Box Servo | servo | PCA9685 ch3, standard (180°), model: Miuzei 25kg |
| 4 | Sir Dragomir Cam | webcam | /dev/video0 |
| 5 | Webcam Microphone | microphone | Default audio input device |
| 6 | Speaker Sir Dragomir | speaker | Default audio device, volume 85 |

**Total: 6 parts** — 3 servos (1 continuous + 2 standard), 1 webcam, 1 microphone, 1 speaker

## Servo Controller

PCA9685 I2C at address `0x40`, 50 Hz:

| Servo | Channel | Type | Notes |
|-------|---------|------|-------|
| Head Servo | 4 | **Multi-turn position** | 900° travel; holds position. Calibrated window is what protects the head cabling |
| Jaw Servo | 0 | Standard | Mouth movement, jaw animation sync |
| Magic Box Servo | 3 | Standard | Special effect mechanism |

## Head Servo — multi-turn, NOT continuous rotation

The Head Servo (**ch4**) is a **goBILDA Stingray-2 gearbox: 900 deg (2.5 turns) of MULTI-TURN
POSITION travel**. It was long recorded here as a continuous-rotation servo, and `parts.json`
carried `servoType: "continuous"` to match. That was wrong, and it was dangerous:

- `hardwareService/index.js` routes a `continuous` servo's ANGLE command to
  `rotate_continuous_pca <ch> <dir> <speed> 1000` — it SPINS for a second instead of moving to a
  position. The log shows 99 such commands historically.
- A full rotation **tears the head cabling**.

Corrected to `servoType: "multi-turn"` (2026-08-20), which routes to the multi-turn positioning
path instead. Consequences:

- It **holds position** and is commanded by angle, like any positional servo.
- Its **calibrated window is the cable guard** — not a timing guess. Keep travel inside it.
- It **can** be used for head tracking and in poses, as an angle target.
- Its travel is 0-900 deg, not 0-180, so never assume the 180 default for this part.

Still to do: a supervised calibration to establish the cable-safe min/max, with eyes on the part.
Until that exists the drive path correctly refuses to move it. Center — Jaw 90°, Magic Box 90°

## Configuration Files

- `data/character-4/parts.json` — 6 hardware parts
- `data/character-4/poses.json` — Named poses
- `data/character-4/scenes.json` — Animation sequences
- `data/character-4/super-powers.json` — Jaw animation + head tracking config
- `data/character-4/ai-config/tts-config.json` — TTS voice config (Harry - Fierce Warrior)
