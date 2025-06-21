# Microphone Component Architecture Design

## Overview
Design for a Microphone hardware component that integrates with the MonsterBox character-based system, following existing patterns (like webcam) and connecting to STT and Audio Stream services.

## Architecture Components

### 1. Microphone Hardware Component
Following the existing hardware component pattern:

```javascript
// services/microphoneService.js
class MicrophoneService {
    constructor() {
        this.microphonesPath = path.join(__dirname, '../data/microphones.json');
        this.defaultConfig = {
            enabled: true,
            sensitivity: 1.0,
            sampleRate: 16000,
            channels: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            voiceActivation: false,
            voiceActivationThreshold: 0.1
        };
    }
}
```

### 2. Character-Microphone Association Service
Similar to `characterWebcamService.js`:

```javascript
// services/characterMicrophoneService.js
class CharacterMicrophoneService {
    constructor() {
        this.associationsPath = path.join(__dirname, '../data/character-microphone-associations.json');
    }
    
    async assignMicrophone(characterId, microphoneId) { /* ... */ }
    async removeMicrophone(characterId) { /* ... */ }
    async getMicrophoneByCharacter(characterId) { /* ... */ }
}
```

### 3. Microphone WebSocket Service
Following the hardware service pattern:

```python
# scripts/hardware/microphone_websocket_service.py
class MicrophoneWebSocketService(BaseWebSocketService):
    def __init__(self, port=8776):
        super().__init__("microphone", port)
        self.active_microphones = {}
        self.streaming_tasks = {}
```

### 4. Integration Points

#### STT Integration
- Connect microphone output to existing OpenAI STT integration
- Use existing `openai_stt_integration.js` with microphone input
- Leverage existing STT configuration in `data/ai-config/stt-config.json`

#### Audio Stream Integration
- Connect to existing `GenericAudioStreamHandler`
- Use existing `MicrophoneAdapter` in `audio_source_adapters.py`
- Integrate with ChatterPi Animation System

#### Character System Integration
- Add microphone to available services in `character_service_manager.py`
- Update character requirements mapping
- Add microphone configuration to character audio config

## Data Structures

### Microphone Configuration
```json
{
  "id": 1,
  "name": "USB Microphone",
  "deviceId": "/dev/audio0",
  "type": "usb",
  "status": "active",
  "characterId": null,
  "config": {
    "enabled": true,
    "sensitivity": 1.0,
    "sampleRate": 16000,
    "channels": 1,
    "echoCancellation": true,
    "noiseSuppression": true,
    "autoGainControl": true,
    "voiceActivation": false,
    "voiceActivationThreshold": 0.1
  },
  "capabilities": {
    "sttIntegration": true,
    "audioStreaming": true,
    "realTimeProcessing": true
  },
  "created": "2025-06-21T00:00:00.000Z",
  "lastModified": "2025-06-21T00:00:00.000Z"
}
```

### Character Hardware Requirements Update
```json
{
  "id": 4,
  "name": "Skulltalker",
  "hardware_requirements": {
    "motor": {"enabled": true, "pins": [20, 21]},
    "light": {"enabled": true, "pins": [22, 23]},
    "sensor": {"enabled": true, "pins": [24, 25]},
    "webcam": {"enabled": true},
    "microphone": {"enabled": true, "deviceId": "/dev/audio0"},
    "actuator": {"enabled": true, "pins": [26, 27]}
  }
}
```

## Implementation Plan

### Phase 1: Core Microphone Component
1. Create `MicrophoneService` for CRUD operations
2. Create `CharacterMicrophoneService` for character associations
3. Create microphone data files and configurations

### Phase 2: Hardware Service Integration
1. Create `MicrophoneWebSocketService` 
2. Update `CharacterServiceManager` to include microphone service
3. Add microphone to available services configuration

### Phase 3: STT Integration
1. Connect microphone output to existing STT service
2. Update STT configuration to accept microphone input
3. Implement real-time speech recognition pipeline

### Phase 4: Audio Stream Integration
1. Connect microphone to existing Audio Stream system
2. Update ChatterPi Animation System for microphone input
3. Implement audio monitoring capabilities

### Phase 5: Configuration & Testing
1. Create configuration UI components
2. Implement error handling and graceful degradation
3. Write comprehensive tests

## Key Design Principles

1. **Follow Existing Patterns**: Use webcam component as template
2. **Shared Sound Card**: Leverage existing PyAudio integration
3. **Character-Based**: Optional assignment to any character
4. **Service Integration**: Connect to existing STT and Audio Stream services
5. **Graceful Degradation**: System works without microphone if not available
6. **Configuration Driven**: Flexible per-character microphone settings

## Benefits

1. **Consistency**: Follows established hardware component patterns
2. **Flexibility**: Can be assigned to any character or left unassigned
3. **Integration**: Seamlessly connects to existing STT and Audio Stream systems
4. **Scalability**: Supports multiple microphones for different characters
5. **Maintainability**: Uses existing service architecture and patterns
