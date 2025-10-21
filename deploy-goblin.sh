#!/bin/bash

# MonsterBox Goblin Deployment Script
# Deploy Goblin video system to Raspberry Pi

echo "🎃 MonsterBox Goblin Deployment"
echo "================================"

# Accept IP address as parameter, default to Goblin1
PI_IP="${1:-192.168.8.40}"
PI_USER="remote"
PI_PASS="klrklr89!"

# Determine Goblin ID from IP
case "$PI_IP" in
    "192.168.8.40")
        GOBLIN_ID="goblin-one"
        GOBLIN_NAME="Goblin1"
        ;;
    "192.168.8.106")
        GOBLIN_ID="goblin-two"
        GOBLIN_NAME="Goblin2"
        ;;
    "192.168.8.14")
        GOBLIN_ID="goblin-three"
        GOBLIN_NAME="Goblin3"
        ;;
    *)
        GOBLIN_ID="goblin-unknown"
        GOBLIN_NAME="Unknown Goblin"
        ;;
esac

echo "Target: $GOBLIN_NAME ($GOBLIN_ID) at $PI_IP"
echo

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

# Test connection to Goblin
test_connection() {
    log_info "Testing connection to $GOBLIN_NAME..."

    if sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$PI_USER@$PI_IP" "echo 'Connected'" &>/dev/null; then
        log_info "Connection to $PI_IP successful"
    else
        log_error "Cannot connect to $GOBLIN_NAME at $PI_IP. Check network and credentials."
        exit 1
    fi
}

# Package Goblin files
package_goblin() {
    log_info "Packaging Goblin files..."

    cd goblin-gold
    tar czf /tmp/goblin-deploy.tar.gz server.js package.json src/ systemd/
    cd ..

    log_info "Goblin package created"
}

# Deploy Goblin files
deploy_goblin() {
    log_info "Deploying Goblin to $GOBLIN_NAME..."

    # Copy package to Goblin
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no /tmp/goblin-deploy.tar.gz "$PI_USER@$PI_IP:/tmp/goblin.tar.gz"
    log_info "Package transferred"

    # Copy setup scripts from Goblin3 (reference system)
    log_info "Copying setup scripts..."
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no remote@192.168.8.14:/usr/local/bin/goblin-setup.sh /tmp/goblin-setup.sh
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no remote@192.168.8.14:/usr/local/bin/goblin-autostart.sh /tmp/goblin-autostart.sh

    # Transfer setup scripts to target Goblin
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no /tmp/goblin-setup.sh /tmp/goblin-autostart.sh "$PI_USER@$PI_IP:/tmp/"
    log_info "Setup scripts transferred"
}

# Install Goblin on target
install_goblin() {
    log_info "Installing Goblin on $GOBLIN_NAME..."

    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_IP" bash << 'EOFREMOTE'
# Stop old service
sudo systemctl stop goblin 2>/dev/null || true

# Extract new files
cd /home/remote
rm -rf goblin
mkdir -p goblin
cd goblin
tar xzf /tmp/goblin.tar.gz

# Install dependencies
npm install --production

# Copy setup scripts
sudo cp /tmp/goblin-setup.sh /usr/local/bin/
sudo cp /tmp/goblin-autostart.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/goblin-setup.sh
sudo chmod +x /usr/local/bin/goblin-autostart.sh

# Install systemd service
sudo cp systemd/goblin.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable goblin
sudo systemctl start goblin

echo "Installation complete"
EOFREMOTE

    log_info "Goblin installed and started"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."

    # Wait for service to start
    sleep 5

    # Check systemd status
    log_info "Checking service status..."
    sshpass -p "$PI_PASS" ssh "$PI_USER@$PI_IP" "systemctl status goblin --no-pager" || true

    # Check API health
    log_info "Checking API health..."
    sleep 2
    HEALTH=$(curl -s http://$PI_IP:3001/health 2>/dev/null || echo "failed")

    if echo "$HEALTH" | grep -q "healthy"; then
        log_info "✅ Goblin API is healthy"
    else
        log_warn "⚠️  Goblin API health check failed"
    fi
}

# Main deployment
main() {
    echo
    log_info "Starting MonsterBox Goblin deployment to $GOBLIN_NAME..."

    check_dependencies
    test_connection
    package_goblin
    deploy_goblin
    install_goblin
    verify_deployment

    echo
    log_info "🎉 Deployment completed!"
    echo
    echo "Goblin Details:"
    echo "  Name: $GOBLIN_NAME"
    echo "  ID: $GOBLIN_ID"
    echo "  IP: $PI_IP"
    echo "  API: http://$PI_IP:3001"
    echo
    echo "Useful Commands:"
    echo "  Check status:  sshpass -p '$PI_PASS' ssh $PI_USER@$PI_IP 'systemctl status goblin'"
    echo "  View logs:     sshpass -p '$PI_PASS' ssh $PI_USER@$PI_IP 'journalctl -u goblin -f'"
    echo "  Restart:       sshpass -p '$PI_PASS' ssh $PI_USER@$PI_IP 'sudo systemctl restart goblin'"
    echo
}

# Show usage if help requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [IP_ADDRESS]"
    echo
    echo "Deploy Goblin video system to a Raspberry Pi"
    echo
    echo "Arguments:"
    echo "  IP_ADDRESS    IP address of target Goblin (default: 192.168.8.40)"
    echo
    echo "Known Goblins:"
    echo "  192.168.8.40  - Goblin1 (goblin-one)"
    echo "  192.168.8.106 - Goblin2 (goblin-two)"
    echo "  192.168.8.14  - Goblin3 (goblin-three)"
    echo
    echo "Examples:"
    echo "  $0                    # Deploy to Goblin1 (default)"
    echo "  $0 192.168.8.106      # Deploy to Goblin2"
    echo "  $0 192.168.8.14       # Deploy to Goblin3"
    echo
    exit 0
fi

main "$@"