#!/bin/bash
# Force pull latest MonsterBox version to all animatronics
# WARNING: This will overwrite any local changes!

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}>>> $1${NC}"
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

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# SSH credentials
SSH_USER="remote"
SSH_PASS="klrklr89!"

# Animatronic hosts (from documentation)
declare -A ANIMATRONICS=(
    ["Orlok"]="192.168.8.120"
    ["PumpkinHead"]="192.168.8.150"
    ["Coffin"]="192.168.8.140"
    ["Skulltalker"]="192.168.8.130"
    ["Groundbreaker"]="192.168.8.200"
)

# MonsterBox directory
MONSTERBOX_DIR="/home/remote/MonsterBox"

print_header "Force Pull MonsterBox to All Animatronics"

print_warning "This will OVERWRITE any local changes on all animatronics!"
echo "Press Ctrl+C within 5 seconds to cancel..."
sleep 5

# Track results
TOTAL=0
SUCCESS=0
FAILED=0

# Function to force pull on a single animatronic
force_pull_animatronic() {
    local name=$1
    local ip=$2
    
    print_header "Processing: $name ($ip)"
    TOTAL=$((TOTAL + 1))
    
    # Test SSH connection
    print_status "Testing SSH connection..."
    if ! sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${SSH_USER}@${ip} "echo 'Connected'" >/dev/null 2>&1; then
        print_error "$name: SSH connection failed"
        FAILED=$((FAILED + 1))
        return 1
    fi
    print_success "$name: SSH connection successful"
    
    # Kill any running MonsterBox instances
    print_status "Killing running MonsterBox instances..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        cd $MONSTERBOX_DIR 2>/dev/null || exit 0
        pkill -f 'node.*server.js' || true
        pkill -f 'node.*server-test.js' || true
    " 2>/dev/null || true
    print_success "$name: Stopped running instances"
    
    # Force pull latest version
    print_status "Force pulling latest version from Git..."
    if sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        cd $MONSTERBOX_DIR || exit 1
        
        # Fetch latest
        git fetch origin main || exit 1
        
        # Reset to origin/main (discard local changes)
        git reset --hard origin/main || exit 1
        
        # Clean untracked files
        git clean -fd || exit 1
        
        # Show current commit
        echo ''
        echo 'Current commit:'
        git log -1 --oneline
    "; then
        print_success "$name: Successfully pulled latest version"
        SUCCESS=$((SUCCESS + 1))
    else
        print_error "$name: Failed to pull latest version"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verify npm dependencies
    print_status "Checking npm dependencies..."
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        cd $MONSTERBOX_DIR || exit 1
        if [ ! -d 'node_modules' ]; then
            echo 'Installing npm dependencies...'
            npm install
        fi
    " 2>&1 | grep -v "npm WARN" || true
    
    print_success "$name: Update complete!"
    echo ""
}

# Process each animatronic
for name in "${!ANIMATRONICS[@]}"; do
    ip="${ANIMATRONICS[$name]}"
    force_pull_animatronic "$name" "$ip" || true
done

# Summary
print_header "Update Summary"

echo "Total animatronics: $TOTAL"
echo "Successful: $SUCCESS"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    print_success "ALL ANIMATRONICS UPDATED SUCCESSFULLY! ✅"
    echo ""
    echo "All animatronics are now running MonsterBox 5.2"
    echo ""
    echo "To start MonsterBox on each animatronic:"
    echo "  ssh remote@<ip> 'cd /home/remote/MonsterBox && ./start-monsterbox.sh'"
    echo ""
    exit 0
else
    print_error "SOME UPDATES FAILED! ❌"
    echo ""
    echo "Check the output above for details."
    echo ""
    exit 1
fi

