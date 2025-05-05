#!/bin/bash
# This is a bash script and should be run with: sudo bash install.sh

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

# Update package lists
print_status "Updating package lists..."
apt-get update

# Install system dependencies
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
    libasound2-dev

# Install Python and core dependencies
print_status "Installing Python dependencies..."
apt-get install -y \
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

# Enable I2C interface
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
print_status "Configuring additional audio settings..."
if [ ! -f /etc/asound.conf ]; then
    echo "pcm.!default {
    type hw
    card 0
}

ctl.!default {
    type hw
    card 0
}" > /etc/asound.conf
fi

print_success "Installation completed!"
print_status "Please reboot your system to ensure all changes take effect."
print_status "After reboot:"
print_status "1. Run 'sudo i2cdetect -y 1' to verify I2C is working"
print_status "2. Check camera with 'v4l2-ctl --list-devices'"
print_status "3. Test audio with 'speaker-test -t wav -c 2'"
print_status "4. Verify audio settings with 'amixer'"
print_status "5. Verify ffmpeg with 'ffmpeg -version'"
print_status "6. Test MP3 playback with 'mpg123 --version'"
print_status "7. Check GPU memory with 'vcgencmd get_mem gpu'"
