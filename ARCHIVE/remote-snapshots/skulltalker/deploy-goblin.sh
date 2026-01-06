#!/bin/bash

# MonsterBox Goblin - Pi3B Deployment Script
# Deploy native Goblin service to Raspberry Pi 3B

echo "🎃 MonsterBox Goblin Pi3B Deployment"
echo "===================================="

PI_HOST="chestwound.local"
PI_IP="192.168.8.160"
PI_USER="remote"
PI_PASS="klrklr89!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log_info "Checking deployment dependencies..."
    
    if ! command -v sshpass &> /dev/null; then
        log_error "sshpass not found. Install with: sudo apt install sshpass"
        exit 1
    fi
    
    if ! command -v rsync &> /dev/null; then
        log_error "rsync not found. Install with: sudo apt install rsync"
        exit 1
    fi
    
    log_info "Dependencies OK"
}

# Test connection to Pi3B
test_connection() {
    log_info "Testing connection to Pi3B..."
    
    if sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$PI_USER@$PI_HOST" "echo 'Connected to Pi3B'" &>/dev/null; then
        log_info "Connection to $PI_HOST successful"
    else
        log_warn "Connection to $PI_HOST failed, trying IP address..."
        if sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$PI_USER@$PI_IP" "echo 'Connected to Pi3B'" &>/dev/null; then
            log_info "Connection to $PI_IP successful"
            PI_HOST="$PI_IP"
        else
            log_error "Cannot connect to Pi3B. Check network and credentials."
            exit 1
        fi
    fi
}

# Deploy Goblin files
deploy_goblin() {
    log_info "Deploying Goblin to Pi3B..."
    
    # Create directory structure on Pi
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "mkdir -p ~/goblin/{media/{video,audio},logs}"
    
    # Copy Goblin launcher
    if scp -o StrictHostKeyChecking=no goblin-pi.js "$PI_USER@$PI_HOST:~/goblin/" 2>/dev/null; then
        log_info "Goblin launcher deployed"
    else
        # Fallback to sshpass
        sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no goblin-pi.js "$PI_USER@$PI_HOST:~/goblin/"
        log_info "Goblin launcher deployed (via sshpass)"
    fi
    
    # Make executable
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "chmod +x ~/goblin/goblin-pi.js"
    
    # Copy test media files
    log_info "Copying test media files..."
    
    if [ -f "docs/fire.mp4" ]; then
        sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no "docs/fire.mp4" "$PI_USER@$PI_HOST:~/goblin/media/video/"
        log_info "fire.mp4 deployed"
    fi
    
    if [ -f "docs/water.mp4" ]; then
        sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no "docs/water.mp4" "$PI_USER@$PI_HOST:~/goblin/media/video/"
        log_info "water.mp4 deployed"
    fi
}

# Install dependencies on Pi
install_dependencies() {
    log_info "Installing Node.js dependencies on Pi3B..."
    
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "cd ~/goblin && npm init -y >/dev/null 2>&1 || true"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "cd ~/goblin && npm install express axios >/dev/null 2>&1 || echo 'Express/Axios install failed'"
    
    log_info "Dependencies installed"
}

# Create systemd service
create_service() {
    log_info "Creating systemd service..."
    
    cat > goblin.service << 'EOF'
[Unit]
Description=MonsterBox Goblin - Pi3B Media Player
After=network.target sound.target

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/goblin
ExecStart=/usr/bin/node goblin-pi.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=GOBLIN_ID=chestwound-window-1

# Performance optimizations
Nice=-5
IOSchedulingClass=1
IOSchedulingPriority=4

[Install]
WantedBy=multi-user.target
EOF

    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no goblin.service "$PI_USER@$PI_HOST:~/goblin/"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "sudo mv ~/goblin/goblin.service /etc/systemd/system/"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "sudo systemctl daemon-reload"
    
    rm goblin.service
    log_info "Systemd service created"
}

# Test deployment
test_deployment() {
    log_info "Testing Goblin deployment..."
    
    # Test direct run
    log_info "Testing direct run (will timeout in 10 seconds)..."
    timeout 10s sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_HOST" "cd ~/goblin && node goblin-pi.js" || true
    
    log_info "Direct run test completed"
}

# Main deployment
main() {
    echo
    log_info "Starting MonsterBox Goblin deployment to Pi3B..."
    
    check_dependencies
    test_connection
    deploy_goblin
    install_dependencies
    create_service
    test_deployment
    
    echo
    log_info "🎉 Deployment completed!"
    echo
    echo "To start the Goblin service:"
    echo "  sshpass -p '$PI_PASS' ssh $PI_USER@$PI_HOST 'sudo systemctl start goblin'"
    echo
    echo "To check status:"
    echo "  sshpass -p '$PI_PASS' ssh $PI_USER@$PI_HOST 'sudo systemctl status goblin'"
    echo
    echo "To view logs:"
    echo "  sshpass -p '$PI_PASS' ssh $PI_USER@$PI_HOST 'sudo journalctl -u goblin -f'"
    echo
    echo "To test manually:"
    echo "  sshpass -p '$PI_PASS' ssh $PI_USER@$PI_HOST 'cd ~/goblin && node goblin-pi.js'"
    echo
    echo "Goblin will be available at: http://$PI_HOST:3001"
    echo
}

main "$@"