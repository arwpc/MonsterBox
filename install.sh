#!/bin/bash

# MonsterBox 4.0 Complete Installation Script
# For fresh Raspberry Pi 4B installations
# Run with: sudo bash install.sh

set -e  # Exit on any error

# Color output functions
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

print_warning() {
    echo -e "\e[1;33m>>> Warning: $1\e[0m"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use: sudo bash install.sh)"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER=${SUDO_USER:-$(logname 2>/dev/null || echo "pi")}
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

print_status "Installing MonsterBox 4.0 for user: $ACTUAL_USER"
print_status "User home directory: $ACTUAL_HOME"

# 1. System Update and Upgrade
print_status "Updating system packages..."
apt-get update
apt-get upgrade -y
apt-get dist-upgrade -y
apt-get autoremove -y

# 2. Install Core System Dependencies
print_status "Installing core system dependencies..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    cmake \
    pkg-config \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# 3. Install Node.js 18+ (official NodeSource repository)
print_status "Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_success "Node.js installed: $NODE_VERSION"
print_success "npm installed: $NPM_VERSION"

# 4. Install Python and Core Python Packages
print_status "Installing Python dependencies..."
apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    python3-setuptools \
    python3-wheel \
    python3-numpy \
    python3-scipy

# 5. Install Hardware Control Libraries
print_status "Installing hardware control libraries..."
apt-get install -y \
    python3-rpi.gpio \
    python3-gpiozero \
    python3-smbus \
    python3-spidev \
    python3-pigpio \
    pigpio \
    i2c-tools \
    spi-tools

# 6. Install Audio System Dependencies
print_status "Installing audio system dependencies..."
apt-get install -y \
    alsa-utils \
    libasound2 \
    libasound2-dev \
    pulseaudio \
    pulseaudio-utils \
    pipewire \
    pipewire-alsa \
    pipewire-pulse \
    wireplumber \
    ffmpeg \
    mpg123 \
    libmp3lame0 \
    libmp3lame-dev \
    python3-pyaudio

# 7. Install Video/Camera Dependencies
print_status "Installing video and camera dependencies..."
apt-get install -y \
    v4l-utils \
    fswebcam \
    libv4l-dev \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libavdevice-dev

# 8. Install OpenCV and Computer Vision Dependencies
print_status "Installing OpenCV dependencies..."
apt-get install -y \
    python3-opencv \
    libopencv-dev \
    libatlas-base-dev \
    libhdf5-dev \
    libhdf5-serial-dev \
    libgtk-3-0 \
    libqtgui4 \
    libqtwebkit4 \
    libqt4-test \
    python3-pyqt5 \
    libxvidcore-dev \
    libx264-dev

# 9. Install MJPG-Streamer Dependencies
print_status "Installing MJPG-Streamer dependencies..."
apt-get install -y \
    libjpeg-dev \
    imagemagick \
    libv4l-dev \
    cmake \
    git

# 10. Configure Hardware Interfaces
print_status "Configuring hardware interfaces..."

# Enable I2C
raspi-config nonint do_i2c 0
print_success "I2C enabled"

# Enable SPI  
raspi-config nonint do_spi 0
print_success "SPI enabled"

# Enable Camera
raspi-config nonint do_camera 0
print_success "Camera enabled"

# 11. Configure GPU Memory and Boot Settings
print_status "Configuring GPU memory and boot settings..."

# Remove existing GPU memory settings
sed -i '/gpu_mem=/d' /boot/config.txt
sed -i '/start_x=/d' /boot/config.txt
sed -i '/gpu_split=/d' /boot/config.txt

# Set optimal GPU memory for camera and graphics
echo "gpu_mem=256" >> /boot/config.txt
echo "start_x=1" >> /boot/config.txt

print_success "GPU memory configured for camera support"

# 12. Set Up User Groups and Permissions
print_status "Setting up user groups and permissions..."

# Add user to required groups
usermod -a -G gpio,video,audio,i2c,spi,dialout,plugdev $ACTUAL_USER

# Set up device permissions
echo 'SUBSYSTEM=="gpio", GROUP="gpio", MODE="0664"' > /etc/udev/rules.d/99-gpio.rules
echo 'SUBSYSTEM=="i2c-dev", GROUP="i2c", MODE="0664"' > /etc/udev/rules.d/99-i2c.rules
echo 'SUBSYSTEM=="spidev", GROUP="spi", MODE="0664"' > /etc/udev/rules.d/99-spi.rules
echo 'SUBSYSTEM=="video4linux", GROUP="video", MODE="0666"' > /etc/udev/rules.d/99-camera.rules

print_success "User groups and permissions configured"

# 13. Enable and Start Services
print_status "Enabling and starting system services..."

# Enable and start pigpiod for GPIO control
systemctl enable pigpiod
systemctl start pigpiod
print_success "pigpiod service enabled and started"

# Enable I2C and SPI modules
echo "i2c-dev" >> /etc/modules
echo "spi-dev" >> /etc/modules

# 14. Install MJPG-Streamer
print_status "Installing MJPG-Streamer..."
cd /tmp

# Clone and build MJPG-Streamer
if [ -d "mjpg-streamer" ]; then
    rm -rf mjpg-streamer
fi

git clone https://github.com/jacksonliam/mjpg-streamer.git
cd mjpg-streamer/mjpg-streamer-experimental

make clean
make all
make install

# Create systemd service for MJPG-Streamer
cat > /etc/systemd/system/mjpg-streamer.service << 'EOF'
[Unit]
Description=MJPG Streamer
After=network.target

[Service]
Type=forking
User=root
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 640x480 -f 15 -q 85" -o "output_http.so -p 8090 -w /usr/local/share/mjpg-streamer/www"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mjpg-streamer

print_success "MJPG-Streamer installed and configured"

# 15. Configure Audio System
print_status "Configuring audio system..."

# Set default audio levels
for control in PCM Master Headphone Speaker; do
    amixer -q sset $control 95% unmute 2>/dev/null || true
done

# Save audio settings
alsactl store || true

print_success "Audio system configured"

print_success "MonsterBox 4.0 system installation complete!"
print_warning "Please reboot your Raspberry Pi to ensure all changes take effect"
print_status "After reboot, navigate to your MonsterBox directory and run: npm install"
print_status "Then start MonsterBox with: npm start"
