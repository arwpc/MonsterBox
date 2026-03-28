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
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect boot config path (Bookworm uses /boot/firmware/, older uses /boot/)
if [ -f /boot/firmware/config.txt ]; then
    BOOT_CONFIG="/boot/firmware/config.txt"
elif [ -f /boot/config.txt ]; then
    BOOT_CONFIG="/boot/config.txt"
else
    BOOT_CONFIG="/boot/firmware/config.txt"
fi

print_status "Installing MonsterBox for user: $ACTUAL_USER"
print_status "User home directory: $ACTUAL_HOME"
print_status "Repository directory: $REPO_DIR"
print_status "Boot config: $BOOT_CONFIG"

# ============================================================
# 1. System Update and Upgrade
# ============================================================
print_status "Step 1: Updating system packages..."
apt-get update
apt-get upgrade -y
apt-get dist-upgrade -y
apt-get autoremove -y

# ============================================================
# 2. Install Core System Dependencies
# ============================================================
print_status "Step 2: Installing core system dependencies..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    cmake \
    pkg-config \
    unzip \
    openssl \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# ============================================================
# 3. Install Node.js 20 LTS (official NodeSource repository)
# ============================================================
print_status "Step 3: Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_success "Node.js installed: $NODE_VERSION"
print_success "npm installed: $NPM_VERSION"

# ============================================================
# 4. Install Python and Core Python Packages
# ============================================================
print_status "Step 4: Installing Python dependencies..."
apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    python3-setuptools \
    python3-wheel \
    python3-numpy \
    python3-scipy

# ============================================================
# 5. Install Hardware Control Libraries
# ============================================================
print_status "Step 5: Installing hardware control libraries..."
apt-get install -y \
    python3-rpi.gpio \
    python3-gpiozero \
    python3-lgpio \
    python3-smbus \
    python3-smbus2 \
    python3-spidev \
    python3-pigpio \
    pigpio \
    i2c-tools \
    spi-tools

# ============================================================
# 6. Install Audio System Dependencies
# ============================================================
print_status "Step 6: Installing audio system dependencies..."
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

# ============================================================
# 7. Install Video/Camera Dependencies
# ============================================================
print_status "Step 7: Installing video and camera dependencies..."
apt-get install -y \
    v4l-utils \
    fswebcam \
    libv4l-dev \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libavdevice-dev

# ============================================================
# 8. Install OpenCV and Computer Vision Dependencies
# ============================================================
print_status "Step 8: Installing OpenCV dependencies..."
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

# ============================================================
# 9. Install MJPG-Streamer Dependencies
# ============================================================
print_status "Step 9: Installing MJPG-Streamer dependencies..."
apt-get install -y \
    libjpeg-dev \
    imagemagick

# ============================================================
# 10. Configure Hardware Interfaces
# ============================================================
print_status "Step 10: Configuring hardware interfaces..."

# Enable I2C
raspi-config nonint do_i2c 0
print_success "I2C enabled"

# Enable SPI
raspi-config nonint do_spi 0
print_success "SPI enabled"

# Enable Camera (Bookworm uses libcamera by default; legacy camera enable is a no-op)
raspi-config nonint do_camera 0 2>/dev/null || true
print_success "Camera enabled"

# ============================================================
# 11. Configure GPU Memory and Boot Settings
# ============================================================
print_status "Step 11: Configuring GPU memory and boot settings..."

# Remove existing GPU memory settings (idempotent)
sed -i '/^gpu_mem=/d' "$BOOT_CONFIG"
sed -i '/^start_x=/d' "$BOOT_CONFIG"
sed -i '/^gpu_split=/d' "$BOOT_CONFIG"

# Set optimal GPU memory for camera and graphics
echo "gpu_mem=256" >> "$BOOT_CONFIG"
echo "start_x=1" >> "$BOOT_CONFIG"

print_success "GPU memory configured for camera support"

# ============================================================
# 12. Set Up User Groups and Permissions
# ============================================================
print_status "Step 12: Setting up user groups and permissions..."

# Add user to required groups
usermod -a -G gpio,video,audio,i2c,spi,dialout,plugdev $ACTUAL_USER

# Set up device permissions
echo 'SUBSYSTEM=="gpio", GROUP="gpio", MODE="0664"' > /etc/udev/rules.d/99-gpio.rules
echo 'SUBSYSTEM=="i2c-dev", GROUP="i2c", MODE="0664"' > /etc/udev/rules.d/99-i2c.rules
echo 'SUBSYSTEM=="spidev", GROUP="spi", MODE="0664"' > /etc/udev/rules.d/99-spi.rules
echo 'SUBSYSTEM=="video4linux", GROUP="video", MODE="0666"' > /etc/udev/rules.d/99-camera.rules

print_success "User groups and permissions configured"

# ============================================================
# 13. Enable and Start Services
# ============================================================
print_status "Step 13: Enabling and starting system services..."

# Enable and start pigpiod for GPIO control
systemctl enable pigpiod
systemctl start pigpiod
print_success "pigpiod service enabled and started"

# Enable I2C and SPI modules (idempotent — only add if not already present)
grep -qxF 'i2c-dev' /etc/modules || echo "i2c-dev" >> /etc/modules
grep -qxF 'spi-dev' /etc/modules || echo "spi-dev" >> /etc/modules

# ============================================================
# 14. Install MJPG-Streamer
# ============================================================
print_status "Step 14: Installing MJPG-Streamer..."

# Build in /tmp (will cd back to REPO_DIR afterward)
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

# Return to repo directory
cd "$REPO_DIR"

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
systemctl restart mjpg-streamer || print_warning "mjpg-streamer failed to start (no camera connected?)"
sleep 1

print_success "MJPG-Streamer installed and configured"

# ============================================================
# 15. Configure Audio System
# ============================================================
print_status "Step 15: Configuring audio system..."

# Set default audio levels
for control in PCM Master Headphone Speaker; do
    amixer -q sset $control 95% unmute 2>/dev/null || true
done

# Save audio settings
alsactl store || true

print_success "Audio system configured"

# ============================================================
# 16. Configure WirePlumber and Performance Tuning
# ============================================================
print_status "Step 16: Configuring WirePlumber and performance tuning..."

if [ -f "$REPO_DIR/scripts/configure-wireplumber.sh" ]; then
    bash "$REPO_DIR/scripts/configure-wireplumber.sh" "$ACTUAL_USER" || print_warning "configure-wireplumber.sh reported a non-fatal issue"
fi

if [ -f "$REPO_DIR/scripts/optimize-pi-performance.sh" ]; then
    bash "$REPO_DIR/scripts/optimize-pi-performance.sh" || print_warning "optimize-pi-performance.sh reported a non-fatal issue"
fi

if [ -f "$REPO_DIR/scripts/tune-mjpg.sh" ]; then
    bash "$REPO_DIR/scripts/tune-mjpg.sh" /dev/video0 640x480 24 80 || print_warning "tune-mjpg.sh reported a non-fatal issue"
fi

# ============================================================
# 17. Configure ElevenLabs AI
# ============================================================
print_status "Step 17: Configuring ElevenLabs AI..."

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

# ============================================================
# 18. Generate SSL Certificates (required for HTTPS / microphone)
# ============================================================
print_status "Step 18: Generating SSL certificates..."

CERT_DIR="$REPO_DIR/certs"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/server.key" ] || [ ! -f "$CERT_DIR/server.cert" ]; then
    HOSTNAME_SHORT=$(hostname -s 2>/dev/null || echo "monsterbox")
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.cert" \
        -days 3650 \
        -subj "/CN=$HOSTNAME_SHORT"
    chmod 600 "$CERT_DIR/server.key"
    chmod 644 "$CERT_DIR/server.cert"
    chown "$ACTUAL_USER":"$ACTUAL_USER" "$CERT_DIR/server.key" "$CERT_DIR/server.cert"
    print_success "SSL certificates generated (self-signed, 10-year expiry)"
else
    print_success "SSL certificates already exist, skipping"
fi

# ============================================================
# 19. Install Node.js Dependencies
# ============================================================
print_status "Step 19: Installing Node.js dependencies..."

cd "$REPO_DIR"
sudo -u "$ACTUAL_USER" npm ci --production
print_success "Node.js production dependencies installed"

# Install Playwright browsers for testing (optional, non-fatal)
sudo -u "$ACTUAL_USER" npm ci 2>/dev/null && \
    sudo -u "$ACTUAL_USER" npx playwright install --with-deps chromium 2>/dev/null && \
    print_success "Playwright browsers installed for testing" || \
    print_warning "Playwright browser install skipped (run 'npm ci && npx playwright install --with-deps chromium' later for testing)"

# ============================================================
# 20. Create and Select a New Character
# ============================================================
print_status "Step 20: Creating and selecting a new Character..."

read -rp "Enter new Character name (or press Enter to skip): " NEW_CHAR_NAME
if [ -z "$NEW_CHAR_NAME" ]; then
    print_warning "No character name entered; skipping character creation."
else
    # Derive hostname from character name (lowercase, no spaces)
    CHAR_HOSTNAME=$(echo "$NEW_CHAR_NAME" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

    # Prompt for IP address (needed for animatronics.json registration)
    CURRENT_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    read -rp "Enter this RPi's static IP address [$CURRENT_IP]: " CHAR_IP
    CHAR_IP="${CHAR_IP:-$CURRENT_IP}"

    REPO_DIR="$REPO_DIR" NEW_CHAR_NAME="$NEW_CHAR_NAME" CHAR_HOSTNAME="$CHAR_HOSTNAME" CHAR_IP="$CHAR_IP" node --input-type=commonjs - <<'NODE'
const fs = require('fs');
const path = require('path');

const repoDir = process.env.REPO_DIR;
const dataDir = path.join(repoDir, 'data');
const charFile = path.join(dataDir, 'characters.json');
const cfgFile = path.join(repoDir, 'config', 'app-config.json');
const animFile = path.join(repoDir, 'config', 'animatronics.json');
const name = process.env.NEW_CHAR_NAME;
const hostname = process.env.CHAR_HOSTNAME;
const ip = process.env.CHAR_IP;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

fs.mkdirSync(dataDir, { recursive: true });
const arr = readJson(charFile, []);
const nextId = arr.length ? Math.max(...arr.map(c => Number(c.id)||0)) + 1 : 1;
arr.push({ id: nextId, name });
fs.writeFileSync(charFile, JSON.stringify(arr, null, 2));

// Create character data directory with scaffold files
const charDir = path.join(dataDir, `character-${nextId}`);
fs.mkdirSync(charDir, { recursive: true });

const scaffold = {
  'parts.json': [],
  'poses.json': { characterId: nextId, poses: [] },
  'scenes.json': [],
  'super-powers.json': { jawAnimation: { enabled: false }, headTracking: { enabled: false } }
};

for (const [file, content] of Object.entries(scaffold)) {
  const filePath = path.join(charDir, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  }
}

// Create per-character AI config directory
const aiDir = path.join(charDir, 'ai-config');
fs.mkdirSync(aiDir, { recursive: true });

// Update app config to select the new character
const cfg = readJson(cfgFile, { port: 3000, theme: 'default-dark' });
cfg.selectedCharacter = nextId;
cfg.dataPath = `data/character-${nextId}`;
fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

// Register in animatronics.json for hostname-based auto-select
const anim = readJson(animFile, { animatronics: [], goblins: [] });
const existing = anim.animatronics.find(a => a.hostname === hostname);
if (!existing) {
  const animId = anim.animatronics.length ? Math.max(...anim.animatronics.map(a => Number(a.id)||0)) + 1 : 1;
  anim.animatronics.push({
    id: animId,
    name: name,
    hostname: hostname,
    ip: ip,
    port: 3000,
    characterId: nextId,
    agentId: "",
    defaultSceneId: 1
  });
  fs.writeFileSync(animFile, JSON.stringify(anim, null, 2));
  console.log(`Registered '${name}' in animatronics.json (hostname=${hostname}, ip=${ip}, characterId=${nextId})`);
} else {
  console.log(`Hostname '${hostname}' already registered in animatronics.json, skipping`);
}

console.log(`Created character '${name}' with id=${nextId}, data at ${charDir}`);
NODE
    print_success "Character '$NEW_CHAR_NAME' created and selected."

    # Set RPi hostname to match character name for auto-select on boot
    print_status "Setting hostname to '$CHAR_HOSTNAME'..."
    hostnamectl set-hostname "$CHAR_HOSTNAME" 2>/dev/null || echo "$CHAR_HOSTNAME" > /etc/hostname
    # Update /etc/hosts so hostname resolves locally
    sed -i "s/127\.0\.1\.1.*/127.0.1.1\t$CHAR_HOSTNAME/" /etc/hosts
    if ! grep -q "127.0.1.1" /etc/hosts; then
        echo "127.0.1.1	$CHAR_HOSTNAME" >> /etc/hosts
    fi
    print_success "Hostname set to '$CHAR_HOSTNAME' (server will auto-select this character on boot)"
fi

# ============================================================
# 21. Create MonsterBox Systemd Service
# ============================================================
print_status "Step 21: Creating MonsterBox systemd service..."

cat > /etc/systemd/system/monsterbox.service << EOF
[Unit]
Description=MonsterBox Animatronic Control System
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target multi-user.target
Wants=network-online.target

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$REPO_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=GAIN=130
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u $ACTUAL_USER)
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StartLimitBurst=5
StandardOutput=append:/var/log/monsterbox.log
StandardError=append:/var/log/monsterbox.err
SyslogIdentifier=monsterbox
NoNewPrivileges=true
PrivateTmp=true
LimitNOFILE=4096
MemoryMax=1G

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable monsterbox.service

# Create log files with correct ownership
touch /var/log/monsterbox.log /var/log/monsterbox.err
chown "$ACTUAL_USER":"$ACTUAL_USER" /var/log/monsterbox.log /var/log/monsterbox.err

print_success "MonsterBox systemd service created and enabled"

# ============================================================
# 22. Start and Verify MonsterBox Service
# ============================================================
print_status "Step 22: Starting MonsterBox service..."

systemctl start monsterbox.service
sleep 5

if systemctl is-active --quiet monsterbox.service; then
    print_success "MonsterBox service is running"
else
    print_error "MonsterBox service failed to start — check logs:"
    echo "    sudo tail -50 /var/log/monsterbox.log"
    echo "    sudo tail -50 /var/log/monsterbox.err"
fi

# Verify HTTPS is responding
MB_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if curl -sk --max-time 10 "https://localhost:3000/" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -q "200"; then
    print_success "MonsterBox dashboard responding at https://${MB_IP}:3000"
else
    print_warning "Dashboard not responding yet — may need a reboot for hardware changes to take effect"
fi

# ============================================================
# Done
# ============================================================
print_success "MonsterBox system installation complete!"
print_warning "A reboot is recommended to apply hardware interface changes (I2C, SPI, GPU memory)"
print_status "After reboot, MonsterBox will start automatically via systemd"
print_status "Dashboard: https://${MB_IP}:3000"
print_status "Logs: sudo tail -f /var/log/monsterbox.log"
