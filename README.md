# MonsterBox Installation Guide

[Previous content remains the same until the Hardware Requirements section...]

## Testing the Installation

After installation, you can run the automated tests to verify all dependencies are correctly installed and configured:

```bash
# Run all tests (including dependency checks)
sudo npm test

# Run only the RPI dependency checks
sudo npm test tests/rpi-dependencies.test.js
```

The tests will verify:
1. I2C functionality
2. Camera availability and permissions
3. Audio device configuration and volume settings
4. FFmpeg installation and codecs
5. MP3 playback capability
6. GPU memory allocation
7. User permissions and group memberships

### Test Requirements

- Tests must be run as root/sudo due to hardware access requirements
- All hardware components should be connected (camera, I2C devices, audio)
- System should be rebooted after installation before running tests

### Understanding Test Results

The test output will show:
- Success: Component is properly installed and configured
- Failure: Component needs attention (check error message)

Example successful output:
```bash
  RPI Dependencies Check
    should have I2C working
    should have camera available
    should have audio devices configured
    should have audio volume set correctly
    should have ffmpeg installed with required codecs
    should have MP3 playback capability
    should have correct GPU memory allocation
    should have correct permissions for video devices
    should have I2C device node available
    should have correct user groups configured
    should have correct GPU configuration in boot config

  11 passing (3s)
```

### Troubleshooting Failed Tests

1. I2C Test Failures:
```bash
# Check I2C device
ls -l /dev/i2c*
# Check I2C configuration
grep i2c /boot/config.txt
```

2. Camera Test Failures:
```bash
# Check video devices
ls -l /dev/video*
# Check camera module
vcgencmd get_camera
```

3. Audio Test Failures:
```bash
# List audio devices
aplay -l
# Check volume controls
amixer
```

4. GPU Memory Test Failures:
```bash
# Check current GPU memory
vcgencmd get_mem gpu
# Verify config.txt
grep gpu_mem /boot/config.txt
```

5. Permission Test Failures:
```bash
# Check current user groups
groups
# Add missing groups
sudo usermod -a -G video,i2c,gpio,audio $USER
```

## GPIO Control System

The MonsterBox project uses modern GPIO libraries for hardware control:

- Primary GPIO Library: `gpiozero` - Provides high-level interfaces for GPIO control
- PWM Support: `pigpio` - Offers advanced PWM capabilities when needed
- Hardware Support: Compatible with Raspberry Pi 3, 4, and 5

### Key Features

- Standardized GPIO control across all components
- Robust error handling and status reporting
- Flexible PWM and servo control
- JSON-formatted responses for all operations

### Hardware Components

- Sensors: Digital and analog input processing
- Motors: PWM-based speed control
- Servos: Precise angular position control
- Lights: On/off and PWM brightness control
- LEDs: Advanced PWM effects
- Linear Actuators: Position and speed control

### Setup

1. Install required packages:
```bash
pip install -r requirements.txt
```
2. Enable the pigpio daemon (for advanced PWM):
```bash
sudo systemctl enable pigpiod
sudo systemctl start pigpiod
```
[Rest of the previous README content remains the same...]
