#!/bin/bash

# MonsterBox Manual HTTPS Deployment Guide
# This script provides step-by-step instructions for manual deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
}

# Device configurations
declare -A DEVICES=(
    ["skulltalker"]="192.168.8.130"
    ["orlok"]="192.168.8.120"
    ["coffin"]="192.168.8.140"
    ["pumpkinhead"]="192.168.8.200"
)

show_help() {
    cat << EOF
MonsterBox Manual HTTPS Deployment Guide

This script provides instructions for manually deploying HTTPS to MonsterBox devices.

Usage: $0 [OPTION] [DEVICE]

Options:
    --help              Show this help message
    --list-devices      List all available devices
    --instructions      Show step-by-step deployment instructions
    --copy-files        Show file copy commands for a specific device
    --test-device       Show test commands for a specific device

Devices:
    skulltalker         192.168.8.130 (Primary ChatterPi system)
    orlok               192.168.8.120 (Animatronic control)
    coffin              192.168.8.140 (Animatronic control)
    pumpkinhead         192.168.8.200 (Animatronic control)

Examples:
    $0 --instructions
    $0 --copy-files orlok
    $0 --test-device skulltalker

EOF
}

list_devices() {
    info "Available MonsterBox devices:"
    echo
    for device in "${!DEVICES[@]}"; do
        echo "  • $device (${DEVICES[$device]})"
    done
    echo
}

show_instructions() {
    cat << EOF

${BLUE}📋 MonsterBox HTTPS Manual Deployment Instructions${NC}

${YELLOW}Prerequisites:${NC}
1. SSL certificates must be generated first:
   ${GREEN}sudo ./scripts/ssl/generate-ssl-certificates.sh --all${NC}

2. Ensure you have SSH access to target devices
3. MonsterBox code should be deployed to target devices

${YELLOW}Step-by-Step Deployment:${NC}

${BLUE}Step 1: Copy Certificate Bundle${NC}
For each device, copy the certificate bundle:

${GREEN}scp scripts/ssl/certificates/DEVICE-bundle.tar.gz remote@DEVICE-IP:/tmp/${NC}

${BLUE}Step 2: SSH to Target Device${NC}
${GREEN}ssh remote@DEVICE-IP${NC}

${BLUE}Step 3: Extract and Install Certificates${NC}
${GREEN}cd /tmp
tar -xzf DEVICE-bundle.tar.gz
sudo mkdir -p /etc/ssl/monsterbox
sudo cp DEVICE.crt /etc/ssl/monsterbox/
sudo cp DEVICE.key /etc/ssl/monsterbox/
sudo cp ssl-config.json /etc/ssl/monsterbox/
sudo chown remote:remote /etc/ssl/monsterbox/DEVICE.key
sudo chmod 600 /etc/ssl/monsterbox/DEVICE.key
sudo chmod 644 /etc/ssl/monsterbox/DEVICE.crt
sudo ln -sf /etc/ssl/monsterbox/DEVICE.crt /etc/ssl/monsterbox/server.crt
sudo ln -sf /etc/ssl/monsterbox/DEVICE.key /etc/ssl/monsterbox/server.key${NC}

${BLUE}Step 4: Update MonsterBox Code${NC}
${GREEN}cd /home/remote/MonsterBox
git pull origin main${NC}

${BLUE}Step 5: Restart Services${NC}
${GREEN}sudo pkill -f "node.*app.js" || true
sudo pkill -f "python3.*gpio_jaw_server.py" || true
sudo pkill -f "python3.*ai_websocket_bridge.py" || true
sleep 3
nohup node --no-deprecation app.js > app-https.log 2>&1 &
nohup python3 scripts/chatterpi/gpio_jaw_server.py --host 0.0.0.0 --port 8765 > jaw-server-https.log 2>&1 &
nohup python3 scripts/chatterpi/ai_websocket_bridge.py --host 0.0.0.0 --port 8766 > ai-bridge-https.log 2>&1 &${NC}

${BLUE}Step 6: Test HTTPS${NC}
${GREEN}curl -k https://localhost:8080/health${NC}

${YELLOW}Repeat for each device: skulltalker, orlok, coffin, pumpkinhead${NC}

EOF
}

show_copy_commands() {
    local device="$1"
    local ip="${DEVICES[$device]}"
    
    if [[ -z "$ip" ]]; then
        error "Unknown device: $device"
        echo "Available devices: ${!DEVICES[*]}"
        exit 1
    fi
    
    info "File copy commands for $device ($ip):"
    echo
    echo "# Copy certificate bundle"
    echo "scp scripts/ssl/certificates/${device}-bundle.tar.gz remote@${ip}:/tmp/"
    echo
    echo "# Copy updated MonsterBox code (if needed)"
    echo "rsync -av --exclude=node_modules --exclude=.git /home/remote/MonsterBox/ remote@${ip}:/home/remote/MonsterBox/"
    echo
}

show_test_commands() {
    local device="$1"
    local ip="${DEVICES[$device]}"
    
    if [[ -z "$ip" ]]; then
        error "Unknown device: $device"
        echo "Available devices: ${!DEVICES[*]}"
        exit 1
    fi
    
    info "Test commands for $device ($ip):"
    echo
    echo "# Test HTTPS health endpoint"
    echo "curl -k https://${ip}:8080/health"
    echo
    echo "# Test main page"
    echo "curl -k -s https://${ip}:8080/ | head -10"
    echo
    echo "# Test WebSocket services (if wscat is available)"
    echo "wscat -c wss://${ip}:8866 --no-check"
    echo
    echo "# Check service logs"
    echo "ssh remote@${ip} 'tail -20 /home/remote/MonsterBox/app-https.log'"
    echo "ssh remote@${ip} 'tail -20 /home/remote/MonsterBox/jaw-server-https.log'"
    echo "ssh remote@${ip} 'tail -20 /home/remote/MonsterBox/ai-bridge-https.log'"
    echo
}

# Main script logic
case "${1:-}" in
    --help|-h)
        show_help
        ;;
    --list-devices)
        list_devices
        ;;
    --instructions)
        show_instructions
        ;;
    --copy-files)
        if [[ -z "${2:-}" ]]; then
            error "Device name required for --copy-files"
            echo "Usage: $0 --copy-files DEVICE"
            exit 1
        fi
        show_copy_commands "$2"
        ;;
    --test-device)
        if [[ -z "${2:-}" ]]; then
            error "Device name required for --test-device"
            echo "Usage: $0 --test-device DEVICE"
            exit 1
        fi
        show_test_commands "$2"
        ;;
    "")
        info "MonsterBox Manual HTTPS Deployment Guide"
        echo "Use --help for usage information"
        echo "Use --instructions for step-by-step deployment guide"
        ;;
    *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
