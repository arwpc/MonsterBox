# Coffin Breaker — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 2 |
| **IP Address** | 192.168.8.140 |
| **Status** | Active |
| **Data Directory** | `data/character-2/` |

Coffin Breaker is a coffin-themed animatronic with a motorized door, jaw servo, neck movement, and eye tracking servos.

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Jaw of Coffin | servo | PCA9685 channel 1, addr 0x40, model: Miuzei MG90S |
| 2 | Neck Movement | servo | PCA9685 channel 0, continuous rotation, model: Miuzei MG90S |
| 3 | Eye Servos | servo | PCA9685 channel 2, model: Miuzei MG90S |
| 4 | Coffin Door | linear_actuator | MDD10A driver, GPIO 5 (dir) / 13 (pwm), 15s max extend/retract |
| 5 | Burning Rose | light | GPIO 16, model: generic 12V light |
| 6 | Speaker Coffin | speaker | Default audio device, volume 85 |
| 7 | Coffin Cam | webcam | /dev/video0, motion tracking enabled |
| 8 | Webcam Microphone | microphone | Default audio input device |
| 9 | PIR Motion Sensor | motion_sensor | GPIO 26, PIR generic |

**Total: 9 parts** — 3 servos, 1 linear actuator, 1 light, 1 speaker, 1 webcam, 1 microphone, 1 PIR sensor

## Servo Controller

PCA9685 I2C at address `0x40`, 50 Hz:

| Servo | Channel | Notes |
|-------|---------|-------|
| Jaw of Coffin | 1 | Standard servo |
| Neck Movement | 0 | Continuous rotation servo |
| Eye Servos | 2 | Standard servo |

## Key Features

- **Coffin Door** — Linear actuator opens and closes the coffin lid
- **Burning Rose** — LED effect on GPIO 16
- **Three-axis movement** — Jaw, neck rotation, and eye servos for expressive animation
- **PIR Sensor** — Motion detection on GPIO 26 triggers scenes

## Configuration Files

- `data/character-2/parts.json` — 9 hardware parts
- `data/character-2/poses.json` — Named poses
- `data/character-2/scenes.json` — Animation sequences
- `data/character-2/super-powers.json` — Special abilities config
- `data/character-2/ai-config/` — ElevenLabs TTS/STT voice settings
