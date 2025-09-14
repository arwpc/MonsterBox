#!/bin/bash

# MonsterBox HTTPS Console Deployment Script (No Sudo Version)
# Run this script on each device console (Orlok, Coffin, Pumpkinhead)

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

# Auto-detect device
detect_device() {
    local hostname=$(hostname)
    local ip=$(hostname -I | awk '{print $1}')
    
    info "Detecting current device..."
    info "Hostname: $hostname"
    info "IP Address: $ip"
    
    case "$hostname" in
        "orlok")
            DEVICE_NAME="orlok"
            DEVICE_IP="192.168.8.120"
            ;;
        "coffin")
            DEVICE_NAME="coffin"
            DEVICE_IP="192.168.8.140"
            ;;
        "pumpkinhead")
            DEVICE_NAME="pumpkinhead"
            DEVICE_IP="192.168.8.200"
            ;;
        "skulltalker")
            error "Skulltalker already has HTTPS configured!"
            exit 1
            ;;
        *)
            error "Unknown device: $hostname"
            error "This script is for Orlok, Coffin, or Pumpkinhead only"
            exit 1
            ;;
    esac
    
    success "Detected device: $DEVICE_NAME ($DEVICE_IP)"
}

# Copy certificates from Skulltalker
copy_certificates() {
    info "Copying SSL certificates from Skulltalker..."
    
    # Try to copy certificates from Skulltalker
    if scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no remote@192.168.8.130:/home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.crt /tmp/ 2>/dev/null; then
        success "Certificate copied successfully"
    else
        warning "Could not copy certificate via SCP"
        info "Please manually copy certificates first:"
        info "From Skulltalker run: scp /home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.* remote@${DEVICE_IP}:/tmp/"
        info "Then press Enter to continue..."
        read -r
    fi
    
    if scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no remote@192.168.8.130:/home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.key /tmp/ 2>/dev/null; then
        success "Private key copied successfully"
    else
        warning "Could not copy private key"
        info "Please manually copy certificates first:"
        info "From Skulltalker run: scp /home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.* remote@${DEVICE_IP}:/tmp/"
        info "Then press Enter to continue..."
        read -r
    fi
}

# Install SSL certificates (with manual sudo commands)
install_certificates() {
    info "Installing SSL certificates..."
    info "You will need to run these commands manually with sudo:"
    echo
    
    echo -e "${YELLOW}# Create SSL directory${NC}"
    echo "sudo mkdir -p /etc/ssl/monsterbox/"
    echo
    
    echo -e "${YELLOW}# Copy certificates${NC}"
    echo "sudo cp /tmp/${DEVICE_NAME}.crt /etc/ssl/monsterbox/"
    echo "sudo cp /tmp/${DEVICE_NAME}.key /etc/ssl/monsterbox/"
    echo
    
    echo -e "${YELLOW}# Set permissions${NC}"
    echo "sudo chown root:root /etc/ssl/monsterbox/${DEVICE_NAME}.crt"
    echo "sudo chmod 644 /etc/ssl/monsterbox/${DEVICE_NAME}.crt"
    echo "sudo chown remote:remote /etc/ssl/monsterbox/${DEVICE_NAME}.key"
    echo "sudo chmod 600 /etc/ssl/monsterbox/${DEVICE_NAME}.key"
    echo
    
    echo -e "${YELLOW}# Create symlinks${NC}"
    echo "sudo ln -sf /etc/ssl/monsterbox/${DEVICE_NAME}.crt /etc/ssl/monsterbox/server.crt"
    echo "sudo ln -sf /etc/ssl/monsterbox/${DEVICE_NAME}.key /etc/ssl/monsterbox/server.key"
    echo
    
    echo -e "${YELLOW}# Create SSL config${NC}"
    echo "sudo tee /etc/ssl/monsterbox/ssl-config.json > /dev/null << 'EOF'"
    cat << EOF
{
  "device": "${DEVICE_NAME}",
  "certificates": {
    "key": "/etc/ssl/monsterbox/${DEVICE_NAME}.key",
    "cert": "/etc/ssl/monsterbox/${DEVICE_NAME}.crt",
    "keySymlink": "/etc/ssl/monsterbox/server.key",
    "certSymlink": "/etc/ssl/monsterbox/server.crt"
  },
  "https": {
    "enabled": true,
    "port": 8080,
    "redirectHttp": true
  },
  "websocket": {
    "secure": true,
    "port": 8765
  },
  "installation": {
    "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "1.0.0"
  }
}
EOF
    echo "EOF"
    echo
    
    echo -e "${YELLOW}# Clean up temp files${NC}"
    echo "rm -f /tmp/${DEVICE_NAME}.*"
    echo
    
    info "Please run the above commands, then press Enter to continue..."
    read -r
    
    success "SSL certificates should now be installed"
}

# Update MonsterBox code
update_code() {
    info "Updating MonsterBox code..."
    
    cd /home/remote/MonsterBox
    
    # Pull latest changes
    if git pull; then
        success "Code updated successfully"
    else
        warning "Git pull failed, continuing with existing code"
    fi
    
    # Install dependencies (no sudo needed)
    if npm install --no-optional; then
        success "Dependencies updated successfully"
    else
        warning "npm install had issues, but continuing"
    fi
}

# Start MonsterBox services
start_services() {
    info "Starting MonsterBox services..."
    
    # Stop existing processes (manual command)
    info "First, stop any existing MonsterBox processes:"
    echo "sudo pkill -f \"node.*app.js\" || true"
    info "Run the above command, then press Enter to continue..."
    read -r
    
    # Start MonsterBox with HTTPS
    cd /home/remote/MonsterBox
    info "Now starting MonsterBox with HTTPS enabled..."
    info "Run this command:"
    echo "sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js"
    echo
    info "This will start the MonsterBox app with HTTPS support."
    info "Leave it running and open a new terminal to test."
}

# Test deployment
test_deployment() {
    info "Testing HTTPS deployment..."
    info "Open a new terminal and run these test commands:"
    echo
    echo "# Test HTTP"
    echo "curl -s http://localhost:80/health"
    echo
    echo "# Test HTTPS"
    echo "curl -k -s https://localhost:8080/health"
    echo
    info "Both should return a JSON response with 'status': 'healthy'"
}

# Main deployment function
main() {
    echo
    info "🔐 MonsterBox HTTPS Console Deployment (No Sudo)"
    info "================================================"
    echo
    
    detect_device
    echo
    
    copy_certificates
    echo
    
    install_certificates
    echo
    
    update_code
    echo
    
    start_services
    echo
    
    test_deployment
    echo
    
    success "🎉 HTTPS deployment guide completed for $DEVICE_NAME!"
    info "Your device should now be accessible at:"
    info "  HTTP:  http://$DEVICE_IP:80"
    info "  HTTPS: https://$DEVICE_IP:8080"
}

# Run main function
main "$@"
