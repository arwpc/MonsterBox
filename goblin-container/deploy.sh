#!/bin/bash

# MonsterBox Goblin Deployment Script
# Deploys and runs a Goblin container on Raspberry Pi

set -e

GOBLIN_VERSION="1.0.0"
CONTAINER_NAME="monsterbox-goblin"
IMAGE_NAME="monsterbox/goblin:${GOBLIN_VERSION}"

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

# Check Docker installation
if ! command_exists docker; then
    echo "❌ Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. You may need to logout and login again."
    echo "   Run this script again after relogging."
    exit 1
fi

echo "✅ Docker found: $(docker --version)"

# Check if running as non-root user in docker group
if ! groups $USER | grep -q docker; then
    echo "❌ User $USER not in docker group. Adding..."
    sudo usermod -aG docker $USER
    echo "   Please logout and login again, then run this script."
    exit 1
fi

# Stop existing container if running
if docker ps -a --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "🔄 Stopping existing Goblin container..."
    docker stop ${CONTAINER_NAME} || true
    docker rm ${CONTAINER_NAME} || true
fi

# Create directories for media storage
echo "📁 Creating media directories..."
sudo mkdir -p /opt/goblin-media/video
sudo mkdir -p /opt/goblin-media/audio
sudo mkdir -p /opt/goblin-config
sudo mkdir -p /opt/goblin-logs

# Set permissions
sudo chown -R $USER:$USER /opt/goblin-media /opt/goblin-config /opt/goblin-logs

# Build the container (if Dockerfile exists locally)
if [ -f "Dockerfile" ]; then
    echo "🔨 Building Goblin container locally..."
    docker build -t ${IMAGE_NAME} .
else
    echo "📦 Pulling Goblin container from registry..."
    # For now, we'll build it locally since we haven't pushed to registry
    echo "❌ No Dockerfile found and no registry image available."
    echo "   Please run this script from the goblin-container directory."
    exit 1
fi

# Generate unique Goblin ID
GOBLIN_ID="goblin-$(hostname)-$(date +%s)"
echo "🆔 Generated Goblin ID: ${GOBLIN_ID}"

# Create configuration file
cat > /opt/goblin-config/goblin.json << EOF
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
    "audioOutput": "HDMI"
  }
}
EOF

echo "⚙️ Configuration written to /opt/goblin-config/goblin.json"

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

# Start the Goblin container
echo "🚀 Starting MonsterBox Goblin..."

docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p 3001:3001 \
    -v /opt/goblin-media:/app/media \
    -v /opt/goblin-config:/app/config \
    -v /opt/goblin-logs:/app/logs \
    -e GOBLIN_ID="${GOBLIN_ID}" \
    -e GOBLIN_PORT=3001 \
    --device /dev/snd \
    --group-add audio \
    --group-add video \
    ${IMAGE_NAME}

# Wait for container to start
echo "⏳ Waiting for Goblin to start..."
sleep 5

# Check if container is running
if docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "✅ Goblin container is running!"
    
    # Show status
    LOCAL_IP=$(get_local_ip)
    echo ""
    echo "🎃 MonsterBox Goblin Deployed Successfully!"
    echo "========================================"
    echo "   Goblin ID: ${GOBLIN_ID}"
    echo "   Local URL: http://${LOCAL_IP}:3001"
    echo "   Status: http://${LOCAL_IP}:3001/health"
    echo "   Logs: docker logs ${CONTAINER_NAME}"
    echo ""
    echo "📡 The Goblin will automatically scan for MonsterBox instances"
    echo "   on port 3000 and connect when found."
    echo ""
    echo "🎬 Upload media files to:"
    echo "   Video: /opt/goblin-media/video/"
    echo "   Audio: /opt/goblin-media/audio/"
    echo ""
    
    # Test the health endpoint
    echo "🧪 Testing Goblin health..."
    sleep 2
    if curl -s -f http://localhost:3001/health > /dev/null; then
        echo "✅ Health check passed!"
        echo ""
        curl -s http://localhost:3001/health | jq . 2>/dev/null || curl -s http://localhost:3001/health
    else
        echo "⚠️  Health check failed - container may still be starting"
        echo "   Check logs with: docker logs ${CONTAINER_NAME}"
    fi
    
else
    echo "❌ Failed to start Goblin container"
    echo "   Check logs with: docker logs ${CONTAINER_NAME}"
    exit 1
fi

echo ""
echo "🎃 Goblin deployment complete! Ready to haunt your windows! 👻"