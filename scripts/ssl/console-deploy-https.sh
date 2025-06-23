#!/bin/bash

# MonsterBox HTTPS Console Deployment Script
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
        warning "Could not copy certificate via SCP, trying alternative method..."
        
        # Alternative: wget from Skulltalker if HTTP is available
        if curl -s -o /tmp/${DEVICE_NAME}.crt http://192.168.8.130:80/ssl-certificates/${DEVICE_NAME}.crt 2>/dev/null; then
            success "Certificate downloaded via HTTP"
        else
            error "Could not copy certificate. Please manually copy certificates first:"
            error "From Skulltalker: scp /home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.* remote@${DEVICE_IP}:/tmp/"
            exit 1
        fi
    fi
    
    if scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no remote@192.168.8.130:/home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.key /tmp/ 2>/dev/null; then
        success "Private key copied successfully"
    else
        error "Could not copy private key. Please manually copy certificates first:"
        error "From Skulltalker: scp /home/remote/MonsterBox/scripts/ssl/certificates/${DEVICE_NAME}.* remote@${DEVICE_IP}:/tmp/"
        exit 1
    fi
}

# Install SSL certificates
install_certificates() {
    info "Installing SSL certificates..."
    
    # Create SSL directory
    sudo mkdir -p /etc/ssl/monsterbox/
    
    # Copy certificates
    sudo cp /tmp/${DEVICE_NAME}.crt /etc/ssl/monsterbox/
    sudo cp /tmp/${DEVICE_NAME}.key /etc/ssl/monsterbox/
    
    # Set proper permissions
    sudo chown root:root /etc/ssl/monsterbox/${DEVICE_NAME}.crt
    sudo chmod 644 /etc/ssl/monsterbox/${DEVICE_NAME}.crt
    sudo chown remote:remote /etc/ssl/monsterbox/${DEVICE_NAME}.key
    sudo chmod 600 /etc/ssl/monsterbox/${DEVICE_NAME}.key
    
    # Create symlinks
    sudo ln -sf /etc/ssl/monsterbox/${DEVICE_NAME}.crt /etc/ssl/monsterbox/server.crt
    sudo ln -sf /etc/ssl/monsterbox/${DEVICE_NAME}.key /etc/ssl/monsterbox/server.key
    
    # Create SSL config
    sudo tee /etc/ssl/monsterbox/ssl-config.json > /dev/null << EOF
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
    
    # Clean up temp files
    rm -f /tmp/${DEVICE_NAME}.*
    
    success "SSL certificates installed successfully"
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
    
    # Fix permissions and install dependencies
    sudo chown -R remote:remote node_modules package-lock.json 2>/dev/null || true
    
    if npm install --no-optional; then
        success "Dependencies updated successfully"
    else
        warning "npm install had issues, but continuing"
    fi
}

# Start MonsterBox services
start_services() {
    info "Starting MonsterBox services..."
    
    # Stop existing processes
    sudo pkill -f "node.*app.js" || true
    sleep 2
    
    # Start MonsterBox with HTTPS
    cd /home/remote/MonsterBox
    info "Starting MonsterBox with HTTPS enabled..."
    info "Command: sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js"
    
    # Start in background
    nohup sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js > /tmp/monsterbox.log 2>&1 &
    
    # Wait for services to start
    sleep 10
    
    success "MonsterBox services started"
}

# Test deployment
test_deployment() {
    info "Testing HTTPS deployment..."
    
    # Test HTTP
    if curl -s http://localhost:80/health | grep -q "healthy"; then
        success "HTTP endpoint working"
    else
        warning "HTTP endpoint test failed"
    fi
    
    # Test HTTPS
    if curl -k -s https://localhost:8080/health | grep -q "healthy"; then
        success "HTTPS endpoint working"
    else
        warning "HTTPS endpoint test failed"
    fi
    
    # Show service status
    if pgrep -f "node.*app.js" > /dev/null; then
        success "MonsterBox app is running"
    else
        error "MonsterBox app is not running"
    fi
}

# Main deployment function
main() {
    echo
    info "🔐 MonsterBox HTTPS Console Deployment"
    info "====================================="
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
    
    success "🎉 HTTPS deployment completed for $DEVICE_NAME!"
    info "Access your device at:"
    info "  HTTP:  http://$DEVICE_IP:80"
    info "  HTTPS: https://$DEVICE_IP:8080"
    echo
    info "To view logs: tail -f /tmp/monsterbox.log"
    info "To check status: curl -k https://localhost:8080/health"
}

# Run main function
main "$@"
