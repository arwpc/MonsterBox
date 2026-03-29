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

## Hardware Parts

| ID | Name | Type | Details |
|----|------|------|---------|
| 1 | Jaw | servo | PCA9685 channel 4, addr 0x40, model: Miuzei MG90S |
| 2 | Neck | servo | PCA9685 channel 8, addr 0x40, model: Miuzei MG90S |
| 3 | Eye | servo | PCA9685 channel 12, addr 0x40, model: Miuzei MG90S |
| 10 | Servo Channel Laser | light | PCA9685 channel 0, addr 0x40 — eye laser toggle |
| 4 | Coffin Door | linear_actuator | MDD10A driver, GPIO 5 (dir) / 13 (pwm), 15s max, **invertDirection: true** |
| 5 | Burning Rose | light | GPIO 16, model: generic 12V light |
| 6 | Speaker | speaker | USB Audio Adapter (Unitek Y-247A), volume 85% |
| 7 | Mina Cam | webcam | /dev/video0, USB (Microdia Streaming Camera) |
| 8 | Webcam Microphone | microphone | USB audio default input |
| 9 | PIR Motion Sensor | motion_sensor | GPIO 26, PIR generic |

**Total: 10 parts** — 3 servos, 1 PCA9685 light (laser), 1 linear actuator, 1 GPIO light, 1 speaker, 1 webcam, 1 microphone, 1 PIR sensor

## PCA9685 Servo Controller

I2C at address `0x40` (64), 50 Hz:

| Part | Channel | Type | Notes |
|------|---------|------|-------|
| Laser | 0 | Light (PWM toggle) | Eye laser on/off |
| Jaw | 4 | Standard servo | Jaw animation sync |
| Neck | 8 | Standard servo | Head tracking pan |
| Eye | 12 | Standard servo | Eye movement |

## GPIO Assignments

| GPIO | Part | Direction |
|------|------|-----------|
| 5 | Coffin Door DIR | Output (MDD10A) |
| 13 | Coffin Door PWM | Output (MDD10A) |
| 16 | Burning Rose | Output (relay) |
| 26 | PIR Motion Sensor | Input |

## Super Powers

- **Jaw Animation** — Servo part 1 (ch4), angles 17°–153°, speech-synced with bandpass filter + AGC
- **Head Tracking** — Pan servo part 2 (ch8), webcam part 7, 120° range, person detection mode

## Scenes

| ID | Name | Steps | Description |
|----|------|-------|-------------|
| 1 | Coffin Awakening | 5 | Door opens, TTS speech, jaw+neck move, door closes |
| 2 | Interactive Conversation | 4 | AI conversation with eye movement |
| 3 | Full Performance Spectacular | 8 | Rose light, door, speech, neck sweep, AI questions |
| 100 | Halloween Audio Loop | 2 | Looping audio with delay |

## Poses

| ID | Name | Category | Parts Used |
|----|------|----------|------------|
| 1 | Neutral | idle | Jaw 90°, Neck 90°, Eye 90° |
| 2 | Glance Left | idle | Neck 60°, Eye 60° |
| 3 | Glance Right | idle | Neck 120°, Eye 120° |
| 4 | Mouth Open | expression | Jaw 150° |
| 5 | Mouth Closed | expression | Jaw 20° |
| 6 | Look Up | idle | Eye 45° |
| 7 | Menacing | performance | Jaw 130°, Neck 70°, Eye 50° |
| 8 | All Center | utility | All servos 90° |

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
