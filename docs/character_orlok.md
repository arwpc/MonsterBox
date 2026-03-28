# Orlok — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 3 |
| **IP Address** | 192.168.8.120 |
| **Status** | Active — Primary development unit |
| **Data Directory** | `data/character-3/` |

Orlok is the primary animatronic character in the MonsterBox system, inspired by the classic Nosferatu vampire. As the most hardware-rich character, Orlok serves as the main development and testing platform.

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Right Arm of Orlok | linear_actuator | MDD10A driver, GPIO 23 (dir) / 12 (pwm), 15s max extend/retract |
| 2 | Left Arm of Manipulation | linear_actuator | MDD10A driver, GPIO 18 (dir) / 13 (pwm), 15s max extend/retract |
| 3 | Bow At The Waist | linear_actuator | BTS7960 driver, GPIO 19 (RPWM) / 21 (LPWM) / 5 (R_EN) / 22 (L_EN) |
| 4 | Elbow | servo | PCA9685 channel 4, model: RDS51150SG 150kg 270° |
| 5 | Forearm Rotation | servo | PCA9685 channel 5, model: Hooyij DS3240MG |
| 6 | Speaker Orlok | speaker | USB C-Media audio device, volume 100 |
| 7 | Microphone Orlok | microphone | Default audio input device |
| 8 | Hand of Azura | light | GPIO 16, ACEIRMC 3V relay (active-HIGH, jumper on H) |
| 9 | Eye of Orlok | webcam | /dev/video1, Arducam B0205 wide-angle 1080p with IR night vision |
| 10 | Jaw of Orlok | servo | PCA9685 channel 3, calibrated: min=63°, mid=83°, max=131° |
| 14 | Sensor for Orlok | motion_sensor | GPIO 27, PIR generic |
| 15 | Head on a Swivel | servo | PCA9685 channel 0, calibrated: center=99°, range=160° |

**Total: 12 parts** — 3 linear actuators, 4 servos, 1 speaker, 1 microphone, 1 light, 1 webcam, 1 motion sensor

## Motor Drivers

- **MDD10A** — Right Arm (ID 1), Left Arm (ID 2): direction + PWM control
- **BTS7960** — Bow At The Waist (ID 3): H-bridge with RPWM/LPWM/R_EN/L_EN pins

## Servo Controller

All servos use **PCA9685** I2C PWM driver at address `0x40`, 50 Hz frequency:

| Servo | Channel | Calibration |
|-------|---------|-------------|
| Elbow | 4 | RDS51150SG 150kg 270° |
| Forearm Rotation | 5 | Hooyij DS3240MG |
| Jaw of Orlok | 3 | min=63°, mid=83°, max=131° |
| Head on a Swivel | 0 | center=99°, range=160° |

## Special Features

### Jaw Animation
Orlok has a configured jaw servo (Part ID 10) for real-time audio-synchronized jaw movement. The jaw uses the Speech preset with bandpass filter (500-2500Hz) and AGC.

### Head Tracking
Head on a Swivel (Part ID 15) can be used for head tracking via the webcam with OpenCV face detection.

### Dual-Arm System
Two independent linear actuators (Right Arm + Left Arm) plus elbow and forearm rotation servos allow complex arm gestures.

## Configuration Files

- `data/character-3/parts.json` — 12 hardware parts
- `data/character-3/poses.json` — Named poses
- `data/character-3/scenes.json` — Animation sequences
- `data/character-3/super-powers.json` — Jaw animation + head tracking config
- `data/character-3/ai-config/` — ElevenLabs TTS/STT voice settings
