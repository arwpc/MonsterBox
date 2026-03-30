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
| 1 | Head Servo | servo | PCA9685 ch0, **continuous rotation** (360°), model: Miuzei 25kg continuous |
| 2 | Jaw Servo | servo | PCA9685 ch1, standard (180°), model: Miuzei 25kg |
| 3 | Magic Box Servo | servo | PCA9685 ch3, standard (180°), model: Miuzei 25kg |
| 4 | Sir Dragomir Cam | webcam | /dev/video0 |
| 5 | Webcam Microphone | microphone | Default audio input device |
| 6 | Speaker Sir Dragomir | speaker | Default audio device, volume 85 |

**Total: 6 parts** — 3 servos (1 continuous + 2 standard), 1 webcam, 1 microphone, 1 speaker

## Servo Controller

PCA9685 I2C at address `0x40`, 50 Hz:

| Servo | Channel | Type | Notes |
|-------|---------|------|-------|
| Head Servo | 0 | **Continuous** | Rotation only — cannot hold position |
| Jaw Servo | 1 | Standard | Mouth movement, jaw animation sync |
| Magic Box Servo | 3 | Standard | Special effect mechanism |

## Continuous Servo Gotchas

The Head Servo (ch0) is a **continuous rotation** servo. This is fundamentally different from standard servos:

- **Cannot hold angular position** — pulse width controls speed/direction, not angle
- **1500us = stopped**, <1500us = clockwise, >1500us = counterclockwise
- **Do NOT assign to head tracking** — tracking requires angle-based positioning
- **Do NOT include in angle-based poses** — angle commands are meaningless
- **Use `rotate_continuous_pca` commands** — specify direction, speed (0-100%), and duration
- **Calibration profile uses `continuous-servo` capability** — not `absolute-servo`

## Jaw Animation

- Jaw servo: Part 2 (ch1), standard servo
- Jaw angle range: 0° - 180°
- Jaw animation config: sensitivity 1.5, smoothing 0.4, attack 30ms, release 100ms, quantization 18

## Head Tracking

Head tracking is **disabled** because the head servo is continuous rotation and cannot hold angular positions. The webcam (part 4) is configured as the tracking source, but no pan servo is assigned.

## Poses

4 poses created (excluding continuous head servo):
- Neutral — Jaw 90°, Magic Box 90°
- Mouth Open — Jaw 150°
- Magic Box Open — Magic Box 150°
- All Center — Jaw 90°, Magic Box 90°

## Configuration Files

- `data/character-4/parts.json` — 6 hardware parts
- `data/character-4/poses.json` — Named poses
- `data/character-4/scenes.json` — Animation sequences
- `data/character-4/super-powers.json` — Jaw animation + head tracking config
- `data/character-4/ai-config/tts-config.json` — TTS voice config (Harry - Fierce Warrior)
