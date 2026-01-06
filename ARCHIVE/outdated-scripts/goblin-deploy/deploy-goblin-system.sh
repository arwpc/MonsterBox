#!/bin/bash

# MonsterBox 5.3 - Deploy Goblin System to Both Goblin RPis
# Deploys the Goblin server code, creates systemd service, and starts video streaming

set -e

# Configuration
SSH_USER="remote"
SSH_PASS="klrklr89!"
GOBLIN1_IP="192.168.8.160"
GOBLIN2_IP="192.168.8.161"
GOBLIN_PORT=3001
GOBLIN_DIR="/home/remote/goblin"
SERVICE_NAME="monsterbox-goblin"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Function to check if sshpass is installed
check_sshpass() {
    if ! command -v sshpass &> /dev/null; then
        print_error "sshpass is not installed"
        echo "Install with: sudo apt-get install sshpass"
        exit 1
    fi
    print_success "sshpass is installed"
}

# Function to test SSH connection
test_ssh_connection() {
    local ip=$1
    local name=$2
    
    print_info "Testing SSH connection to $name ($ip)..."
    
    if sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${SSH_USER}@${ip} "echo 'Connected'" >/dev/null 2>&1; then
        print_success "SSH connection to $name successful"
        return 0
    else
        print_error "SSH connection to $name failed"
        return 1
    fi
}

# Function to deploy to a single Goblin
deploy_to_goblin() {
    local ip=$1
    local name=$2
    local goblin_id=$3
    
    print_header "Deploying to $name ($ip)"
    
    # Test SSH connection first
    if ! test_ssh_connection "$ip" "$name"; then
        print_error "Cannot connect to $name - skipping"
        return 1
    fi
    
    # Stop existing service if running
    print_info "Stopping existing Goblin service..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true
        pkill -f 'node.*goblin' || true
    " 2>/dev/null || true
    print_success "Stopped existing services"
    
    # Create goblin directory
    print_info "Creating Goblin directory structure..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        mkdir -p ${GOBLIN_DIR}/src
        mkdir -p ${GOBLIN_DIR}/media/video
        mkdir -p ${GOBLIN_DIR}/media/audio
        mkdir -p ${GOBLIN_DIR}/config
        mkdir -p ${GOBLIN_DIR}/logs
    "
    print_success "Directory structure created"
    
    # Copy source files
    print_info "Copying Goblin source files..."
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no -r goblin-system/src/* ${SSH_USER}@${ip}:${GOBLIN_DIR}/src/
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no goblin-system/package.json ${SSH_USER}@${ip}:${GOBLIN_DIR}/
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no goblin-system/package-lock.json ${SSH_USER}@${ip}:${GOBLIN_DIR}/ 2>/dev/null || true
    print_success "Source files copied"
    
    # Install dependencies
    print_info "Installing Node.js dependencies..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        cd ${GOBLIN_DIR}
        npm install --production 2>&1 | grep -v 'npm WARN' || true
    "
    print_success "Dependencies installed"
    
    # Create configuration file
    print_info "Creating Goblin configuration..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        cat > ${GOBLIN_DIR}/config/goblin.json << 'EOF'
{
  \"goblinId\": \"${goblin_id}\",
  \"version\": \"1.0.0\",
  \"deployment\": {
    \"timestamp\": \"$(date -Iseconds)\",
    \"deployedBy\": \"MonsterBox 5.3 Deployment\",
    \"hostname\": \"$(hostname)\",
    \"ip\": \"${ip}\"
  },
  \"settings\": {
    \"autoStart\": true,
    \"scanFrequency\": 10000,
    \"maxVideoResolution\": \"4K\",
    \"audioOutput\": \"HDMI\",
    \"port\": ${GOBLIN_PORT}
  }
}
EOF
    "
    print_success "Configuration created"
    
    # Create systemd service
    print_info "Creating systemd service..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << 'EOF'
[Unit]
Description=MonsterBox Goblin System
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SSH_USER}
WorkingDirectory=${GOBLIN_DIR}
Environment=NODE_ENV=production
Environment=GOBLIN_ID=${goblin_id}
Environment=GOBLIN_PORT=${GOBLIN_PORT}
ExecStart=/usr/bin/node src/server.js
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
    "
    print_success "Systemd service created"
    
    # Enable and start service
    print_info "Enabling and starting Goblin service..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        sudo systemctl daemon-reload
        sudo systemctl enable ${SERVICE_NAME}
        sudo systemctl start ${SERVICE_NAME}
    "
    print_success "Service started"
    
    # Wait for service to start
    print_info "Waiting for Goblin to start..."
    sleep 5
    
    # Check service status
    print_info "Checking service status..."
    local status=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        systemctl is-active ${SERVICE_NAME}
    " 2>/dev/null || echo "inactive")
    
    if [ "$status" = "active" ]; then
        print_success "$name service is running"
        
        # Test health endpoint
        print_info "Testing health endpoint..."
        if curl -s -f http://${ip}:${GOBLIN_PORT}/health > /dev/null 2>&1; then
            print_success "$name health check passed"
            
            # Show Goblin info
            echo ""
            print_info "$name Information:"
            curl -s http://${ip}:${GOBLIN_PORT}/health | jq '.' 2>/dev/null || curl -s http://${ip}:${GOBLIN_PORT}/health
            echo ""
        else
            print_warning "$name health check failed - may still be starting"
        fi
    else
        print_error "$name service failed to start"
        print_info "Checking logs..."
        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
            sudo journalctl -u ${SERVICE_NAME} -n 20 --no-pager
        "
        return 1
    fi
    
    print_success "$name deployment complete!"
    return 0
}

# Main deployment process
main() {
    print_header "MonsterBox 5.3 - Goblin System Deployment"
    
    echo ""
    print_info "Target Goblins:"
    echo "  - Goblin1: $GOBLIN1_IP"
    echo "  - Goblin2: $GOBLIN2_IP"
    echo ""
    
    # Check prerequisites
    check_sshpass
    
    # Check if goblin-system directory exists
    if [ ! -d "goblin-system" ]; then
        print_error "goblin-system directory not found"
        echo "Please run this script from the MonsterBox root directory"
        exit 1
    fi
    
    print_success "Goblin source files found"
    echo ""
    
    # Deploy to Goblin1
    if deploy_to_goblin "$GOBLIN1_IP" "Goblin1" "goblin-1"; then
        GOBLIN1_SUCCESS=true
    else
        GOBLIN1_SUCCESS=false
    fi
    
    echo ""
    
    # Deploy to Goblin2
    if deploy_to_goblin "$GOBLIN2_IP" "Goblin2" "goblin-2"; then
        GOBLIN2_SUCCESS=true
    else
        GOBLIN2_SUCCESS=false
    fi
    
    echo ""
    print_header "Deployment Summary"
    
    if [ "$GOBLIN1_SUCCESS" = true ]; then
        print_success "Goblin1 ($GOBLIN1_IP): Deployed and running"
        echo "  - Health: http://$GOBLIN1_IP:$GOBLIN_PORT/health"
        echo "  - Status: http://$GOBLIN1_IP:$GOBLIN_PORT/status"
    else
        print_error "Goblin1 ($GOBLIN1_IP): Deployment failed"
    fi
    
    if [ "$GOBLIN2_SUCCESS" = true ]; then
        print_success "Goblin2 ($GOBLIN2_IP): Deployed and running"
        echo "  - Health: http://$GOBLIN2_IP:$GOBLIN_PORT/health"
        echo "  - Status: http://$GOBLIN2_IP:$GOBLIN_PORT/status"
    else
        print_error "Goblin2 ($GOBLIN2_IP): Deployment failed"
    fi
    
    echo ""
    print_info "Useful commands:"
    echo "  - Check status: curl http://GOBLIN_IP:3001/status | jq '.'"
    echo "  - Play video: curl -X POST http://GOBLIN_IP:3001/play-video -H 'Content-Type: application/json' -d '{\"filename\":\"video.mp4\",\"loop\":true}'"
    echo "  - Stop video: curl -X POST http://GOBLIN_IP:3001/stop-all"
    echo "  - View logs: ssh remote@GOBLIN_IP 'sudo journalctl -u monsterbox-goblin -f'"
    echo ""
    
    if [ "$GOBLIN1_SUCCESS" = true ] && [ "$GOBLIN2_SUCCESS" = true ]; then
        print_success "All Goblins deployed successfully! 🎃👻"
        exit 0
    else
        print_warning "Some Goblins failed to deploy"
        exit 1
    fi
}

# Run main function
main

