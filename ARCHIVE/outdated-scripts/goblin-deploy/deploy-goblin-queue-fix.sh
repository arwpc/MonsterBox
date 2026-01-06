#!/bin/bash

# MonsterBox 5.3 - Deploy Goblin Queue Fix to All Goblins
# Fixes queue start hanging issue and implements auto-start on boot

set -e

# Configuration
SSH_USER="remote"
SSH_PASS="klrklr89!"
GOBLIN_IPS=("192.168.8.40" "192.168.8.106" "192.168.8.14")
GOBLIN_NAMES=("Goblin One" "Goblin Two" "Goblin Three")
GOBLIN_IDS=("goblin-one" "goblin-two" "goblin-three")
GOBLIN_PORT=3001
GOBLIN_DIR="/home/remote/goblin"

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
    
    print_header "Deploying Queue Fix to $name ($ip)"
    
    # Test SSH connection first
    if ! test_ssh_connection "$ip" "$name"; then
        print_error "Cannot connect to $name - skipping"
        return 1
    fi
    
    # Stop existing service
    print_info "Stopping Goblin service..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        sudo systemctl stop goblin 2>/dev/null || true
        pkill -f 'node.*goblin' || true
        sleep 2
    " 2>/dev/null || true
    print_success "Service stopped"
    
    # Copy updated source files
    print_info "Copying updated source files..."
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no goblin-system/src/videoQueue.js ${SSH_USER}@${ip}:${GOBLIN_DIR}/src/
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no goblin-system/src/server.js ${SSH_USER}@${ip}:${GOBLIN_DIR}/src/
    print_success "Source files updated"
    
    # Restart service
    print_info "Starting Goblin service..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        sudo systemctl start goblin
    "
    print_success "Service started"
    
    # Wait for service to start
    print_info "Waiting for Goblin to start..."
    sleep 5
    
    # Check service status
    print_info "Checking service status..."
    local status=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        systemctl is-active goblin
    " 2>/dev/null || echo "inactive")
    
    if [ "$status" = "active" ]; then
        print_success "$name service is running"
        
        # Test health endpoint
        print_info "Testing health endpoint..."
        if curl -s -f http://${ip}:${GOBLIN_PORT}/health > /dev/null 2>&1; then
            print_success "$name health check passed"
            
            # Show Goblin info
            echo ""
            print_info "$name Status:"
            curl -s http://${ip}:${GOBLIN_PORT}/health | jq '.uptime, .memory, .components' 2>/dev/null || echo "OK"
            echo ""
        else
            print_warning "$name health check failed - may still be starting"
        fi
    else
        print_error "$name service failed to start"
        print_info "Checking logs..."
        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
            sudo journalctl -u goblin -n 20 --no-pager
        "
        return 1
    fi
    
    print_success "$name deployment complete!"
    return 0
}

# Main deployment process
main() {
    print_header "MonsterBox 5.3 - Goblin Queue Fix Deployment"
    
    echo ""
    print_info "🎯 FIXES INCLUDED:"
    echo "  ✅ Queue start no longer hangs - returns immediately"
    echo "  ✅ Queue runs in background using setImmediate()"
    echo "  ✅ Queue state persisted to /home/remote/goblin/queue-state.json"
    echo "  ✅ Auto-resume queue after reboot/service restart"
    echo "  ✅ State cleared when queue stops or finishes"
    echo ""
    
    print_info "Target Goblins:"
    for i in "${!GOBLIN_IPS[@]}"; do
        echo "  - ${GOBLIN_NAMES[$i]}: ${GOBLIN_IPS[$i]}"
    done
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
    
    # Deploy to all Goblins
    SUCCESS_COUNT=0
    FAIL_COUNT=0
    
    for i in "${!GOBLIN_IPS[@]}"; do
        if deploy_to_goblin "${GOBLIN_IPS[$i]}" "${GOBLIN_NAMES[$i]}" "${GOBLIN_IDS[$i]}"; then
            ((SUCCESS_COUNT++))
        else
            ((FAIL_COUNT++))
        fi
        echo ""
    done
    
    # Summary
    print_header "Deployment Summary"
    
    for i in "${!GOBLIN_IPS[@]}"; do
        local ip="${GOBLIN_IPS[$i]}"
        local name="${GOBLIN_NAMES[$i]}"
        
        # Check if Goblin is responding
        if curl -s -f http://${ip}:${GOBLIN_PORT}/health > /dev/null 2>&1; then
            print_success "$name ($ip): ✅ Online and healthy"
            echo "  - Health: http://$ip:$GOBLIN_PORT/health"
            echo "  - Status: http://$ip:$GOBLIN_PORT/status"
            echo "  - Queue: http://$ip:$GOBLIN_PORT/queue"
        else
            print_error "$name ($ip): ❌ Not responding"
        fi
    done
    
    echo ""
    print_info "📋 Queue Commands:"
    echo "  Start queue (loop mode):"
    echo "    curl -X POST http://GOBLIN_IP:3001/queue/start \\"
    echo "      -H 'Content-Type: application/json' \\"
    echo "      -d '{\"videos\":[\"video1.mp4\",\"video2.mp4\",\"video3.mp4\"],\"mode\":\"loop\"}'"
    echo ""
    echo "  Check queue status:"
    echo "    curl http://GOBLIN_IP:3001/queue | jq '.'"
    echo ""
    echo "  Stop queue:"
    echo "    curl -X POST http://GOBLIN_IP:3001/queue/stop"
    echo ""
    
    if [ $FAIL_COUNT -eq 0 ]; then
        print_success "All Goblins deployed successfully! 🎃👻"
        print_info "Queue fix is live - test with queue/start endpoint"
        exit 0
    else
        print_warning "$FAIL_COUNT Goblin(s) failed to deploy"
        exit 1
    fi
}

# Run main function
main

