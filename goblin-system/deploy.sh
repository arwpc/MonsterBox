#!/bin/bash

# MonsterBox Goblin Deployment Script
# Deploys and runs a native Node.js Goblin system on Raspberry Pi

set -e

GOBLIN_VERSION="1.0.0"
GOBLIN_DIR="$HOME/goblin"
SERVICE_NAME="monsterbox-goblin"

echo "🎃 MonsterBox Goblin Deployment Script"
echo "======================================"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect Pi model
detect_pi_model() {
    if [ -f /proc/cpuinfo ]; then
        grep "Model" /proc/cpuinfo | cut -d: -f2 | xargs
    else
        echo "Unknown"
    fi
}

# Function to get local IP
get_local_ip() {
    hostname -I | awk '{print $1}'
}

echo "📋 System Information:"
echo "   Model: $(detect_pi_model)"
echo "   IP: $(get_local_ip)"
echo "   OS: $(uname -a)"
echo ""

# Check Node.js installation
if ! command_exists node; then
    echo "❌ Node.js not found. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "✅ Node.js installed: $(node --version)"
else
    echo "✅ Node.js found: $(node --version)"
fi

# Check npm
if ! command_exists npm; then
    echo "❌ npm not found. Installing npm..."
    sudo apt-get install -y npm
fi

echo "✅ npm found: $(npm --version)"

# Stop existing service if running
if systemctl is-active --quiet ${SERVICE_NAME} 2>/dev/null; then
    echo "🔄 Stopping existing Goblin service..."
    sudo systemctl stop ${SERVICE_NAME}
fi

# Stop any existing goblin processes
echo "🔄 Stopping any existing goblin processes..."
pkill -f "goblin" || true
pkill -f "node.*goblin" || true

# Create goblin directory
echo "📁 Creating goblin directory..."
mkdir -p ${GOBLIN_DIR}

# Copy source files
echo "� Copying Goblin system files..."
cp -r src/* ${GOBLIN_DIR}/
cp package*.json ${GOBLIN_DIR}/ 2>/dev/null || cp package.json ${GOBLIN_DIR}/

# Create directories for media storage
echo "📁 Creating media directories..."
mkdir -p ${GOBLIN_DIR}/media/video
mkdir -p ${GOBLIN_DIR}/media/audio
mkdir -p ${GOBLIN_DIR}/config
mkdir -p ${GOBLIN_DIR}/logs

# Install dependencies
echo "� Installing Node.js dependencies..."
cd ${GOBLIN_DIR}
npm install --production

# Generate unique Goblin ID
GOBLIN_ID="goblin-$(hostname)-$(date +%s)"
echo "🆔 Generated Goblin ID: ${GOBLIN_ID}"

# Create configuration file
cat > ${GOBLIN_DIR}/config/goblin.json << EOF
{
  "goblinId": "${GOBLIN_ID}",
  "version": "${GOBLIN_VERSION}",
  "deployment": {
    "timestamp": "$(date -Iseconds)",
    "deployedBy": "$USER",
    "hostname": "$(hostname)",
    "ip": "$(get_local_ip)"
  },
  "settings": {
    "autoStart": true,
    "scanFrequency": 10000,
    "maxVideoResolution": "4K",
    "audioOutput": "HDMI",
    "port": 3001
  }
}
EOF

echo "⚙️ Configuration written to ${GOBLIN_DIR}/config/goblin.json"

# Set up audio (force HDMI output)
echo "🔊 Configuring audio output..."
sudo amixer cset numid=3 2 2>/dev/null || echo "   (Could not set HDMI audio - may need manual configuration)"

# Enable GPU memory split for better video performance
echo "🎮 Checking GPU memory split..."
if command_exists vcgencmd; then
    GPU_MEM=$(vcgencmd get_mem gpu | cut -d= -f2 | cut -d'M' -f1)
    if [ "$GPU_MEM" -lt 128 ]; then
        echo "   GPU memory is ${GPU_MEM}M, recommend 128M+ for 4K video"
        echo "   Add 'gpu_mem=128' to /boot/config.txt and reboot"
    else
        echo "   GPU memory: ${GPU_MEM}M ✅"
    fi
fi

# Create systemd service file
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=MonsterBox Goblin System
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${GOBLIN_DIR}
Environment=NODE_ENV=production
Environment=GOBLIN_ID=${GOBLIN_ID}
Environment=GOBLIN_PORT=3001
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=append:${GOBLIN_DIR}/logs/goblin.log
StandardError=append:${GOBLIN_DIR}/logs/goblin.error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}

# Start the Goblin service
echo "🚀 Starting MonsterBox Goblin system..."
sudo systemctl start ${SERVICE_NAME}

# Wait for service to start
echo "⏳ Waiting for Goblin to start..."
sleep 5

# Check if service is running
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "✅ Goblin system is running!"
    
    # Show status
    LOCAL_IP=$(get_local_ip)
    echo ""
    echo "🎃 MonsterBox Goblin Deployed Successfully!"
    echo "========================================"
    echo "   Goblin ID: ${GOBLIN_ID}"
    echo "   Local URL: http://${LOCAL_IP}:3001"
    echo "   Status: http://${LOCAL_IP}:3001/health"
    echo "   Service: sudo systemctl status ${SERVICE_NAME}"
    echo "   Logs: journalctl -u ${SERVICE_NAME} -f"
    echo ""
    echo "📡 The Goblin will automatically scan for MonsterBox instances"
    echo "   on port 3000 and connect when found."
    echo ""
    echo "🎬 Upload media files to:"
    echo "   Video: ${GOBLIN_DIR}/media/video/"
    echo "   Audio: ${GOBLIN_DIR}/media/audio/"
    echo ""
    
    # Test the health endpoint
    echo "🧪 Testing Goblin health..."
    sleep 2
    if curl -s -f http://localhost:3001/health > /dev/null; then
        echo "✅ Health check passed!"
        echo ""
        if command_exists jq; then
            curl -s http://localhost:3001/health | jq .
        else
            curl -s http://localhost:3001/health
        fi
    else
        echo "⚠️  Health check failed - system may still be starting"
        echo "   Check logs with: journalctl -u ${SERVICE_NAME} -f"
        echo "   Check status with: sudo systemctl status ${SERVICE_NAME}"
    fi
    
else
    echo "❌ Failed to start Goblin system"
    echo "   Check logs with: journalctl -u ${SERVICE_NAME} -n 50"
    echo "   Check status with: sudo systemctl status ${SERVICE_NAME}"
    exit 1
fi

echo ""
echo "🎃 Goblin deployment complete! Ready to haunt your windows! 👻"
echo ""
echo "💡 Useful commands:"
echo "   Start:   sudo systemctl start ${SERVICE_NAME}"
echo "   Stop:    sudo systemctl stop ${SERVICE_NAME}"
echo "   Restart: sudo systemctl restart ${SERVICE_NAME}"
echo "   Status:  sudo systemctl status ${SERVICE_NAME}"
echo "   Logs:    journalctl -u ${SERVICE_NAME} -f"