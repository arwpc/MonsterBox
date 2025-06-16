#!/bin/bash

# SSH Configuration Deployment Script for Raspberry Pi 4B
# Configures secure SSH server with key-based authentication
# Designed for MonsterBox deployment across multiple RPi4B devices

set -euo pipefail

# Configuration variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_PORT="${SSH_PORT:-22}"
SSH_USER="${SSH_USER:-remote}"
BACKUP_DIR="/etc/ssh/backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/log/monsterbox-ssh-deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Use: sudo $0"
    fi
}

# Backup existing SSH configuration
backup_ssh_config() {
    log "Creating backup of existing SSH configuration..."
    mkdir -p "$BACKUP_DIR"
    
    if [[ -f /etc/ssh/sshd_config ]]; then
        cp /etc/ssh/sshd_config "$BACKUP_DIR/"
        log "Backed up sshd_config to $BACKUP_DIR/"
    fi
    
    if [[ -d /etc/ssh/sshd_config.d ]]; then
        cp -r /etc/ssh/sshd_config.d "$BACKUP_DIR/"
        log "Backed up sshd_config.d directory to $BACKUP_DIR/"
    fi
}

# Generate SSH host keys if they don't exist
generate_host_keys() {
    log "Checking SSH host keys..."
    
    local key_types=("rsa" "ecdsa" "ed25519")
    local regenerate_keys=false
    
    for key_type in "${key_types[@]}"; do
        local key_file="/etc/ssh/ssh_host_${key_type}_key"
        if [[ ! -f "$key_file" ]]; then
            log "Generating $key_type host key..."
            ssh-keygen -t "$key_type" -f "$key_file" -N "" -q
            regenerate_keys=true
        fi
    done
    
    if [[ "$regenerate_keys" == true ]]; then
        success "SSH host keys generated successfully"
    else
        log "SSH host keys already exist"
    fi
}

# Create secure SSH configuration
create_ssh_config() {
    log "Creating secure SSH configuration..."
    
    cat > /etc/ssh/sshd_config << 'EOF'
# MonsterBox SSH Configuration for Raspberry Pi 4B
# Secure configuration for remote development environment

# Network settings
Port 22
AddressFamily any
ListenAddress 0.0.0.0
ListenAddress ::

# Host keys
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# Ciphers and keying
RekeyLimit default none

# Logging
SyslogFacility AUTH
LogLevel INFO

# Authentication
LoginGraceTime 2m
PermitRootLogin no
StrictModes yes
MaxAuthTries 3
MaxSessions 10

# Public key authentication
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys .ssh/authorized_keys2

# Password authentication (disabled for security)
PasswordAuthentication no
PermitEmptyPasswords no

# Challenge-response authentication (disabled)
KbdInteractiveAuthentication no

# Kerberos options (disabled)
KerberosAuthentication no
KerberosOrLocalPasswd no
KerberosTicketCleanup yes
KerberosGetAFSToken no

# GSSAPI options (disabled)
GSSAPIAuthentication no
GSSAPICleanupCredentials yes
GSSAPIStrictAcceptorCheck yes
GSSAPIKeyExchange no

# Set this to 'yes' to enable PAM authentication, account processing,
# and session processing. If this is enabled, PAM authentication will
# be allowed through the KbdInteractiveAuthentication and
# PasswordAuthentication.
UsePAM yes

# Allow client to pass locale environment variables
AcceptEnv LANG LC_*

# Override default of no subsystems
Subsystem sftp /usr/lib/openssh/sftp-server

# Security settings
X11Forwarding no
X11DisplayOffset 10
PrintMotd no
PrintLastLog yes
TCPKeepAlive yes
Compression delayed
ClientAliveInterval 300
ClientAliveCountMax 2

# Allow specific users only
AllowUsers remote

# Disable unused features
AllowAgentForwarding yes
AllowTcpForwarding yes
GatewayPorts no
PermitTunnel no
PermitUserEnvironment no

# Banner
Banner /etc/ssh/banner.txt
EOF

    success "SSH configuration created successfully"
}

# Create SSH banner
create_ssh_banner() {
    log "Creating SSH banner..."
    
    cat > /etc/ssh/banner.txt << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                              MonsterBox System                              ║
║                         Raspberry Pi 4B Development                         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  WARNING: This system is for authorized users only.                         ║
║  All activities are monitored and logged.                                   ║
║  Unauthorized access is prohibited.                                         ║
║                                                                              ║
║  This is a MonsterBox animatronic control system.                          ║
║  Please follow security protocols and development guidelines.               ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

EOF

    success "SSH banner created successfully"
}

# Configure firewall for SSH
configure_firewall() {
    log "Configuring firewall for SSH..."
    
    # Check if ufw is installed
    if command -v ufw >/dev/null 2>&1; then
        # Allow SSH through firewall
        ufw allow ssh
        ufw allow "$SSH_PORT"/tcp
        
        # Enable firewall if not already enabled
        if ! ufw status | grep -q "Status: active"; then
            echo "y" | ufw enable
        fi
        
        success "Firewall configured for SSH access"
    else
        warning "UFW firewall not installed, skipping firewall configuration"
    fi
}

# Set up SSH key for specified user
setup_user_ssh() {
    local user="$SSH_USER"
    local user_home
    
    if ! id "$user" &>/dev/null; then
        error "User $user does not exist"
    fi
    
    user_home=$(eval echo "~$user")
    local ssh_dir="$user_home/.ssh"
    
    log "Setting up SSH directory for user $user..."
    
    # Create .ssh directory if it doesn't exist
    if [[ ! -d "$ssh_dir" ]]; then
        sudo -u "$user" mkdir -p "$ssh_dir"
        sudo -u "$user" chmod 700 "$ssh_dir"
    fi
    
    # Create authorized_keys file if it doesn't exist
    local auth_keys="$ssh_dir/authorized_keys"
    if [[ ! -f "$auth_keys" ]]; then
        sudo -u "$user" touch "$auth_keys"
        sudo -u "$user" chmod 600 "$auth_keys"
        log "Created authorized_keys file for $user"
    fi
    
    success "SSH directory configured for user $user"
}

# Test SSH configuration
test_ssh_config() {
    log "Testing SSH configuration..."
    
    if sshd -t; then
        success "SSH configuration test passed"
    else
        error "SSH configuration test failed"
    fi
}

# Restart SSH service
restart_ssh_service() {
    log "Restarting SSH service..."
    
    systemctl restart ssh
    
    if systemctl is-active --quiet ssh; then
        success "SSH service restarted successfully"
    else
        error "Failed to restart SSH service"
    fi
}

# Enable SSH service on boot
enable_ssh_service() {
    log "Enabling SSH service on boot..."
    
    systemctl enable ssh
    success "SSH service enabled on boot"
}

# Display connection information
display_connection_info() {
    local ip_address
    ip_address=$(hostname -I | awk '{print $1}')
    
    echo ""
    success "SSH deployment completed successfully!"
    echo ""
    echo "Connection Information:"
    echo "======================"
    echo "Host: $ip_address"
    echo "Port: $SSH_PORT"
    echo "User: $SSH_USER"
    echo "Authentication: Key-based only"
    echo ""
    echo "To connect from another machine:"
    echo "ssh -i ~/.ssh/id_ed25519 $SSH_USER@$ip_address"
    echo ""
    echo "Configuration backup saved to: $BACKUP_DIR"
    echo "Deployment log saved to: $LOG_FILE"
}

# Main deployment function
main() {
    log "Starting SSH deployment for MonsterBox Raspberry Pi 4B..."
    
    check_root
    backup_ssh_config
    generate_host_keys
    create_ssh_config
    create_ssh_banner
    setup_user_ssh
    test_ssh_config
    configure_firewall
    restart_ssh_service
    enable_ssh_service
    display_connection_info
    
    success "SSH deployment completed successfully!"
}

# Run main function
main "$@"
