#!/bin/bash
# This is a bash script and should be run with: sudo bash install.sh
# update
# Function to print colored output
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo bash install.sh)"
    exit 1
fi

# 1. Full OS and package upgrade for first-time setup
print_status "Updating OS and upgrading all packages..."
apt-get update && apt-get upgrade -y && apt-get dist-upgrade -y && apt-get autoremove -y

# 2. Install system dependencies
print_status "Installing system dependencies..."
apt-get install -y \
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
    libasound2-dev \
    python3-pigpio \
    python3-pip \
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
    python3-pyaudio \
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

# Install Python dependencies
print_status "Installing Python dependencies..."
apt-get install -y \
    python3-pigpio \
    python3-pip \
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
    python3-pyaudio

# Install OpenCV dependencies for Debian Bookworm
print_status "Installing OpenCV dependencies..."
apt-get install -y \
    libopencv-dev \
    libatlas-base-dev \
    libhdf5-dev \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev

# Install multimedia codecs
print_status "Installing multimedia codecs..."
apt-get install -y \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libv4l-dev \
    libxvidcore-dev \
    libx264-dev \
    libavcodec-extra

# Enable I2C and GPIO interfaces
print_status "Enabling I2C and GPIO interfaces..."
if ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt; then
    echo "dtparam=i2c_arm=on" | tee -a /boot/config.txt
fi
if ! grep -q "^dtparam=gpio=on" /boot/config.txt; then
    echo "dtparam=gpio=on" | tee -a /boot/config.txt
fi
print_status "Enabling I2C interface..."
if ! grep -q "i2c-dev" /etc/modules; then
    echo "i2c-dev" >> /etc/modules
fi
if ! grep -q "dtparam=i2c_arm=on" /boot/config.txt; then
    echo "dtparam=i2c_arm=on" >> /boot/config.txt
fi

# Configure GPU memory and camera
print_status "Configuring GPU memory and camera..."
sed -i '/gpu_mem=/d' /boot/config.txt
sed -i '/start_x=/d' /boot/config.txt
echo "gpu_mem=1024" >> /boot/config.txt
echo "start_x=1" >> /boot/config.txt

# Set up audio volume
print_status "Configuring audio settings..."
# Try different audio controls that might exist on Raspberry Pi
for control in PCM Master Headphone Speaker; do
    amixer -q sset $control 95% unmute 2>/dev/null || true
done

# Save the volume settings
alsactl store || true

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
cd "$(dirname "$0")"
npm install

# Enable and start pigpiod daemon
print_status "Enabling and starting pigpiod service..."
systemctl enable pigpiod
systemctl start pigpiod

# Set up video device permissions
print_status "Setting up video device permissions..."
if ! grep -q "SUBSYSTEM==\"video4linux\"" /etc/udev/rules.d/99-camera.rules 2>/dev/null; then
    echo 'SUBSYSTEM=="video4linux", GROUP="video", MODE="0666"' > /etc/udev/rules.d/99-camera.rules
fi

# Set up audio permissions
print_status "Setting up audio permissions..."
usermod -a -G audio $SUDO_USER

# Add current user to required groups
print_status "Adding user to required groups..."
usermod -a -G video,i2c,gpio,audio $SUDO_USER

# Configure audio settings
echo "Detecting USB Audio Device for /etc/asound.conf..."
USB_CARD_LINE=$(aplay -l | grep -m1 'USB Audio Device')
if [ -n "$USB_CARD_LINE" ]; then
    USB_CARD_NUM=$(echo "$USB_CARD_LINE" | awk '{print $2}' | tr -d ':')
    echo "Found USB Audio Device at card $USB_CARD_NUM"
    cat << EOF > /etc/asound.conf
pcm.!default {
    type plug
    slave.pcm "hw:${USB_CARD_NUM},0"
}
ctl.!default {
    type hw
    card ${USB_CARD_NUM}
}
EOF
    print_success "/etc/asound.conf configured for USB Audio Device (card $USB_CARD_NUM)"
else
    print_error "No USB Audio Device found! Skipping /etc/asound.conf configuration."
fi

# Set Master volume to 100%
echo "Setting Master volume to 100%..."
amixer sset 'Master' 100% || true

# Ensure GPU memory allocation is 1024MB
echo "Setting GPU memory allocation to 1024MB..."
sed -i '/^gpu_mem=/d' /boot/config.txt
GPU_MEM_SETTING=$(grep '^gpu_mem=' /boot/config.txt)
if [ -z "$GPU_MEM_SETTING" ]; then
    echo "gpu_mem=1024" >> /boot/config.txt
else
    sed -i 's/^gpu_mem=.*/gpu_mem=1024/' /boot/config.txt
fi

print_success "Installation complete! Please reboot your system for all changes to take effect."
print_status "After reboot:"
print_status "1. Run 'sudo i2cdetect -y 1' to verify I2C is working"
print_status "2. Check camera with 'v4l2-ctl --list-devices'"
print_status "3. Test audio with 'speaker-test -t wav -c 2'"
print_status "4. Verify audio settings with 'amixer'"
print_status "5. Verify ffmpeg with 'ffmpeg -version'"
print_status "6. Test MP3 playback with 'mpg123 --version'"
print_status "7. Check GPU memory with 'vcgencmd get_mem gpu'"
