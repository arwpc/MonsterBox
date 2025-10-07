#!/bin/bash

# Enable SSH Access for GroundBreaker
# Run this script directly on GroundBreaker with physical console access
# Usage: sudo bash scripts/enable-ssh-access.sh

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}>>> $1${NC}"; }
print_error() { echo -e "${RED}>>> Error: $1${NC}"; }
print_success() { echo -e "${GREEN}>>> Success: $1${NC}"; }
print_warning() { echo -e "${YELLOW}>>> Warning: $1${NC}"; }
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root: sudo bash scripts/enable-ssh-access.sh"
    exit 1
fi

print_header "Enable SSH Access for GroundBreaker"

# Backup SSH config
print_status "Backing up SSH configuration..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)
print_success "Backup created"

# Enable password authentication
print_status "Enabling password authentication..."
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Ensure PasswordAuthentication yes is in the file
if ! grep -q "^PasswordAuthentication yes" /etc/ssh/sshd_config; then
    echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config
fi

print_success "Password authentication enabled"

# Enable PubkeyAuthentication (should already be enabled)
print_status "Ensuring public key authentication is enabled..."
sed -i 's/^#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
if ! grep -q "^PubkeyAuthentication yes" /etc/ssh/sshd_config; then
    echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config
fi
print_success "Public key authentication enabled"

# Restart SSH service
print_status "Restarting SSH service..."
systemctl restart sshd
print_success "SSH service restarted"

# Verify SSH is running
if systemctl is-active --quiet sshd; then
    print_success "SSH service is running"
else
    print_error "SSH service failed to start"
    print_status "Checking SSH service status..."
    systemctl status sshd --no-pager
    exit 1
fi

# Display current SSH configuration
print_header "Current SSH Configuration"
echo "Password Authentication: $(grep "^PasswordAuthentication" /etc/ssh/sshd_config)"
echo "Public Key Authentication: $(grep "^PubkeyAuthentication" /etc/ssh/sshd_config)"

# Get IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}')

print_header "SSH Access Enabled!"
print_success "You can now SSH into GroundBreaker from other machines"
echo ""
print_status "Connection details:"
echo "  Host: $IP_ADDRESS (groundbreaker.lan)"
echo "  User: remote"
echo "  Password: klrklr89!"
echo ""
print_status "Test SSH connection from another machine:"
echo "  ssh remote@$IP_ADDRESS"
echo "  ssh remote@groundbreaker.lan"
echo ""
print_status "Or copy SSH key from another machine:"
echo "  ssh-copy-id remote@$IP_ADDRESS"
echo ""

