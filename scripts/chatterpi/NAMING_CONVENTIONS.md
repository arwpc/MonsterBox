# ChatterPi Animation System - Naming Conventions

## Overview

The ChatterPi audio processing and animation system has been refactored to use more generic, extensible naming conventions that reflect its broader capabilities beyond just jaw animation. This document outlines the new naming structure and provides guidance for future development.

## Renamed Components

### Core System Classes

| Old Name | New Name | Purpose |
|----------|----------|---------|
| `IntegratedAudioJawSystem` | `ChatterPiAnimationSystem` | Main animation control system |
| `ChatterPiWebSocketBridge` | `ChatterPiAudioBridge` | WebSocket audio streaming bridge |
| `ChatterPiConfig` | `ChatterPiAnimationConfig` | System configuration |

### File Names

| Old File | New File | Description |
|----------|----------|-------------|
| `integrated_audio_jaw_system.py` | `chatterpi_animation_system.py` | Main animation system |
| `chatterpi_websocket_bridge.py` | `chatterpi_audio_bridge.py` | Audio bridge server |

### Method Names

| Old Method | New Method | Backward Compatible |
|------------|------------|-------------------|
| `jaw_controller` | `primary_controller` | ❌ |
| `manual_jaw_move()` | `manual_primary_move()` | ✅ (alias maintained) |
| `update_jaw_angles()` | `update_primary_angles()` | ✅ (alias maintained) |

## Design Philosophy

### Generic Naming Benefits

1. **Extensibility**: Names reflect the system's ability to control multiple animatronic components
2. **Scalability**: Easy to add eye movement, head rotation, or other animations
3. **Clarity**: Indicates the system's role in audio processing and animation control
4. **Future-Proofing**: Doesn't limit perceived functionality to jaw-only animation

### Backward Compatibility

- All existing jaw-specific methods maintain backward compatibility through aliases
- Existing API endpoints continue to work unchanged
- Configuration parameters use generic names but maintain jaw-specific defaults

## Architecture Overview

```
ChatterPi Animation System
├── Generic Audio Stream Handler
│   ├── Multiple Audio Sources (Microphone, TTS, Files, WebSocket)
│   ├── Real-time Amplitude Analysis
│   └── Animation Profile Processing
├── Primary Controller (Jaw Servo)
│   ├── GPIO Pin 18
│   ├── Closed Position: 50°
│   └── Open Position: 30°
└── Future Controllers
    ├── Secondary Servo (Eyes)
    ├── Tertiary Servo (Head)
    └── Additional Components
```

## Configuration Structure

### ChatterPiAnimationConfig

```python
@dataclass
class ChatterPiAnimationConfig:
    # Primary animatronic servo (jaw)
    primary_servo_pin: int = 18
    primary_closed_angle: float = 50.0
    primary_open_angle: float = 30.0
    
    # Future expansion
    # secondary_servo_pin: int = 19  # Eyes
    # tertiary_servo_pin: int = 20   # Head
    
    # System configuration
    animation_mode: str = "jaw_primary"  # "jaw_primary", "multi_servo", "full_animatronic"
```

### AudioStreamConfig

```python
@dataclass
class AudioStreamConfig:
    # Animation profiles
    animation_profile: str = "standard"  # "standard", "enhanced_smoothing"
    
    # Audio processing
    volume_threshold: float = 0.005
    smoothing_attack: float = 0.1
    smoothing_release: float = 0.01
    
    # Primary servo configuration
    servo_pin: int = 18
    jaw_closed_angle: float = 50.0  # Primary closed position
    jaw_open_angle: float = 30.0    # Primary open position
```

## Audio Source Types

The system supports multiple audio input sources:

1. **Microphone Input** - Real-time audio capture
2. **Audio Files** - MP3/WAV file playback
3. **Streaming TTS** - TopMediai and other TTS services
4. **WebSocket Streams** - Browser audio output
5. **Generic Streams** - Extensible for future sources

## Animation Profiles

### Standard Profile
- Linear amplitude-to-angle mapping
- Basic smoothing
- Suitable for simple animations

### Enhanced Smoothing Profile
- Exponential curve for natural movement
- Advanced smoothing algorithms
- Voice Activity Detection (VAD) ready
- Real-time optimizations

## Integration Points

### MonsterBox Integration

The ChatterPi Animation System integrates with MonsterBox's broader architecture:

- **Audio Processing**: Unified audio pipeline for streaming and analysis
- **WebSocket Communication**: Consistent with MonsterBox's real-time communication patterns
- **Service Management**: Integrated with existing service manager architecture
- **API Endpoints**: RESTful APIs following MonsterBox conventions

### Future Expansion

The generic naming supports future expansion to:

1. **Multi-Servo Control**: Eyes, head, body movement
2. **Advanced Animation Sequences**: Coordinated multi-component animations
3. **Emotion-Based Animation**: Facial expressions based on AI sentiment
4. **Interactive Behaviors**: Response to environmental sensors
5. **Character-Specific Profiles**: Different animation styles per character

## Development Guidelines

### Adding New Animatronic Components

1. **Configuration**: Add new servo pins to `ChatterPiAnimationConfig`
2. **Controllers**: Create new controller classes following the primary controller pattern
3. **Animation Profiles**: Extend profiles to support multi-component coordination
4. **API Endpoints**: Add RESTful endpoints for new component control

### Naming Conventions

- Use `primary_`, `secondary_`, `tertiary_` prefixes for servo components
- Use `animatronic_` prefix for general animation methods
- Maintain `jaw_` prefix for backward compatibility aliases
- Use descriptive names that indicate the component's role

### Testing

- All new components should include simulation mode for testing
- Maintain backward compatibility tests
- Include integration tests with the audio bridge
- Test with multiple audio sources

## Migration Guide

### For Existing Code

1. **Import Updates**: Update import statements to use new class names
2. **Configuration**: Migrate to `ChatterPiAnimationConfig`
3. **Method Calls**: Optionally update to new method names (old names still work)
4. **File References**: Update any direct file imports

### Example Migration

```python
# Old
from integrated_audio_jaw_system import IntegratedAudioJawSystem, ChatterPiConfig

# New
from chatterpi_animation_system import ChatterPiAnimationSystem, ChatterPiAnimationConfig

# Old
system.manual_jaw_move(45.0)

# New (both work)
system.manual_jaw_move(45.0)        # Backward compatible
system.manual_primary_move(45.0)    # New naming
```

## Conclusion

The new naming conventions provide a solid foundation for the ChatterPi Animation System's future growth while maintaining full backward compatibility. The generic, extensible naming reflects the system's true capabilities as a comprehensive audio-driven animation platform within the MonsterBox ecosystem.
