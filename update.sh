#!/bin/bash
# This script updates MonsterBox project dependencies and ensures services are running. No full OS upgrade is performed.

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
    print_error "Please run as root (use sudo bash update.sh)"
    exit 1
fi

print_status "Ensuring core system packages (if missing)..."
apt-get install -y --no-upgrade v4l-utils i2c-tools ffmpeg mpg123 libmp3lame0 libmp3lame-dev build-essential alsa-utils libasound2 libasound2-dev python3-gpiozero python3-pigpio pigpio

print_status "Enabling and starting pigpiod service..."
systemctl enable pigpiod
systemctl start pigpiod

print_status "Updating npm dependencies..."
if [ -f package.json ]; then
    npm install
fi

print_status "Updating Python dependencies..."
if [ -f requirements.txt ]; then
    python3 -m pip install --upgrade pip
    python3 -m pip install -r requirements.txt
fi

print_success "Update complete!"
