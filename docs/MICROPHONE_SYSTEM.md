# 🎤 MonsterBox Microphone Management System

## Overview

The MonsterBox Microphone Management System provides comprehensive, professional-grade microphone hardware management with real-time monitoring, advanced testing capabilities, and service separation architecture. This system allows multiple services (STT, Audio Stream, etc.) to consume microphone data independently while maintaining centralized hardware control.

## Architecture

### Core Components

1. **MicrophoneManagerService** - Central coordinator for all microphone operations
2. **MicrophoneService** - Hardware abstraction and configuration management
3. **MicrophoneSTTIntegrationService** - Speech-to-Text consumer service
4. **MicrophoneAudioStreamService** - Audio streaming consumer service
5. **CharacterMicrophoneService** - Character-microphone associations

### Service Separation

The new architecture separates microphone hardware management from service consumption:

```
┌─────────────────────────────────────────────────────────────┐
│                    Consumer Services                        │
├─────────────────┬─────────────────┬─────────────────────────┤
│ STT Integration │ Audio Stream    │ Future Services         │
│ Service         │ Service         │ (Recording, etc.)       │
└─────────────────┴─────────────────┴─────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Microphone Manager Service                     │
│  • Consumer Registration                                    │
│  • Session Management                                       │
│  • Audio Data Distribution                                  │
│  • Service Assignment                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                Microphone Hardware Service                  │
│  • PyAudio Integration                                      │
│  • Device Discovery                                         │
│  • Audio Capture                                            │
│  • WebSocket Communication                                  │
└─────────────────────────────────────────────────────────────┘
```

## Features

### ✅ Complete CRUD Operations
- Create, Read, Update, Delete microphones
- Enhanced error handling and validation
- Automatic cleanup on deletion
- Character association management

### ✅ Real-Time Monitoring
- Live audio level visualization
- Real-time configuration adjustments
- WebSocket-based status updates
- Interactive sensitivity and threshold controls

### ✅ Advanced Management
- Configuration presets (Speech Recognition, High Quality, Noise Reduction, Low Latency)
- Bulk operations for multiple microphones
- Service assignment and management
- Microphone calibration system
- Analytics and performance metrics

### ✅ Professional Testing Suite
- Comprehensive audio quality testing
- Latency analysis with detailed metrics
- Frequency response analysis
- Noise floor and ambient noise testing
- Connection stability monitoring
- Real-time waveform and spectrum visualization

### ✅ Service Independence
- Multiple services can consume same microphone
- Independent service lifecycle management
- Priority-based resource allocation
- Automatic session management

## API Endpoints

### Basic Operations
- `GET /parts/microphone/monitor` - Real-time monitoring interface
- `GET /parts/microphone/test` - Comprehensive testing suite
- `POST /parts/microphone/create` - Create new microphone
- `POST /parts/microphone/:id/update` - Update microphone configuration
- `POST /parts/:id/delete` - Delete microphone with cleanup

### Advanced Management
- `GET /parts/api/microphone/status` - Get all microphone statuses
- `GET /parts/api/microphone/presets` - Get configuration presets
- `POST /parts/api/microphone/:id/preset` - Apply configuration preset
- `POST /parts/api/microphone/:id/calibrate` - Calibrate microphone
- `GET /parts/api/microphone/analytics` - Get usage analytics
- `POST /parts/api/microphone/bulk` - Bulk operations

### Service Management
- `GET /parts/api/microphone/:id/assignments` - Get service assignments
- `POST /parts/api/microphone/:id/assign-service` - Assign service to microphone
- `DELETE /parts/api/microphone/:id/unassign-service/:serviceId` - Unassign service
- `GET /parts/api/microphone/:id/real-time-data` - Get real-time data

## Configuration Presets

### Speech Recognition
- Sample Rate: 16000 Hz
- Channels: 1 (Mono)
- Echo Cancellation: Enabled
- Noise Suppression: Enabled
- Auto Gain Control: Enabled
- Voice Activation: Enabled

### High Quality Recording
- Sample Rate: 44100 Hz
- Channels: 2 (Stereo)
- Echo Cancellation: Disabled
- Noise Suppression: Disabled
- Auto Gain Control: Disabled
- Voice Activation: Disabled

### Noise Reduction
- Sample Rate: 16000 Hz
- Channels: 1 (Mono)
- Enhanced noise suppression
- Higher voice activation threshold
- Optimized for noisy environments

### Low Latency
- Sample Rate: 16000 Hz
- Channels: 1 (Mono)
- Minimal processing
- Reduced buffer size
- Optimized for real-time applications

## Testing Suite

The comprehensive testing suite includes:

### Audio Quality Tests
- Signal-to-Noise Ratio (SNR)
- Dynamic Range measurement
- Total Harmonic Distortion + Noise (THD+N)
- Overall quality scoring

### Latency Analysis
- Input latency measurement
- Processing latency tracking
- Total end-to-end latency
- Jitter analysis

### Frequency Response
- Full spectrum analysis
- Frequency response curve
- Flatness scoring
- EQ recommendations

### Noise Analysis
- Noise floor measurement
- Ambient noise detection
- Noise spectrum visualization
- Quality recommendations

### Stability Testing
- Connection stability monitoring
- Dropout rate measurement
- Long-term reliability testing
- Performance consistency

## Real-Time Features

### Live Monitoring
- Audio level meters with peak detection
- Real-time frequency spectrum visualization
- Waveform display
- Configuration adjustment with immediate feedback

### Interactive Controls
- Sensitivity adjustment slider
- Gain control
- Threshold configuration
- Audio processing toggles (Echo Cancellation, Noise Suppression, Auto Gain)

### WebSocket Integration
- Real-time status updates
- Live audio level streaming
- Configuration change notifications
- Multi-client monitoring support

## Integration

### Character System
- Seamless integration with existing character management
- Character-specific microphone assignments
- Automatic service routing based on character

### Hardware Monitor
- Integration with existing hardware monitoring system
- Unified status reporting
- Centralized management interface

### STT and Audio Services
- Backward compatibility maintained
- Enhanced service separation
- Improved reliability and performance
- Independent service lifecycle management

## Usage Examples

### Basic Microphone Creation
```javascript
const microphoneData = {
    name: 'Main Character Microphone',
    deviceId: 'default',
    sampleRate: 16000,
    channels: 1,
    sensitivity: 1.0,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
};

const microphone = await microphoneService.createMicrophone(microphoneData);
```

### Service Assignment
```javascript
// Assign STT service to microphone
await microphoneManager.assignServiceToMicrophone(
    microphoneId, 
    'stt_integration_service',
    { purpose: 'speech_recognition' }
);

// Assign audio stream service to same microphone
await microphoneManager.assignServiceToMicrophone(
    microphoneId,
    'audio_stream_service', 
    { purpose: 'audio_monitoring' }
);
```

### Real-Time Monitoring
```javascript
// Get real-time microphone status
const status = microphoneService.getMicrophoneStatus(microphoneId);

// Listen for audio level updates
microphoneManager.on('audio_levels', (data) => {
    console.log(`Microphone ${data.microphoneId}: ${data.level}%`);
});
```

## Testing

Run the comprehensive test suite:

```bash
node scripts/test-microphone-system.js
```

This will test all aspects of the microphone system including:
- CRUD operations
- Service separation
- Real-time features
- Advanced management
- System integration

## Future Enhancements

- Multi-channel audio support
- Advanced audio effects processing
- Cloud-based audio analysis
- Machine learning-based audio optimization
- Integration with external audio hardware
- Advanced noise cancellation algorithms

## Troubleshooting

### Common Issues

1. **Microphone not detected**: Check PyAudio installation and device permissions
2. **WebSocket connection failed**: Verify microphone service is running on port 8776
3. **Audio quality issues**: Run calibration and check environment noise levels
4. **Service assignment failed**: Ensure service is registered with microphone manager

### Debug Commands

```bash
# Check microphone service status
curl http://localhost:3000/parts/api/microphone/status

# Test WebSocket connection
wscat -c ws://localhost:8776

# Run system diagnostics
node scripts/test-microphone-system.js
```

---

**MonsterBox Microphone Management System** - Professional-grade audio hardware management for animatronic applications.
