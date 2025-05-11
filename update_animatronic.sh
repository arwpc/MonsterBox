#!/bin/bash
# update_animatronic.sh
# Comprehensive update script for RPi4b animatronic deployment
# Run with: sudo bash update_animatronic.sh

set -e

print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}
print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}
print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo bash update_animatronic.sh)"
    exit 1
fi

# 1. Update OS and all packages
print_status "Updating OS and all packages..."
apt-get update && apt-get upgrade -y && apt-get dist-upgrade -y && apt-get autoremove -y

# 2. Ensure Node.js and npm are installed and up to date
print_status "Checking Node.js and npm..."
if ! command -v node > /dev/null; then
    print_status "Node.js not found, installing..."
    apt-get install -y nodejs npm
fi
print_status "Node version: $(node -v)"
print_status "NPM version: $(npm -v)"

# Optionally update node & npm (uncomment if you want to always update)
# apt-get install -y nodejs npm

# 3. Install/update npm dependencies
print_status "Installing/updating npm dependencies..."
cd "$(dirname "$0")"
npm install --production
npm audit fix || true

# 4. Install/update Python dependencies if requirements.txt exists
if [ -f requirements.txt ]; then
    print_status "Installing/updating Python dependencies..."
    apt-get install -y python3-pip
    python3 -m pip install --upgrade pip
    python3 -m pip install -r requirements.txt
fi

# 5. Ensure required system packages (add more as needed)
print_status "Ensuring core system packages..."
apt-get install -y v4l-utils i2c-tools ffmpeg mpg123 libmp3lame0 libmp3lame-dev build-essential alsa-utils libasound2 libasound2-dev python3-gpiozero python3-pigpio pigpio

# 6. Enable and start pigpiod service
print_status "Enabling and starting pigpiod service..."
systemctl enable pigpiod
systemctl start pigpiod

# 7. Add user to required groups
groups_to_add="gpio,video,i2c,spi"
if [ -n "$SUDO_USER" ]; then
    usermod -a -G $groups_to_add $SUDO_USER
else
    usermod -a -G $groups_to_add $USER
fi

# 8. Enable I2C and SPI if not already enabled
raspi-config nonint do_i2c 0
raspi-config nonint do_spi 0

# 9. Set GPU memory to 512MB
if ! grep -q "^gpu_mem=" /boot/config.txt; then
    echo "gpu_mem=512" >> /boot/config.txt
else
    sed -i 's/^gpu_mem=.*/gpu_mem=512/' /boot/config.txt
fi

# 10. Set correct permissions for hardware interfaces
chown root:gpio /dev/gpiomem 2>/dev/null || true
chmod g+rw /dev/gpiomem 2>/dev/null || true
chown root:gpio /dev/spidev* 2>/dev/null || true
chmod g+rw /dev/spidev* 2>/dev/null || true
chown root:i2c /dev/i2c* 2>/dev/null || true
chmod g+rw /dev/i2c* 2>/dev/null || true

print_success "Update complete! Please reboot for all changes to take effect."
