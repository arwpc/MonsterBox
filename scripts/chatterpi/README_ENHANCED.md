# Enhanced ChatterPi Audio-to-Servo System

## 🚀 Overview

The Enhanced ChatterPi system has been completely refactored with **SCIENCE!** to provide realistic lip-sync animation using advanced audio processing techniques. This system implements smoothed audio envelopes, voice activity detection, and hardware-timed PWM control for superior jaw animation performance.

## ✨ Key Features

### 1. **Smoothed Amplitude Envelope**
- **Exponential Moving Average**: Uses separate fast attack (0.1) and slow release (0.01) coefficients
- **Jitter Reduction**: Only updates servo when amplitude changes significantly
- **Linear Mapping**: Maps smoothed values between configurable servo min/max positions

### 2. **Voice Activity Detection (VAD)**
- **WebRTC VAD Integration**: Uses `@echogarden/fvad-wasm` for professional voice detection
- **Fallback Detection**: Amplitude-based VAD when WebRTC is unavailable
- **Silence Handling**: Automatically closes jaw after configurable silence timeout (500ms default)

### 3. **Hardware-Timed PWM**
- **pigpio Integration**: Uses `pigpio` library for precise 50Hz servo control
- **Jitter Prevention**: Only writes when target position changes by > 1° threshold
- **Pulse Width Control**: Direct microsecond-level servo control

### 4. **Configurable Parameters**
All tuning parameters are exposed in both backend and frontend:

```python
# Audio Processing
SMOOTHING_ATTACK = 0.1      # Fast attack coefficient
SMOOTHING_RELEASE = 0.01    # Slow release coefficient
SILENCE_THRESHOLD = 0.005   # Amplitude threshold for silence
SILENCE_TIMEOUT = 500       # Milliseconds before closing jaw

# Servo Control
SERVO_MIN = 50.0           # Closed position (degrees)
SERVO_MAX = 30.0           # Open position (degrees)
SERVO_STEP = 1.0           # Minimum movement threshold
```

## 📁 File Structure

```
scripts/chatterpi/
├── audio_processing.py              # Enhanced audio processing with smoothed envelopes
├── servo_controller.py              # Hardware-timed PWM servo controller
├── enhanced_audio_jaw_animator.py   # Main integrated system
├── vad_processor.js                 # Node.js VAD processor
├── start_enhanced_chatterpi.py      # System startup script
├── test_enhanced_system.py          # Comprehensive test suite
└── README_ENHANCED.md               # This file
```

## 🛠 Installation

### Prerequisites
```bash
# Install Python dependencies
pip3 install pigpio pyaudio numpy

# Install Node.js dependencies (optional for WebRTC VAD)
npm install @echogarden/fvad-wasm

# Start pigpio daemon (required for servo control)
sudo pigpiod
```

### Quick Start
```bash
# Test the enhanced system
cd scripts/chatterpi
python3 test_enhanced_system.py

# Start the enhanced ChatterPi system
sudo python3 start_enhanced_chatterpi.py
```

## 🎛 Web Interface

The enhanced system includes advanced configuration controls in the ChatterPi chat interface:

### Basic Controls
- **Servo Selection**: Choose GPIO pin (default: 18)
- **Voice Selection**: Character voice options
- **Jaw Calibration**: Set open/closed positions with sliders

### Advanced Settings (Expandable Panel)
- **Smoothing Parameters**: Attack/Release coefficients
- **Voice Activity Detection**: Silence threshold and timeout
- **Servo Control**: Step threshold and update rate
- **Configuration Management**: Save/load/reset settings

## 🔧 Configuration

### Audio Processing Config
```python
audio_config = AudioConfig()
audio_config.SMOOTHING_ATTACK = 0.1      # Fast response to increasing amplitude
audio_config.SMOOTHING_RELEASE = 0.01    # Slow response to decreasing amplitude
audio_config.SILENCE_THRESHOLD = 0.005   # Voice detection threshold
audio_config.SILENCE_TIMEOUT = 500       # Silence timeout in milliseconds
```

### Servo Control Config
```python
servo_config = ServoConfig()
servo_config.pin = 18                    # GPIO pin
servo_config.min_angle = 30.0            # Open position (jaw wide)
servo_config.max_angle = 50.0            # Closed position (jaw shut)
servo_config.step_threshold = 1.0        # Minimum movement threshold
```

## 🧪 Testing

The system includes comprehensive tests:

```bash
# Run all tests
python3 test_enhanced_system.py

# Test individual components
python3 -c "from audio_processing import AudioProcessor; print('Audio OK')"
python3 -c "from servo_controller import ServoController; print('Servo OK')"
```

## 📊 Performance Monitoring

The system provides real-time statistics:

- **Audio Processing**: Frames per second, voice activity ratio
- **Servo Control**: Commands executed, filter rate, movement tracking
- **System Health**: Buffer overruns, processing errors

## 🔌 API Endpoints

### Configuration Management
```bash
# Update configuration
POST /api/chatterpi/jaw/config
{
  "audio": {
    "smoothing_attack": 0.15,
    "smoothing_release": 0.02,
    "silence_threshold": 0.008,
    "silence_timeout": 600
  },
  "servo": {
    "step_threshold": 0.8
  }
}

# Save configuration
POST /api/chatterpi/jaw/save-config

# Load configuration
GET /api/chatterpi/jaw/load-config
```

## 🎯 Usage Examples

### Basic Usage
```python
from enhanced_audio_jaw_animator import EnhancedAudioJawAnimator

# Create and start animator
animator = EnhancedAudioJawAnimator()
animator.start_animation()

# System runs until stopped
# Speak into microphone to see jaw movement
```

### Custom Configuration
```python
config = AnimatorConfig()
config.audio_config.SMOOTHING_ATTACK = 0.2
config.audio_config.SILENCE_TIMEOUT = 750
config.servo_config.step_threshold = 0.5

animator = EnhancedAudioJawAnimator(config)
```

## 🔍 Troubleshooting

### Common Issues

1. **"pigpio not available"**
   - Install: `pip3 install pigpio`
   - Start daemon: `sudo pigpiod`
   - Run as root: `sudo python3 script.py`

2. **"Audio device not found"**
   - Check microphone permissions
   - Install: `pip3 install pyaudio`
   - Test: `python3 -c "import pyaudio; print('Audio OK')"`

3. **"Servo not moving"**
   - Check GPIO wiring (default: pin 18)
   - Verify servo power supply
   - Check pigpio daemon status

### Debug Mode
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 🎨 Customization

### Audio Processing Curves
Modify the amplitude-to-servo mapping in `audio_processing.py`:

```python
def _amplitude_to_servo_position(self, amplitude, voice_active):
    # Custom curve: square root for gentler response
    curved_amplitude = np.sqrt(normalized)
    
    # Or exponential for more dramatic response
    # curved_amplitude = normalized ** 2
```

### Servo Movement Patterns
Customize movement curves in `servo_controller.py`:

```python
# Add custom movement curves
class MovementCurve(Enum):
    CUSTOM_BOUNCE = "custom_bounce"
    CUSTOM_ELASTIC = "custom_elastic"
```

## 📈 Performance Optimization

### For Real-time Performance
- Use update rates 30-60 Hz
- Set appropriate step thresholds (0.5-2.0°)
- Monitor buffer overruns in statistics

### For Smooth Animation
- Lower attack coefficients (0.05-0.2)
- Higher release coefficients (0.01-0.05)
- Adjust silence timeout for character personality

## 🤝 Integration

The enhanced system maintains compatibility with existing ChatterPi infrastructure while providing significant improvements in audio processing and servo control precision.

### Existing Package Compatibility
- All existing Node.js packages preserved
- Existing architecture maintained
- Only audio processing and servo control revised

## 📝 Version History

- **v2.0.0**: Enhanced system with smoothed envelopes, VAD, and hardware-timed PWM
- **v1.x**: Original ChatterPi system

---

**Status**: ✅ **COMPLETE** - Enhanced ChatterPi system with SCIENCE-based improvements ready for deployment!
