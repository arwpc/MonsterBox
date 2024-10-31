# MonsterBox Installation Guide

This guide provides instructions for installing all required dependencies for the MonsterBox project.

## Installation Methods

### Method 1: Using the Installation Script (Recommended for Raspberry Pi)

```bash
# IMPORTANT: Run with bash, NOT python
sudo bash install.sh
```

### Method 2: Manual Installation

#### System Dependencies

```bash
# Update package lists
sudo apt-get update

# Install system dependencies
sudo apt-get install -y \
    v4l-utils \
    i2c-tools \
    nodejs \
    npm \
    git \
    ffmpeg \
    mpg123 \
    libmp3lame0 \
    libmp3lame-dev \
    build-essential \
    alsa-utils \
    libasound2 \
    libasound2-dev

# Install Python and dependencies
sudo apt-get install -y \
    python3-dev \
    python3-numpy \
    python3-opencv \
    python3-rpi.gpio \
    python3-smbus \
    python3-pygame \
    python3-flask \
    python3-gpiozero \
    python3-psutil \
    python3-setuptools \
    python3-wheel \
    python3-pip \
    python3-pyaudio

# Install OpenCV and multimedia dependencies
sudo apt-get install -y \
    libopencv-dev \
    libatlas-base-dev \
    libhdf5-dev \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libv4l-dev \
    libxvidcore-dev \
    libx264-dev \
    libavcodec-extra
```

#### Configure Hardware Settings

1. Set GPU Memory and Enable Camera:
```bash
# Edit /boot/config.txt
sudo sed -i '/gpu_mem=/d' /boot/config.txt
sudo sed -i '/start_x=/d' /boot/config.txt
echo "gpu_mem=1024" | sudo tee -a /boot/config.txt
echo "start_x=1" | sudo tee -a /boot/config.txt
```

2. Configure Audio:
```bash
# Create ALSA configuration
sudo tee /etc/asound.conf << EOF
pcm.!default {
    type hw
    card 0
}

ctl.!default {
    type hw
    card 0
}
EOF

# Set volume for available controls
for control in PCM Master Headphone Speaker; do
    amixer -q sset $control 95% unmute 2>/dev/null || true
done

# Store settings
sudo alsactl store
```

3. Enable I2C:
```bash
# Add to /etc/modules
echo "i2c-dev" | sudo tee -a /etc/modules

# Enable in config.txt
echo "dtparam=i2c_arm=on" | sudo tee -a /boot/config.txt
```

#### Node.js Dependencies

```bash
# Install Node.js packages
npm install
```

### Method 3: Development Installation (Non-Raspberry Pi)

For development on non-Raspberry Pi systems, you can skip the hardware-specific dependencies:

```bash
# Install core system dependencies
sudo apt-get update && sudo apt-get install -y \
    v4l-utils \
    nodejs \
    npm \
    git \
    ffmpeg \
    mpg123 \
    libmp3lame0 \
    python3-dev \
    python3-numpy \
    python3-opencv \
    python3-pygame \
    python3-flask \
    python3-psutil \
    alsa-utils \
    libasound2 \
    libasound2-dev

# Configure audio
sudo tee /etc/asound.conf << EOF
pcm.!default {
    type hw
    card 0
}

ctl.!default {
    type hw
    card 0
}
EOF

# Set volume
for control in PCM Master Headphone Speaker; do
    amixer -q sset $control 95% unmute 2>/dev/null || true
done

# Install Node.js packages
npm install
```

## Post-Installation

1. Reboot your system to ensure all changes take effect:
```bash
sudo reboot
```

2. After reboot, verify the installations:

- Check GPU Memory:
```bash
vcgencmd get_mem gpu
# Should show: gpu=1024M
```

- Test Audio:
```bash
# Play test sound
speaker-test -t wav -c 2

# Check audio devices and controls
aplay -l
amixer
```

- Check I2C (Raspberry Pi):
```bash
sudo i2cdetect -y 1
```

- Check camera:
```bash
v4l2-ctl --list-devices
```

- Verify ffmpeg installation:
```bash
ffmpeg -version
```

- Test MP3 playback:
```bash
mpg123 --version
```

## Hardware Requirements

- Raspberry Pi (recommended: 4B or newer)
- Camera module or USB camera
- I2C-enabled devices (servos, sensors)
- Audio output device
- GPIO-connected components (LEDs, motors)
- At least 1024MB GPU memory allocation

## Troubleshooting

### Installation Script Issues

1. Make sure to run the installation script with bash:
```bash
# CORRECT way to run the script:
sudo bash install.sh

# INCORRECT ways:
sudo python3 install.sh  # This will fail
sudo ./install.sh       # This might fail if script isn't executable
```

### Audio Issues

If you encounter audio playback issues:

1. Check available audio devices:
```bash
aplay -l
```

2. Check available controls:
```bash
amixer
```

3. Test audio output:
```bash
# Test with speaker-test
speaker-test -t wav -c 2

# Test with specific audio device (if default doesn't work)
speaker-test -D plughw:0,0 -t wav -c 2
```

4. Check ALSA configuration:
```bash
cat /etc/asound.conf
```

5. Try setting volume manually:
```bash
# Try different controls
amixer -c 0 sset PCM 95%
amixer -c 0 sset Master 95%
amixer -c 0 sset Headphone 95%
amixer -c 0 sset Speaker 95%
```

### Camera Issues

If the camera isn't working:

1. Check if camera is detected:
```bash
ls -l /dev/video*
```

2. Test camera access:
```bash
v4l2-ctl --all
```

3. Verify camera settings:
```bash
v4l2-ctl --list-formats-ext
```

### GPU Memory Issues

If you experience graphics issues:

1. Verify GPU memory allocation:
```bash
vcgencmd get_mem gpu
```

2. Check config.txt settings:
```bash
grep gpu_mem /boot/config.txt
```

3. Monitor GPU memory usage:
```bash
vcgencmd get_mem
