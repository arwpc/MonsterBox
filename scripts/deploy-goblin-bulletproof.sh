#!/bin/bash

###############################################################################
# MonsterBox Goblin Bulletproof Deployment Script
# 
# This script ensures Goblins are deployed correctly and boot into a fully
# operational state with comprehensive validation and error handling.
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GOBLIN_PASSWORD="klrklr89!"
MONSTERBOX_URL="http://192.168.8.140:3000"
DEPLOYMENT_TIMEOUT=120

# Goblin configurations
declare -A GOBLINS
GOBLINS["goblin-one"]="192.168.8.40"
GOBLINS["goblin-two"]="192.168.8.106"
GOBLINS["goblin-three"]="192.168.8.14"

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_section "Checking Prerequisites"
    
    local missing=0
    
    # Check for required commands
    for cmd in sshpass ssh curl jq nc; do
        if ! command -v $cmd &> /dev/null; then
            log_error "Required command not found: $cmd"
            missing=1
        else
            log_success "Found: $cmd"
        fi
    done
    
    if [ $missing -eq 1 ]; then
        log_error "Missing required commands. Install them first."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Test network connectivity
test_connectivity() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_info "Testing connectivity to $goblin_name ($goblin_ip)..."
    
    if ping -c 1 -W 2 $goblin_ip > /dev/null 2>&1; then
        log_success "Network connectivity OK"
        return 0
    else
        log_error "Cannot reach $goblin_name at $goblin_ip"
        return 1
    fi
}

# Deploy code to Goblin
deploy_code() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_info "Deploying code to $goblin_name..."
    
    # Stop service first
    log_info "Stopping Goblin service..."
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "sudo systemctl stop goblin" 2>/dev/null || true
    
    # Pull latest code
    log_info "Pulling latest code from git..."
    if sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "cd /home/remote/MonsterBox && git pull origin main" 2>&1 | grep -q "Already up to date"; then
        log_info "Code already up to date"
    else
        log_success "Code updated"
    fi
    
    # Copy goblin-system to /home/remote/goblin
    log_info "Copying goblin-system files..."
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "rsync -av --delete /home/remote/MonsterBox/goblin-system/ /home/remote/goblin/ --exclude=node_modules --exclude=logs --exclude=media"
    
    # Install/update dependencies
    log_info "Installing dependencies..."
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "cd /home/remote/goblin && npm install --production" > /dev/null 2>&1
    
    log_success "Code deployed"
}

# Deploy systemd service
deploy_service() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_info "Deploying systemd service..."
    
    # Create service file with correct configuration
    local service_content="[Unit]
Description=MonsterBox Goblin Media Player
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/goblin
Environment=\"GOBLIN_ID=$goblin_name\"
Environment=\"GOBLIN_PORT=3001\"
Environment=\"NODE_ENV=production\"
Environment=\"MONSTERBOX_URL=$MONSTERBOX_URL\"

ExecStart=/usr/bin/node /home/remote/goblin/src/server.js

Restart=always
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=15

LimitNOFILE=65536
LimitNPROC=4096

StandardOutput=append:/home/remote/goblin/logs/goblin.log
StandardError=append:/home/remote/goblin/logs/goblin-error.log
SyslogIdentifier=goblin

NoNewPrivileges=true
PrivateTmp=true

WatchdogSec=60

[Install]
WantedBy=multi-user.target"
    
    # Deploy service file
    echo "$service_content" | sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "sudo tee /etc/systemd/system/goblin.service > /dev/null"
    
    # Reload systemd
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "sudo systemctl daemon-reload"
    
    # Enable service
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "sudo systemctl enable goblin"
    
    log_success "Service deployed and enabled"
}

# Start Goblin service
start_service() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_info "Starting Goblin service..."
    
    # Clear old logs
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "mkdir -p /home/remote/goblin/logs && > /home/remote/goblin/logs/goblin.log && > /home/remote/goblin/logs/goblin-error.log"
    
    # Start service
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "sudo systemctl restart goblin"
    
    log_success "Service started"
}

# Verify Goblin is running
verify_goblin() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_info "Verifying Goblin is running..."
    
    # Wait for service to start
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        # Check if port is open
        if nc -z -w 2 $goblin_ip 3001 2>/dev/null; then
            log_success "Port 3001 is open"
            break
        fi
        
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            log_error "Port 3001 did not open after $max_attempts attempts"
            return 1
        fi
        
        sleep 1
    done
    
    # Check health endpoint
    log_info "Checking health endpoint..."
    local health_response=$(curl -s -m 5 http://$goblin_ip:3001/health 2>/dev/null || echo "")
    
    if [ -z "$health_response" ]; then
        log_error "Health endpoint not responding"
        return 1
    fi
    
    local status=$(echo "$health_response" | jq -r '.status' 2>/dev/null || echo "")
    
    if [ "$status" = "healthy" ]; then
        log_success "Health check passed"
        
        # Display health info
        local uptime=$(echo "$health_response" | jq -r '.uptime' 2>/dev/null || echo "unknown")
        local goblin_id=$(echo "$health_response" | jq -r '.goblinId' 2>/dev/null || echo "unknown")
        log_info "Goblin ID: $goblin_id"
        log_info "Uptime: ${uptime}s"
        
        return 0
    else
        log_error "Health check failed: status=$status"
        return 1
    fi
}

# Show service status and logs
show_status() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_info "Service status:"
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "sudo systemctl status goblin --no-pager -l" | head -20
    
    echo ""
    log_info "Recent logs:"
    sshpass -p "$GOBLIN_PASSWORD" ssh -o StrictHostKeyChecking=no remote@$goblin_ip \
        "tail -20 /home/remote/goblin/logs/goblin.log"
}

# Deploy single Goblin
deploy_goblin() {
    local goblin_name=$1
    local goblin_ip=$2
    
    log_section "Deploying $goblin_name ($goblin_ip)"
    
    if ! test_connectivity "$goblin_name" "$goblin_ip"; then
        log_error "Skipping $goblin_name - not reachable"
        return 1
    fi
    
    deploy_code "$goblin_name" "$goblin_ip"
    deploy_service "$goblin_name" "$goblin_ip"
    start_service "$goblin_name" "$goblin_ip"
    
    sleep 3
    
    if verify_goblin "$goblin_name" "$goblin_ip"; then
        log_success "$goblin_name deployed successfully! 🎃"
        return 0
    else
        log_error "$goblin_name deployment verification failed"
        show_status "$goblin_name" "$goblin_ip"
        return 1
    fi
}

# Main deployment
main() {
    log_section "MonsterBox Goblin Bulletproof Deployment"
    
    check_prerequisites
    
    local success_count=0
    local fail_count=0
    
    for goblin_name in "${!GOBLINS[@]}"; do
        goblin_ip="${GOBLINS[$goblin_name]}"
        
        if deploy_goblin "$goblin_name" "$goblin_ip"; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi
    done
    
    log_section "Deployment Summary"
    log_success "Successful: $success_count"
    if [ $fail_count -gt 0 ]; then
        log_error "Failed: $fail_count"
    fi
    
    if [ $fail_count -eq 0 ]; then
        log_success "All Goblins deployed successfully! 🎃👻🎃"
        exit 0
    else
        log_error "Some Goblins failed to deploy"
        exit 1
    fi
}

# Run main
main

