# Groundbreaker — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 5 |
| **IP Address** | 192.168.8.200 |
| **Status** | Active |
| **Data Directory** | `data/character-5/` |

Groundbreaker is a ground-emerging animatronic character. It is registered as Character ID 5 in `characters.json` with hardware parts stored in `data/character-5/`.

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Groundbreaker Motor | motor | BTS7960 driver, GPIO 27 (RPWM) / 22 (LPWM) / 17 (R_EN) / 17 (L_EN), 12V Jeep Wagoneer wiper motor |
| 2 | Groundbreaker Webcam | webcam | USB, 1920x1080 @ 30fps |
| 3 | Groundbreaker Speaker | speaker | Default audio device, volume 85 |
| 4 | Groundbreaker Microphone | microphone | USB HHWei device, 16000 Hz mono |

**Total: 4 parts** — 1 motor, 1 webcam, 1 speaker, 1 microphone

## Key Features

- **BTS7960 motor driver** — H-bridge motor control for the ground-breaking mechanism using a 12V Jeep Wagoneer wiper motor
- **Shared R_EN/L_EN** — Both enable pins wired to GPIO 17 (`dual` enable mode)
- **HD Webcam** — 1920x1080 @ 30fps USB camera
- **Audio I/O** — Speaker and USB microphone for TTS/STT interaction

## Setup Documentation

- [Groundbreaker Setup Instructions](characters/GROUNDBREAKER_SETUP_INSTRUCTIONS.md)
- [Groundbreaker Installation Package](characters/GROUNDBREAKER_INSTALLATION_PACKAGE.md)

## Configuration Files

- `data/character-5/parts.json` — 4 hardware parts (legacy directory)
- `data/character-7/parts.json` — Empty (registered ID)
- `data/character-7/poses.json` — Named poses
- `data/character-7/scenes.json` — Animation sequences
