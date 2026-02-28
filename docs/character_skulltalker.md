# Skulltalker — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 4 |
| **IP Address** | 192.168.8.130 |
| **Status** | Offline |
| **Data Directory** | `data/character-4/` |

Skulltalker is a skull-based animatronic with head movement, jaw servo, and a "magic box" servo mechanism. Currently offline.

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Head Servo | servo | PCA9685 channel 0 |
| 2 | Jaw Servo | servo | PCA9685 channel 8 |
| 3 | Magic Box Servo | servo | PCA9685 channel 12 |
| 4 | Skulltalker Cam | webcam | /dev/video0 |
| 5 | Webcam Microphone | microphone | Default audio input device |
| 6 | Speaker Skulltalker | speaker | Volume 85 |

**Total: 6 parts** — 3 servos, 1 webcam, 1 microphone, 1 speaker

## Servo Controller

PCA9685 I2C at address `0x40`, 50 Hz:

| Servo | Channel | Notes |
|-------|---------|-------|
| Head Servo | 0 | Head pan/tilt |
| Jaw Servo | 8 | Mouth movement |
| Magic Box Servo | 12 | Special effect mechanism |

## Key Features

- **Three-servo system** — Head, jaw, and magic box for varied animation
- **Jaw servo on channel 8** — Can be configured for jaw animation sync
- **Magic Box** — Unique mechanism on channel 12 for special effects

## Configuration Files

- `data/character-4/parts.json` — 6 hardware parts
- `data/character-4/poses.json` — Named poses
- `data/character-4/scenes.json` — Animation sequences
- `data/character-4/super-powers.json` — Special abilities config
