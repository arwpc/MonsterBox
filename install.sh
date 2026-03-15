#!/bin/bash

# MonsterBox Complete Installation Script
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

print_status "Installing MonsterBox for user: $ACTUAL_USER"
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

# 3. Install Node.js 20 LTS (official NodeSource repository)
print_status "Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
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
# Remove PulseAudio to avoid conflicts with PipeWire
apt-get purge -y 'pulseaudio*' || true
apt-get install -y \
    alsa-utils \
    libasound2 \
    libasound2-dev \
    pipewire \
    pipewire-alsa \
    pipewire-pulse \
    pulseaudio-utils \
    wireplumber \
    ffmpeg \
    mpg123 \
    libmp3lame0 \
    libmp3lame-dev \
    python3-pyaudio \
    python3-websockets

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
Description=MJPG Streamer (UVC to HTTP)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/tmp
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 640x480 -f 24 -q 80" -o "output_http.so -p 8090 -w /usr/local/share/mjpg-streamer/www"
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mjpg-streamer

print_success "MJPG-Streamer installed and configured"
systemctl restart mjpg-streamer
sleep 1


# 15. Configure Audio System
print_status "Configuring audio system..."

# Set default audio levels
for control in PCM Master Headphone Speaker; do
    amixer -q sset $control 95% unmute 2>/dev/null || true
done

# Save audio settings
alsactl store || true

print_success "Audio system configured"

# 15b. Configure WirePlumber to auto-start at boot for the user
print_status "Configuring WirePlumber for user $ACTUAL_USER..."
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$REPO_DIR/scripts/configure-wireplumber.sh" "$ACTUAL_USER" || print_warning "configure-wireplumber.sh reported a non-fatal issue"

# 16b. Apply MonsterBox OS performance optimizations (idempotent)
print_status "Applying OS performance optimizations (CPU governor, sysctl, service priority)..."
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$REPO_DIR/scripts/optimize-pi-performance.sh" ]; then
    bash "$REPO_DIR/scripts/optimize-pi-performance.sh" || print_warning "optimize-pi-performance.sh reported a non-fatal issue"
else
    print_warning "scripts/optimize-pi-performance.sh not found; skipping OS tuning"
fi

# 16c. Set low-latency mjpg-streamer defaults via systemd drop-in (idempotent)
print_status "Tuning mjpg-streamer defaults for low latency (640x480@24fps q80)..."
if [ -f "$REPO_DIR/scripts/tune-mjpg.sh" ]; then
    bash "$REPO_DIR/scripts/tune-mjpg.sh" /dev/video0 640x480 24 80 || print_warning "tune-mjpg.sh reported a non-fatal issue"
else
    print_warning "scripts/tune-mjpg.sh not found; skipping mjpg-streamer tuning"
fi

# 16. Configure ElevenLabs AI (required for STT, TTS, Conversational AI)
print_status "Configuring ElevenLabs AI..."

# Accept either ELEVENLABS_API_KEY or XI_API_KEY from the environment
ELEVEN_KEY="${ELEVENLABS_API_KEY:-$XI_API_KEY}"

if [ -n "$ELEVEN_KEY" ]; then
    mkdir -p /etc/monsterbox
    echo -n "$ELEVEN_KEY" > /etc/monsterbox/elevenlabs.key
    chown "$ACTUAL_USER":"$ACTUAL_USER" /etc/monsterbox/elevenlabs.key || true
    chmod 600 /etc/monsterbox/elevenlabs.key
    print_success "Wrote ElevenLabs API key to /etc/monsterbox/elevenlabs.key"
else
    print_warning "No ELEVENLABS_API_KEY (or XI_API_KEY) found in environment. You can set it later with:"
    echo "    sudo mkdir -p /etc/monsterbox && echo -n 'sk_...' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null && sudo chmod 600 /etc/monsterbox/elevenlabs.key"
fi

# Provision default AI config (TTS: eleven_v3, STT: scribe_v2)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_CONFIG_DIR="$REPO_DIR/data/ai-config"
mkdir -p "$AI_CONFIG_DIR"

if [ ! -f "$AI_CONFIG_DIR/tts-config.json" ]; then
    cat > "$AI_CONFIG_DIR/tts-config.json" << 'TTSCFG'
{
  "model": "eleven_v3",
  "voice_id": "",
  "stability": 0.5,
  "similarity_boost": 0.75,
  "output_format": "mp3_44100_128"
}
TTSCFG
    print_success "Created default TTS config (eleven_v3)"
fi

if [ ! -f "$AI_CONFIG_DIR/stt-config.json" ]; then
    cat > "$AI_CONFIG_DIR/stt-config.json" << 'STTCFG'
{
  "model": "scribe_v2",
  "language": "en",
  "sampleRate": 16000,
  "audioFilterEnabled": true,
  "vadEnabled": true,
  "vadThreshold": 0.3,
  "vadSilenceDuration": 500
}
STTCFG
    print_success "Created default STT config (scribe_v2)"
fi


# 17. Create and select a new Character
print_status "Creating and selecting a new Character..."
read -rp "Enter new Character name: " NEW_CHAR_NAME
if [ -z "$NEW_CHAR_NAME" ]; then
    print_warning "No character name entered; skipping character creation."
else
    # Use Node.js to safely update JSON files
    REPO_DIR="$REPO_DIR" NEW_CHAR_NAME="$NEW_CHAR_NAME" node - <<'NODE'
const fs = require('fs');
const path = require('path');

const repoDir = process.env.REPO_DIR;
const dataDir = path.join(repoDir, 'data');
const charFile = path.join(dataDir, 'characters.json');
const cfgFile = path.join(repoDir, 'config', 'app-config.json');
const name = process.env.NEW_CHAR_NAME;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

fs.mkdirSync(dataDir, { recursive: true });
const arr = readJson(charFile, []);
const nextId = arr.length ? Math.max(...arr.map(c => Number(c.id)||0)) + 1 : 1;
arr.push({ id: nextId, name });
fs.writeFileSync(charFile, JSON.stringify(arr, null, 2));

const charDir = path.join(dataDir, `character-${nextId}`);
fs.mkdirSync(charDir, { recursive: true });

const cfg = readJson(cfgFile, {});
cfg.selectedCharacter = nextId;
cfg.dataPath = `data/character-${nextId}`;
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

console.log(`Created character '${name}' with id=${nextId}`);
NODE
    print_success "Character '$NEW_CHAR_NAME' created and selected."
fi




print_success "MonsterBox system installation complete!"
print_warning "Please reboot your Raspberry Pi to ensure all changes take effect"
print_status "After reboot, navigate to your MonsterBox directory and run: npm ci"
print_status "Then start MonsterBox with: npm start"
