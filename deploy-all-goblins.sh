#!/bin/bash
# Deploy MonsterBox Goblin System to Multiple Goblins
# Supports deploying to any number of goblins with unique IDs

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PI_USER="${PI_USER:-remote}"
PI_PASS="${PI_PASS:-klrklr89!}"
MONSTERBOX_URL="${MONSTERBOX_URL:-http://192.168.8.200:3000}"

# Goblin configurations (add more as needed)
declare -A GOBLINS
GOBLINS=(
    ["goblin1"]="192.168.8.160"
    ["goblin2"]="192.168.8.161"
    # Add more goblins here:
    # ["goblin3"]="192.168.8.162"
    # ["goblin4"]="192.168.8.163"
    # ["goblin5"]="192.168.8.164"
)

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log_info "Checking deployment dependencies..."
    
    if ! command -v sshpass &> /dev/null; then
        log_error "sshpass not found. Install with: sudo apt install sshpass"
        exit 1
    fi
    
    log_success "Dependencies OK"
}

# Deploy to a single goblin
deploy_goblin() {
    local goblin_id=$1
    local goblin_ip=$2
    
    echo ""
    log_info "========================================="
    log_info "Deploying to $goblin_id ($goblin_ip)"
    log_info "========================================="
    
    # Test connection
    log_info "Testing connection to $goblin_ip..."
    if ! sshpass -p "$PI_PASS" ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$PI_USER@$goblin_ip" "echo 'Connected'" &>/dev/null; then
        log_error "Cannot connect to $goblin_ip"
        return 1
    fi
    log_success "Connection OK"
    
    # Create goblin directory
    log_info "Creating goblin directory..."
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "mkdir -p ~/goblin/media/video" || {
        log_error "Failed to create directory"
        return 1
    }
    
    # Deploy files
    log_info "Deploying goblin files..."
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no goblin-server-edit.js "$PI_USER@$goblin_ip:~/goblin/server.js" || {
        log_error "Failed to deploy server.js"
        return 1
    }
    
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no goblin-mediaPlayer.js "$PI_USER@$goblin_ip:~/goblin/mediaPlayer.js" || {
        log_error "Failed to deploy mediaPlayer.js"
        return 1
    }
    
    # Install dependencies
    log_info "Installing Node.js dependencies..."
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "cd ~/goblin && npm init -y >/dev/null 2>&1 || true"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "cd ~/goblin && npm install express axios >/dev/null 2>&1 || echo 'Express/Axios install may have failed'"
    
    # Create systemd service
    log_info "Creating systemd service..."
    
    cat > /tmp/goblin.service << EOF
[Unit]
Description=MonsterBox Goblin Media Player - $goblin_id
After=network.target

[Service]
Type=simple
User=$PI_USER
WorkingDirectory=/home/$PI_USER/goblin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=GOBLIN_ID=$goblin_id
Environment=MONSTERBOX_URL=$MONSTERBOX_URL
Environment=PORT=3001

# Performance optimizations
Nice=-5
IOSchedulingClass=1
IOSchedulingPriority=4

[Install]
WantedBy=multi-user.target
EOF
    
    sshpass -p "$PI_PASS" scp -o StrictHostKeyChecking=no /tmp/goblin.service "$PI_USER@$goblin_ip:~/goblin/"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "sudo mv ~/goblin/goblin.service /etc/systemd/system/"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "sudo systemctl daemon-reload"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "sudo systemctl enable goblin"
    sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "sudo systemctl restart goblin"
    
    rm /tmp/goblin.service
    
    # Wait for service to start
    log_info "Waiting for service to start..."
    sleep 3
    
    # Test deployment
    log_info "Testing deployment..."
    if sshpass -p "$PI_PASS" ssh "$PI_USER@$goblin_ip" "curl -s http://localhost:3001/health" | grep -q "ok"; then
        log_success "$goblin_id deployed successfully!"
        return 0
    else
        log_error "$goblin_id deployment test failed"
        return 1
    fi
}

# Deploy to all goblins
deploy_all() {
    local success_count=0
    local fail_count=0
    
    echo ""
    log_info "🎃 MonsterBox Multi-Goblin Deployment 🎃"
    log_info "Deploying to ${#GOBLINS[@]} goblins..."
    echo ""
    
    for goblin_id in "${!GOBLINS[@]}"; do
        goblin_ip="${GOBLINS[$goblin_id]}"
        
        if deploy_goblin "$goblin_id" "$goblin_ip"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
    done
    
    echo ""
    log_info "========================================="
    log_info "Deployment Summary"
    log_info "========================================="
    log_success "Successful: $success_count"
    if [ $fail_count -gt 0 ]; then
        log_error "Failed: $fail_count"
    fi
    echo ""
    
    if [ $fail_count -eq 0 ]; then
        log_success "🎉 All goblins deployed successfully!"
        echo ""
        log_info "Next steps:"
        echo "  1. Open http://192.168.8.200:3000/goblin-management"
        echo "  2. Verify all goblins show as 'online'"
        echo "  3. Add videos to each goblin's /home/remote/goblin/media/video/ directory"
        echo "  4. Test playback from Video Library"
        echo ""
        log_info "🎃 Happy Halloween! 🎃"
    else
        log_warning "Some goblins failed to deploy. Check logs above."
    fi
}

# Deploy to specific goblin
deploy_specific() {
    local goblin_id=$1
    
    if [ -z "${GOBLINS[$goblin_id]}" ]; then
        log_error "Unknown goblin: $goblin_id"
        log_info "Available goblins: ${!GOBLINS[@]}"
        exit 1
    fi
    
    deploy_goblin "$goblin_id" "${GOBLINS[$goblin_id]}"
}

# Show usage
show_usage() {
    echo "Usage: $0 [goblin_id]"
    echo ""
    echo "Deploy MonsterBox Goblin system to one or all goblins"
    echo ""
    echo "Options:"
    echo "  (no args)     Deploy to all configured goblins"
    echo "  goblin_id     Deploy to specific goblin (e.g., goblin1, goblin2)"
    echo ""
    echo "Configured goblins:"
    for goblin_id in "${!GOBLINS[@]}"; do
        echo "  - $goblin_id: ${GOBLINS[$goblin_id]}"
    done
    echo ""
    echo "Environment variables:"
    echo "  PI_USER         SSH username (default: remote)"
    echo "  PI_PASS         SSH password (default: klrklr89!)"
    echo "  MONSTERBOX_URL  MonsterBox server URL (default: http://192.168.8.200:3000)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Deploy to all goblins"
    echo "  $0 goblin1            # Deploy to goblin1 only"
    echo "  PI_PASS=mypass $0     # Use custom password"
}

# Main
main() {
    check_dependencies
    
    if [ $# -eq 0 ]; then
        # No arguments - deploy to all
        deploy_all
    elif [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
        show_usage
    else
        # Specific goblin
        deploy_specific "$1"
    fi
}

main "$@"

