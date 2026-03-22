# Character Documentation

This directory contains character-specific documentation, configuration guides, and test results for all MonsterBox animatronic characters.

## Current Characters

### Character 1: PumpkinHead
- **[PumpkinHead Ready Guide](PUMPKINHEAD_READY.md)** - Quick reference and system status
- **[Complete Parts List](PUMPKINHEAD_COMPLETE_PARTS_LIST.md)** - Detailed hardware configuration
- **[Hardware Test Results](PUMPKINHEAD_HARDWARE_TEST_RESULTS.md)** - Component testing report
- **[Startup Complete](PUMPKINHEAD_STARTUP_COMPLETE.md)** - System startup and configuration
- **[Character Profile](../character_pumpkinhead.md)** - Character description and design

**Status:** ✅ Operational - All hardware tested and working

**Hardware:**
- Wiper Motor (MDD10A) - GPIO 26 DIR, GPIO 13 PWM
- PIR Motion Sensor - GPIO 16
- Webcam - /dev/video0
- Webcam Microphone - Card 3
- USB Dongle Speaker - Card 4
- Speaker Left/Right

---

### Character 2: Mina
- **[Mina Readiness Report](COFFIN_READINESS_REPORT.md)** - Deployment status
- **[Character Profile](../character_mina.md)** - Character description and design

**Status:** Configured

**Hardware:**
- Linear Actuator
- PIR Sensor
- Audio System

---

### Character 3: Orlok
- **[Orlok Actuator Setup](ORLOK_ACTUATOR_SETUP_COMPLETE.md)** - Linear actuator configuration
- **[Orlok Audio Test Results](ORLOK_AUDIO_TEST_RESULTS.md)** - Audio system testing
- **[Character Profile](../character_orlok.md)** - Character description and design
- **[Deployment Guide](../ORLOK_DEPLOYMENT.md)** - Complete deployment instructions
- **[BTS7960 Wiring](../hardware/ORLOK_BTS7960_WIRING.md)** - Motor driver wiring guide

**Status:** Deployed and operational

**Hardware:**
- BTS7960 Motor Drivers
- Linear Actuators
- Servos
- PIR Sensor
- Webcam
- Audio System

---

### Character 4: Groundbreaker
- **[Installation Complete](GROUNDBREAKER_INSTALLATION_COMPLETE.md)** - Installation summary
- **[Installation Package](GROUNDBREAKER_INSTALLATION_PACKAGE.md)** - Installation guide
- **[Motor Fixes Complete](GROUNDBREAKER_MOTOR_FIXES_COMPLETE.md)** - Motor troubleshooting
- **[Setup Instructions](GROUNDBREAKER_SETUP_INSTRUCTIONS.md)** - Complete setup guide
- **[Fresh Install Guide](../GROUNDBREAKER_FRESH_INSTALL.md)** - Fresh installation procedure

**Status:** Configured

**Hardware:**
- BTS7960 Motor Driver
- Linear Actuator
- Audio System

---

### Character 5: Goblin
- **[Validation Report](GOBLIN_VALIDATION_REPORT.md)** - System validation results
- **[Project Design](../GOBLIN-PROJECT-DESIGN.md)** - Goblin project architecture

**Status:** Validated

**Hardware:**
- Video Display System
- Audio System

---

## Character Configuration

Each character has its own isolated data directory:
- `data/character-1/` - PumpkinHead
- `data/character-2/` - Mina
- `data/character-3/` - Orlok
- `data/character-4/` - Groundbreaker
- `data/character-5/` - Goblin

### Character Data Structure
```
data/character-{id}/
├── parts.json          # Hardware parts configuration
├── ai-config/          # AI agent configuration
│   ├── agent-config.json
│   └── tts-config.json
├── audio/              # Character-specific audio files
├── poses/              # Saved poses
└── scenes/             # Saved scenes
```

## GPIO Pin Assignments

See [GPIO Assignments](../hardware/gpio_assignments.md) for complete pin mapping across all characters.

## Adding a New Character

1. Create character data directory: `data/character-{id}/`
2. Configure parts in `data/character-{id}/parts.json`
3. Set up AI configuration in `data/character-{id}/ai-config/`
4. Create character profile document
5. Test hardware components
6. Document configuration and test results

## Related Documentation

- [Hardware Documentation](../hardware/) - GPIO, wiring, and hardware guides
- [Setup Guides](../setup/) - Installation and configuration
- [Deployment Documentation](../deployment/) - Deployment procedures
- [API Documentation](../api/) - API reference for character control

---

**Last Updated:** October 14, 2025

