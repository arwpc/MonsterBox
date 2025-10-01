#!/bin/bash

# Quick Deploy to Goblin-1
# Copies files and initiates setup on Goblin-1

set -e

# Configuration
GOBLIN_HOST="goblin1.local"
GOBLIN_USER="remote"
GOBLIN_PASS="klrklr89!"

# Color output
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

print_warning() {
    echo -e "\e[1;33m>>> Warning: $1\e[0m"
}

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           Deploying Goblin System to Goblin-1                   ║"
echo "║           Target: $GOBLIN_USER@$GOBLIN_HOST                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    print_warning "sshpass not installed. Installing..."
    sudo apt-get update
    sudo apt-get install -y sshpass
fi

# Test connectivity
print_status "Testing connectivity to Goblin-1..."
if ping -c 2 -W 5 $GOBLIN_HOST > /dev/null 2>&1; then
    print_success "Goblin-1 is reachable at $GOBLIN_HOST"
else
    print_warning "Ping test inconclusive, trying SSH anyway..."
fi

# Test SSH access
print_status "Testing SSH access..."
if sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 $GOBLIN_USER@$GOBLIN_HOST "echo 'SSH OK'" &> /dev/null; then
    print_success "SSH access confirmed"
else
    print_error "Cannot SSH to Goblin-1"
    print_status "Please check:"
    echo "  - Is SSH enabled on Goblin-1?"
    echo "  - Is the password correct?"
    exit 1
fi

# Copy goblin-system directory
print_status "Copying goblin-system files to Goblin-1..."
sshpass -p "$GOBLIN_PASS" scp -r -o StrictHostKeyChecking=no ../goblin-system $GOBLIN_USER@$GOBLIN_HOST:~/ || {
    print_error "Failed to copy files"
    exit 1
}
print_success "Files copied successfully"

# Run setup script
print_status "Running setup script on Goblin-1..."
echo ""
print_warning "This will take several minutes. Please wait..."
echo ""

sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no $GOBLIN_USER@$GOBLIN_HOST << 'ENDSSH'
cd ~/goblin-system
chmod +x setup-goblin1.sh test-usb-video.sh
./setup-goblin1.sh
ENDSSH

if [ $? -eq 0 ]; then
    print_success "Setup completed successfully!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Next Steps:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  1. SSH into Goblin-1:"
    echo "     ssh pi@$GOBLIN_HOST"
    echo "     Password: $GOBLIN_PASS"
    echo ""
    echo "  2. If hostname or GPU settings changed, reboot:"
    echo "     sudo reboot"
    echo ""
    echo "  3. Start Goblin service:"
    echo "     sudo systemctl start goblin"
    echo ""
    echo "  4. Test video playback:"
    echo "     cd ~/goblin-system"
    echo "     ./test-usb-video.sh"
    echo ""
    echo "  5. Check status:"
    echo "     sudo systemctl status goblin"
    echo "     curl http://localhost:3001/health"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
else
    print_error "Setup failed. Check the output above for errors."
    exit 1
fi

