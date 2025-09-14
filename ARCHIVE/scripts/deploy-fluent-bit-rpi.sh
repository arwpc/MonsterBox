#!/bin/bash

# MonsterBox Fluent Bit Deployment Script for RPI4b
# Deploy comprehensive log collection for MCP development

set -e

# Configuration
ANIMATRONIC_ID=${1:-"orlok"}  # Default to orlok, can be: orlok, coffin, pumpkinhead
CONFIG_SOURCE="data/fluent-bit-rpi-config.conf"
CONFIG_TARGET="/etc/fluent-bit/fluent-bit.conf"
LOG_EXPORT_DIR="/home/remote/log_export"
MONSTERBOX_LOG_DIR="/home/remote/MonsterBox/logs"
SCRIPTS_LOG_DIR="/home/remote/MonsterBox/scripts/logs"

echo "🎃 MonsterBox Fluent Bit Deployment for ${ANIMATRONIC_ID}"
echo "=================================================="

# Validate animatronic ID
case $ANIMATRONIC_ID in
    orlok|coffin|pumpkinhead)
        echo "✅ Valid animatronic ID: ${ANIMATRONIC_ID}"
        ;;
    *)
        echo "❌ Invalid animatronic ID: ${ANIMATRONIC_ID}"
        echo "   Valid options: orlok, coffin, pumpkinhead"
        exit 1
        ;;
esac

# Check if running on RPI
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    echo "⚠️  Warning: This doesn't appear to be a Raspberry Pi"
    echo "   Continuing anyway..."
fi

# Create necessary directories
echo "📁 Creating log directories..."
sudo mkdir -p "${LOG_EXPORT_DIR}"
sudo mkdir -p "${MONSTERBOX_LOG_DIR}"
sudo mkdir -p "${SCRIPTS_LOG_DIR}"
sudo mkdir -p /tmp/flb-storage
sudo mkdir -p /var/log

# Set proper permissions
sudo chown -R remote:remote "${LOG_EXPORT_DIR}"
sudo chown -R remote:remote "${MONSTERBOX_LOG_DIR}"
sudo chown -R remote:remote "${SCRIPTS_LOG_DIR}"
sudo chown -R fluent-bit:fluent-bit /tmp/flb-storage 2>/dev/null || true

echo "✅ Directories created and permissions set"

# Install Fluent Bit if not already installed
if ! command -v fluent-bit &> /dev/null; then
    echo "📦 Installing Fluent Bit..."
    
    # Add Fluent Bit repository
    curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh
    
    # Enable service
    sudo systemctl enable fluent-bit
    
    echo "✅ Fluent Bit installed"
else
    echo "✅ Fluent Bit already installed"
fi

# Stop Fluent Bit service for configuration
echo "⏹️  Stopping Fluent Bit service..."
sudo systemctl stop fluent-bit 2>/dev/null || true

# Backup existing configuration
if [ -f "${CONFIG_TARGET}" ]; then
    echo "💾 Backing up existing configuration..."
    sudo cp "${CONFIG_TARGET}" "${CONFIG_TARGET}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Copy and customize configuration
echo "⚙️  Deploying Fluent Bit configuration..."

if [ ! -f "${CONFIG_SOURCE}" ]; then
    echo "❌ Configuration file not found: ${CONFIG_SOURCE}"
    echo "   Please run this script from the MonsterBox project root"
    exit 1
fi

# Replace ANIMATRONIC_ID placeholder with actual ID
sed "s/ANIMATRONIC_ID/${ANIMATRONIC_ID}/g" "${CONFIG_SOURCE}" | sudo tee "${CONFIG_TARGET}" > /dev/null

echo "✅ Configuration deployed for ${ANIMATRONIC_ID}"

# Create test log entries
echo "📝 Creating test log entries..."

# Create MonsterBox app test log
cat > /tmp/test_app.log << EOF
{"timestamp":"$(date -Iseconds)","level":"info","message":"MonsterBox ${ANIMATRONIC_ID} startup test","component":"app","animatronic":"${ANIMATRONIC_ID}"}
{"timestamp":"$(date -Iseconds)","level":"info","message":"Fluent Bit log collection test","component":"logging","animatronic":"${ANIMATRONIC_ID}"}
EOF

# Copy test log to MonsterBox log directory
sudo cp /tmp/test_app.log "${MONSTERBOX_LOG_DIR}/app.log"
sudo chown remote:remote "${MONSTERBOX_LOG_DIR}/app.log"

# Create scripts test log
cat > /tmp/test_utils.log << EOF
{"timestamp":"$(date -Iseconds)","level":"info","message":"MonsterBox utility script test","script":"deploy-fluent-bit","animatronic":"${ANIMATRONIC_ID}"}
EOF

sudo cp /tmp/test_utils.log "${SCRIPTS_LOG_DIR}/utils.log"
sudo chown remote:remote "${SCRIPTS_LOG_DIR}/utils.log"

echo "✅ Test log entries created"

# Validate configuration
echo "🔍 Validating Fluent Bit configuration..."
if sudo fluent-bit -c "${CONFIG_TARGET}" --dry-run; then
    echo "✅ Configuration validation passed"
else
    echo "❌ Configuration validation failed"
    echo "   Check the configuration file: ${CONFIG_TARGET}"
    exit 1
fi

# Start Fluent Bit service
echo "🚀 Starting Fluent Bit service..."
sudo systemctl start fluent-bit

# Wait a moment for startup
sleep 3

# Check service status
if sudo systemctl is-active --quiet fluent-bit; then
    echo "✅ Fluent Bit service is running"
else
    echo "❌ Fluent Bit service failed to start"
    echo "   Check logs: sudo journalctl -u fluent-bit -f"
    exit 1
fi

# Test HTTP endpoint
echo "🔍 Testing Fluent Bit HTTP endpoint..."
if curl -s http://localhost:2020/api/v1/health > /dev/null; then
    echo "✅ Fluent Bit HTTP API is responding"
else
    echo "⚠️  Fluent Bit HTTP API not responding (may not be critical)"
fi

# Wait for log processing
echo "⏳ Waiting for log processing..."
sleep 10

# Check if log files are being created
echo "📊 Checking log file generation..."
if ls "${LOG_EXPORT_DIR}"/${ANIMATRONIC_ID}-*.jsonl 1> /dev/null 2>&1; then
    echo "✅ Log files are being generated:"
    ls -la "${LOG_EXPORT_DIR}"/${ANIMATRONIC_ID}-*.jsonl
else
    echo "⚠️  No log files found yet. This may be normal for a new installation."
    echo "   Log files will appear in: ${LOG_EXPORT_DIR}"
fi

# Display service status
echo ""
echo "📋 Fluent Bit Service Status:"
sudo systemctl status fluent-bit --no-pager -l

echo ""
echo "🎉 Fluent Bit deployment completed for ${ANIMATRONIC_ID}!"
echo ""
echo "📋 Next Steps:"
echo "   1. Monitor logs: sudo journalctl -u fluent-bit -f"
echo "   2. Check HTTP API: curl http://localhost:2020/api/v1/health"
echo "   3. View exported logs: ls -la ${LOG_EXPORT_DIR}/"
echo "   4. Test MCP collection from development machine"
echo ""
echo "📁 Log Export Directory: ${LOG_EXPORT_DIR}"
echo "🌐 HTTP API: http://$(hostname -I | awk '{print $1}'):2020"
echo ""
echo "🔧 Configuration File: ${CONFIG_TARGET}"
echo "💾 Backup: ${CONFIG_TARGET}.backup.*"

# Clean up temp files
rm -f /tmp/test_app.log /tmp/test_utils.log

echo "✅ Deployment complete!"
