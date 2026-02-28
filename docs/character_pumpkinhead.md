# PumpkinHead — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 1 |
| **IP Address** | 192.168.8.150 |
| **Status** | Active |
| **Data Directory** | `data/character-1/` |

PumpkinHead is an animatronic character featuring a wiper motor for head movement, multiple speakers for spatial audio, a webcam/microphone for interaction, and a variety of test hardware used during driver development.

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Wiper Motor | motor | MDD10A driver, GPIO 26 (dir) / 13 (pwm), model: Jeep Wagoneer wiper |
| 3 | Speaker Left | speaker | Default audio device, volume 85 |
| 4 | Speaker Right | speaker | Default audio device, volume 85 |
| 5 | PIR Motion Sensor | motion_sensor | GPIO 16 |
| 6 | PumpkinHead Cam | webcam | /dev/video0, motion tracking enabled |
| 7 | Webcam Microphone | microphone | Default device, 16000 Hz mono |
| 8 | USB Dongle Speaker | speaker | Default audio device, volume 85 |
| 22 | Auto Mic | microphone | PulseAudio device |
| 23 | T Act | linear_actuator | MDD10A, GPIO 19 (dir) / 20 (pwm) |
| 24 | T Act | linear_actuator | MDD10A, GPIO 19 (dir) / 20 (pwm) |
| 25 | T Act | linear_actuator | MDD10A, GPIO 19 (dir) / 20 (pwm) |
| 26 | T Act | linear_actuator | MDD10A, GPIO 19 (dir) / 20 (pwm) |
| 27 | T Act | linear_actuator | MDD10A, GPIO 19 (dir) / 20 (pwm) |
| 28 | T Light | light | GPIO 20 |
| 29 | Auto Mic | microphone | USB C-Media audio device |
| 30 | Auto Mic | microphone | USB C-Media audio device |
| 44 | Test Motor BTS7960 | motor | BTS7960, GPIO 19/21/5/22 |
| 45 | Test Actuator BTS7960 | linear_actuator | BTS7960, GPIO 12/13/5/22 |
| 46 | Auto Mic | microphone | USB C-Media audio device |
| 47 | Auto Mic | microphone | USB C-Media audio device |
| 61 | Test Motor BTS7960 | motor | BTS7960, GPIO 19/21/5/22 |
| 62 | Test Actuator BTS7960 | linear_actuator | BTS7960, GPIO 12/13/5/22 |
| 63 | Servo-Std-PumpkinHead | servo | PCA9685 channel 0, addr 0x40 |
| 64 | Auto Mic | microphone | PulseAudio device |

**Total: 24 parts** — 3 motors, 3 speakers, 7 linear actuators, 1 servo, 1 light, 1 webcam, 1 motion sensor, 7 microphones

!!! note "Test and Duplicate Parts"
    Many parts on PumpkinHead are test/development entries created during hardware driver testing (IDs 23-27 are duplicate linear actuators, IDs 44/61 are duplicate BTS7960 test motors, IDs 29/30/46/47/64 are duplicate auto-mic entries). The primary operational parts are IDs 1, 3-8, 28, and 63.

## Motor Drivers

- **MDD10A** — Wiper Motor (ID 1): direction + PWM control
- **BTS7960** — Test Motor (IDs 44, 61): H-bridge with RPWM/LPWM/R_EN/L_EN pins

## Servo Controller

PCA9685 I2C at address `0x40`:

| Servo | Channel |
|-------|---------|
| Servo-Std-PumpkinHead | 0 |

## Key Features

- **Wiper Motor** — MDD10A-driven head movement (Jeep Wagoneer wiper motor)
- **Multi-Speaker Setup** — Left, Right, and USB dongle speakers for spatial audio
- **PIR Sensor** — Motion detection on GPIO 16
- **Standard Servo** — PCA9685 channel 0 for additional movement
- **Test Hardware** — BTS7960 test motor and actuator entries for driver development

## Configuration Files

- `data/character-1/parts.json` — 24 hardware parts
- `data/character-1/poses.json` — Named poses
- `data/character-1/scenes.json` — Animation sequences
- `data/character-1/super-powers.json` — Special abilities config
- `data/character-1/ai-config/` — ElevenLabs TTS/STT voice settings
