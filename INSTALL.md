# MonsterBox 4.0 Installation Guide

Complete installation guide for fresh Raspberry Pi 4B deployments.

## 🎯 Quick Start (Fresh Raspberry Pi 4B)

For a brand new Raspberry Pi 4B with fresh Raspberry Pi OS:

```bash
# 1. Clone MonsterBox
git clone <your-monsterbox-repo>
cd MonsterBox

# 2. Run system installation (installs all dependencies)
sudo bash install.sh

# 3. Reboot (required for hardware changes)
sudo reboot

# 4. Set up MonsterBox application
npm run setup

# 5. Start MonsterBox
npm start
```

Access MonsterBox at: `http://your-pi-ip:3000`

## 📋 Prerequisites

- **Raspberry Pi 4B** with 4GB+ RAM recommended
- **Raspberry Pi OS** (Bookworm or Bullseye)
- **Internet connection** for downloading dependencies
- **SD Card** with 32GB+ space recommended

## 🔧 Detailed Installation Steps

### Step 1: System Installation

The `install.sh` script installs all system dependencies:

```bash
sudo bash install.sh
```

This script installs:
- ✅ Node.js 18+ and npm
- ✅ Python 3 and pip
- ✅ Hardware control libraries (GPIO, I2C, SPI)
- ✅ Audio system (ALSA, PipeWire, PulseAudio)
- ✅ Camera support (v4l-utils, OpenCV)
- ✅ MJPG-Streamer for video streaming
- ✅ System services and permissions

**⚠️ Reboot Required:** After running `install.sh`, reboot your Pi:
```bash
sudo reboot
```

### Step 2: Application Setup

After reboot, set up the MonsterBox application:

```bash
npm run setup
```

This command:
- ✅ Installs Node.js dependencies
- ✅ Installs Python dependencies
- ✅ Sets up hardware permissions
- ✅ Tests hardware interfaces
- ✅ Configures services
- ✅ Creates environment file

### Step 3: System Verification

Check that everything is working:

```bash
npm run check
```

This runs comprehensive system diagnostics and shows:
- System information
- Hardware interface status
- Service status
- Python package availability
- Hardware communication tests

## 🎥 Webcam Setup

For camera functionality:

```bash
npm run setup:webcam
```

This script:
- ✅ Enables camera interface
- ✅ Configures GPU memory
- ✅ Installs camera packages
- ✅ Sets up MJPG-Streamer
- ✅ Tests camera capture

## 🐍 Python Dependencies

To install/update Python packages:

```bash
npm run install:python
```

Or manually:
```bash
python3 -m pip install --user -r utils/requirements.txt
```

## 🚀 Starting MonsterBox

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Auto-Start Service
```bash
# Enable auto-start on boot
sudo systemctl enable monsterbox
sudo systemctl start monsterbox

# Check status
sudo systemctl status monsterbox
```

## 🔍 Troubleshooting

### Common Issues

**1. Permission Denied Errors**
```bash
# Fix user groups
sudo usermod -a -G gpio,video,audio,i2c,spi,dialout,plugdev $USER
# Logout and login again
```

**2. Hardware Not Detected**
```bash
# Check hardware interfaces
ls -la /dev/gpio* /dev/i2c* /dev/video*

# Test I2C
i2cdetect -y 1

# Test camera
fswebcam -d /dev/video0 --no-banner test.jpg
```

**3. Services Not Running**
```bash
# Check service status
sudo systemctl status pigpiod mjpg-streamer

# Restart services
sudo systemctl restart pigpiod mjpg-streamer
```

**4. Python Import Errors**
```bash
# Reinstall Python dependencies
python3 -m pip install --user --upgrade -r utils/requirements.txt

# Check Python path
python3 -c "import sys; print(sys.path)"
```

### Hardware-Specific Issues

**PCA9685 Servo Controller**
```bash
# Check I2C connection
i2cdetect -y 1
# Should show device at 0x40

# Test servo control
python3 python_wrappers/servo_cli.py move_to_pca 0 90
```

**Camera Issues**
```bash
# Check camera detection
v4l2-ctl --list-devices

# Test MJPG-Streamer
curl http://localhost:8090

# Check camera permissions
ls -la /dev/video0
```

## 📁 File Structure

```
MonsterBox/
├── install.sh              # System installation script
├── setup-monsterbox.sh     # Application setup script
├── scripts/
│   ├── post-install.js     # NPM post-install script
│   ├── setup-webcam.sh     # Camera setup script
│   └── system-check.sh     # System diagnostics
├── python_wrappers/        # Hardware control scripts
├── utils/
│   └── requirements.txt    # Python dependencies
├── package.json            # Node.js configuration
└── .env                    # Environment configuration
```

## 🔧 Manual Installation (Advanced)

If automatic installation fails, you can install components manually:

### System Packages
```bash
sudo apt-get update
sudo apt-get install -y nodejs npm python3 python3-pip
sudo apt-get install -y python3-rpi.gpio python3-gpiozero python3-smbus
sudo apt-get install -y v4l-utils ffmpeg alsa-utils
```

### Hardware Interfaces
```bash
sudo raspi-config nonint do_i2c 0
sudo raspi-config nonint do_spi 0
sudo raspi-config nonint do_camera 0
```

### Services
```bash
sudo systemctl enable pigpiod
sudo systemctl start pigpiod
```

## 🌐 Network Access

MonsterBox runs on port 3000 by default:
- Local access: `http://localhost:3000`
- Network access: `http://your-pi-ip:3000`
- MJPG stream: `http://your-pi-ip:8090`

## 📊 Performance Optimization

For best performance:

1. **GPU Memory**: Set to 256MB in `/boot/config.txt`
2. **SD Card**: Use Class 10 or better
3. **Power Supply**: Use official 3A power supply
4. **Cooling**: Ensure adequate cooling for continuous operation

## 🔒 Security Considerations

- Change default passwords
- Use SSH keys instead of passwords
- Consider firewall rules for network access
- Keep system updated: `sudo apt update && sudo apt upgrade`

## 📞 Support

If you encounter issues:

1. Run system check: `npm run check`
2. Check logs: `journalctl -u monsterbox -f`
3. Review hardware connections
4. Consult the troubleshooting section above

## 🎉 Success!

Once installation is complete, you should be able to:
- ✅ Access MonsterBox web interface
- ✅ Control servos through PCA9685
- ✅ Stream camera video
- ✅ Play audio through speakers
- ✅ Create and run poses
- ✅ Monitor system status

Welcome to MonsterBox 4.0! 🎭
