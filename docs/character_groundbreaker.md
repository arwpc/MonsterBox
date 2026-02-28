# Groundbreaker — Character Sheet

## Overview

| Field | Value |
|-------|-------|
| **Character ID** | 7 |
| **IP Address** | 192.168.8.200 |
| **Status** | Active |
| **Data Directory** | `data/character-7/` |

Groundbreaker is a ground-emerging animatronic character. Registered as Character ID 7 in the current `characters.json` registry (legacy data may exist in `data/character-5/`).

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Groundbreaker Motor | motor | BTS7960 driver, GPIO 27/22/17/17 |
| 2 | Groundbreaker Webcam | webcam | USB, 1920x1080 @ 30fps |
| 3 | Groundbreaker Speaker | speaker | Volume 85 |
| 4 | Groundbreaker Microphone | microphone | USB device, 16000 Hz sample rate |

**Total: 4 parts** — 1 motor, 1 webcam, 1 speaker, 1 microphone

## Key Features

- **BTS7960 motor driver** — H-bridge motor control for the ground-breaking mechanism
- **HD Webcam** — 1920x1080 @ 30fps USB camera
- **Audio I/O** — Speaker and USB microphone for TTS/STT interaction

## Setup Documentation

- [Groundbreaker Setup Instructions](characters/GROUNDBREAKER_SETUP_INSTRUCTIONS.md)
- [Groundbreaker Installation Package](characters/GROUNDBREAKER_INSTALLATION_PACKAGE.md)

## Configuration Files

- `data/character-7/parts.json` — 4 hardware parts
- `data/character-7/poses.json` — Named poses
- `data/character-7/scenes.json` — Animation sequences
