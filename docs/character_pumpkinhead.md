# PumpkinHead — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 1 |
| **IP Address** | 192.168.8.150 |
| **Status** | Active |
| **Data Directory** | `data/character-1/` |

PumpkinHead is an animatronic character featuring a wiper motor for head movement, multiple speakers, and a webcam/microphone for interaction.

## Hardware Parts (Key Components)

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Wiper Motor | motor | MDD10A driver, GPIO 26 (dir) / 13 (pwm) |
| 3 | Speaker Left | speaker | Volume 85 |
| 4 | Speaker Right | speaker | Volume 85 |
| 5 | PIR Motion Sensor | motion_sensor | GPIO 16 |
| 6 | PumpkinHead Cam | webcam | /dev/video0 |
| 7 | Webcam Microphone | microphone | 16000 Hz sample rate |
| 8 | USB Dongle Speaker | speaker | Volume 85 |
| 28 | T Light | light | GPIO 20 |
| 63 | Servo-Std-PumpkinHead | servo | PCA9685 channel 0, addr 0x40 |

PumpkinHead also has several test parts (test motors, test actuators, and additional microphone entries) used during hardware development.

## Key Features

- **Wiper Motor** — MDD10A-driven head movement
- **Multi-Speaker Setup** — Left, Right, and USB dongle speakers for spatial audio
- **PIR Sensor** — Motion detection on GPIO 16
- **Standard Servo** — PCA9685 channel 0 for additional movement
- **Test Hardware** — Includes BTS7960 test motor and actuator entries for driver development

## Configuration Files

- `data/character-1/parts.json` — Hardware parts
- `data/character-1/poses.json` — Named poses
- `data/character-1/scenes.json` — Animation sequences
- `data/character-1/super-powers.json` — Special abilities config
- `data/character-1/ai-config/` — ElevenLabs TTS/STT voice settings
