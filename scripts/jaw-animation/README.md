# Jaw Animation System

This directory contains the jaw animation system for MonsterBox, which provides real-time audio-servo synchronization for animatronic characters.

## Directory Structure

```
jaw-animation/
├── README.md                 # This file
├── audio/                    # Audio processing modules
│   ├── audioAnalyzer.js     # Real-time audio analysis
│   ├── volumeDetector.js    # Volume detection algorithms
│   └── audioCapture.py      # Python audio capture utilities
├── servo/                    # Servo control modules
│   ├── servoMapper.js       # Volume-to-servo position mapping
│   ├── servoController.js   # Servo control interface
│   └── jawServoControl.py   # Python servo control implementation
├── config/                   # Configuration management
│   ├── jawConfig.js         # Configuration system
│   └── presets.json         # Default configuration presets
├── websocket/               # Real-time communication
│   ├── jawWebSocket.js      # WebSocket server for jaw animation
│   └── jawClient.js         # Client-side WebSocket handler
├── integration/             # MonsterBox integration
│   ├── characterIntegration.js  # Character system integration
│   └── sceneIntegration.js      # Scene system integration
└── test/                    # Testing utilities
    ├── testAudio.js         # Audio system tests
    ├── testServo.js         # Servo system tests
    └── mockData.js          # Mock data for testing
```

## Features

- Real-time audio volume analysis
- Configurable volume-to-servo mapping
- Support for all servo types in MonsterBox
- Character-specific configuration
- Non-blocking audio processing
- WebSocket-based real-time communication
- Integration with existing MonsterBox systems

## Dependencies

### Node.js Dependencies (already in MonsterBox)
- express: Web server framework
- ws: WebSocket support
- winston: Logging

### Python Dependencies (already in MonsterBox)
- numpy: Numerical processing
- pyaudio: Audio capture and processing
- lgpio: GPIO control for servos

## Usage

The jaw animation system integrates seamlessly with MonsterBox's existing character and audio systems. Characters can be configured with jaw servos that automatically animate based on audio playback.

## Configuration

Configuration is managed through the MonsterBox character system, with jaw-specific settings stored per character and servo type.
