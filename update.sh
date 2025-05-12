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

# Configure audio settings for USB Audio Device
print_status "Detecting USB Audio Device for /etc/asound.conf..."
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
print_status "Setting Master volume to 100%..."
amixer sset 'Master' 100% || true

# Ensure GPU memory allocation is 1024MB
print_status "Setting GPU memory allocation to 1024MB..."
sed -i '/^gpu_mem=/d' /boot/config.txt
GPU_MEM_SETTING=$(grep '^gpu_mem=' /boot/config.txt)
if [ -z "$GPU_MEM_SETTING" ]; then
    echo "gpu_mem=1024" >> /boot/config.txt
else
    sed -i 's/^gpu_mem=.*/gpu_mem=1024/' /boot/config.txt
fi

print_success "Update complete!"
