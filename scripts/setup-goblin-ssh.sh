#!/bin/bash

# MonsterBox 5.3 - Setup SSH Access for Goblins
# Deploys SSH keys and enables passwordless SSH access

set -e

# Configuration
SSH_USER="remote"
SSH_PASS="klrklr89!"
GOBLIN_IPS=("192.168.8.40" "192.168.8.106" "192.168.8.14")
GOBLIN_NAMES=("Goblin One" "Goblin Two" "Goblin Three")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if sshpass is installed
check_sshpass() {
    if ! command -v sshpass &> /dev/null; then
        print_error "sshpass is not installed"
        echo "Install with: sudo apt-get install sshpass"
        exit 1
    fi
    print_success "sshpass is installed"
}

# Check if SSH key exists, create if not
check_ssh_key() {
    if [ ! -f ~/.ssh/id_rsa ]; then
        print_info "No SSH key found, generating new key..."
        ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -C "monsterbox@$(hostname)"
        print_success "SSH key generated"
    else
        print_success "SSH key exists"
    fi
}

# Test SSH connection with password
test_password_ssh() {
    local ip=$1
    local name=$2
    
    print_info "Testing password SSH to $name ($ip)..."
    
    if sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${SSH_USER}@${ip} "echo 'Connected'" >/dev/null 2>&1; then
        print_success "Password SSH to $name works"
        return 0
    else
        print_error "Password SSH to $name failed"
        return 1
    fi
}

# Deploy SSH key to Goblin
deploy_ssh_key() {
    local ip=$1
    local name=$2
    
    print_header "Setting up SSH for $name ($ip)"
    
    # Test password SSH first
    if ! test_password_ssh "$ip" "$name"; then
        print_error "Cannot connect to $name - skipping"
        return 1
    fi
    
    # Copy SSH key
    print_info "Copying SSH key to $name..."
    if sshpass -p "$SSH_PASS" ssh-copy-id -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa.pub ${SSH_USER}@${ip} >/dev/null 2>&1; then
        print_success "SSH key copied to $name"
    else
        print_warning "ssh-copy-id failed, trying manual method..."
        
        # Manual method: create .ssh directory and append key
        sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
            mkdir -p ~/.ssh
            chmod 700 ~/.ssh
            touch ~/.ssh/authorized_keys
            chmod 600 ~/.ssh/authorized_keys
        " 2>/dev/null
        
        # Append public key
        cat ~/.ssh/id_rsa.pub | sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
            cat >> ~/.ssh/authorized_keys
            sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys
        " 2>/dev/null
        
        print_success "SSH key manually deployed to $name"
    fi
    
    # Test passwordless SSH
    print_info "Testing passwordless SSH..."
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes ${SSH_USER}@${ip} "echo 'Passwordless SSH works'" >/dev/null 2>&1; then
        print_success "Passwordless SSH to $name works! 🎉"
        return 0
    else
        print_warning "Passwordless SSH test failed, but key was deployed"
        return 1
    fi
}

# Enable SSH on Goblin (if needed)
enable_ssh_on_goblin() {
    local ip=$1
    local name=$2
    
    print_info "Ensuring SSH is enabled on $name..."
    
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${ip} "
        # Backup SSH config
        sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
        
        # Enable password authentication
        sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
        sudo sed -i 's/^#PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
        
        # Enable public key authentication
        sudo sed -i 's/^#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
        
        # Restart SSH
        sudo systemctl restart sshd || sudo systemctl restart ssh
        
        echo 'SSH configured'
    " 2>/dev/null
    
    print_success "SSH enabled on $name"
}

# Main process
main() {
    print_header "MonsterBox 5.3 - Goblin SSH Setup"
    
    echo ""
    print_info "This script will:"
    echo "  1. Check/generate SSH key on this machine"
    echo "  2. Deploy SSH key to all Goblins"
    echo "  3. Enable passwordless SSH access"
    echo ""
    
    print_info "Target Goblins:"
    for i in "${!GOBLIN_IPS[@]}"; do
        echo "  - ${GOBLIN_NAMES[$i]}: ${GOBLIN_IPS[$i]}"
    done
    echo ""
    
    # Check prerequisites
    check_sshpass
    check_ssh_key
    
    echo ""
    
    # Deploy to all Goblins
    SUCCESS_COUNT=0
    FAIL_COUNT=0
    
    for i in "${!GOBLIN_IPS[@]}"; do
        # Enable SSH first
        if test_password_ssh "${GOBLIN_IPS[$i]}" "${GOBLIN_NAMES[$i]}"; then
            enable_ssh_on_goblin "${GOBLIN_IPS[$i]}" "${GOBLIN_NAMES[$i]}"
        fi
        
        # Deploy SSH key
        if deploy_ssh_key "${GOBLIN_IPS[$i]}" "${GOBLIN_NAMES[$i]}"; then
            ((SUCCESS_COUNT++))
        else
            ((FAIL_COUNT++))
        fi
        echo ""
    done
    
    # Summary
    print_header "SSH Setup Summary"
    
    for i in "${!GOBLIN_IPS[@]}"; do
        local ip="${GOBLIN_IPS[$i]}"
        local name="${GOBLIN_NAMES[$i]}"
        
        # Test passwordless SSH
        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes ${SSH_USER}@${ip} "echo 'OK'" >/dev/null 2>&1; then
            print_success "$name ($ip): ✅ Passwordless SSH working"
        else
            print_warning "$name ($ip): ⚠️  Passwordless SSH not working (password still works)"
        fi
    done
    
    echo ""
    print_info "Test SSH connections:"
    for i in "${!GOBLIN_IPS[@]}"; do
        echo "  ssh ${SSH_USER}@${GOBLIN_IPS[$i]}"
    done
    echo ""
    
    if [ $FAIL_COUNT -eq 0 ]; then
        print_success "All Goblins configured successfully! 🎃"
        exit 0
    else
        print_warning "$FAIL_COUNT Goblin(s) had issues"
        exit 1
    fi
}

# Run main function
main

