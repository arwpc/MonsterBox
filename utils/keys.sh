#!/bin/bash

# MonsterBox SSH Key Setup Script
# Run this script on each animatronic Pi to enable SSH key deployment

set -e

echo "🎭 MonsterBox SSH Key Setup Script"
echo "=================================="
echo "This script will configure SSH to accept key-based authentication"
echo ""

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
    echo "✅ Running with root privileges"
    SUDO=""
else
    echo "🔑 Checking sudo access..."
    if sudo -n true 2>/dev/null; then
        echo "✅ Sudo access confirmed"
        SUDO="sudo"
    else
        echo "❌ This script requires sudo privileges"
        echo "Please run: sudo bash setup-ssh-for-keys.sh"
        exit 1
    fi
fi

# Get hostname for identification
HOSTNAME=$(hostname)
echo "🏠 Configuring SSH on: $HOSTNAME"
echo ""

# Backup original SSH config
echo "📋 Backing up SSH configuration..."
$SUDO cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ SSH config backed up"

# Create SSH config with key-friendly settings
echo "🔧 Configuring SSH for key deployment..."

$SUDO tee /etc/ssh/sshd_config > /dev/null << 'EOF'
# MonsterBox SSH Configuration
Port 22
Protocol 2

# Authentication settings - ALLOW BOTH keys and passwords temporarily
PubkeyAuthentication yes
PasswordAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes

# Key-based authentication settings
AuthorizedKeysFile .ssh/authorized_keys .ssh/authorized_keys2
RSAAuthentication yes

# Security settings
PermitRootLogin no
PermitEmptyPasswords no
MaxAuthTries 6
MaxSessions 10

# Connection settings
ClientAliveInterval 300
ClientAliveCountMax 2
TCPKeepAlive yes

# Host key settings
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# Logging
SyslogFacility AUTH
LogLevel INFO

# SFTP subsystem
Subsystem sftp /usr/lib/openssh/sftp-server

# Allow specific users
AllowUsers remote pi

# Accept environment variables
AcceptEnv LANG LC_*

# Print settings
PrintMotd no
PrintLastLog yes

# DNS settings
UseDNS no

# Compression
Compression delayed
EOF

echo "✅ SSH configuration updated"

# Ensure SSH directory exists for remote user
echo "📁 Setting up SSH directory for remote user..."
if id "remote" &>/dev/null; then
    $SUDO mkdir -p /home/remote/.ssh
    $SUDO chmod 700 /home/remote/.ssh
    $SUDO chown remote:remote /home/remote/.ssh
    
    if [ ! -f /home/remote/.ssh/authorized_keys ]; then
        $SUDO touch /home/remote/.ssh/authorized_keys
        $SUDO chmod 600 /home/remote/.ssh/authorized_keys
        $SUDO chown remote:remote /home/remote/.ssh/authorized_keys
    fi
    echo "✅ SSH directory configured for remote user"
fi

# Also set up for pi user if it exists
if id "pi" &>/dev/null; then
    echo "📁 Setting up SSH directory for pi user..."
    $SUDO mkdir -p /home/pi/.ssh
    $SUDO chmod 700 /home/pi/.ssh
    $SUDO chown pi:pi /home/pi/.ssh
    
    if [ ! -f /home/pi/.ssh/authorized_keys ]; then
        $SUDO touch /home/pi/.ssh/authorized_keys
        $SUDO chmod 600 /home/pi/.ssh/authorized_keys
        $SUDO chown pi:pi /home/pi/.ssh/authorized_keys
    fi
    echo "✅ SSH directory configured for pi user"
fi

# Test SSH configuration
echo "🔍 Testing SSH configuration..."
if $SUDO sshd -t; then
    echo "✅ SSH configuration is valid"
else
    echo "❌ SSH configuration has errors!"
    echo "Restoring backup..."
    $SUDO cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config
    exit 1
fi

# Restart SSH service
echo "🔄 Restarting SSH service..."
if $SUDO systemctl restart ssh; then
    echo "✅ SSH service restarted successfully"
elif $SUDO service ssh restart; then
    echo "✅ SSH service restarted successfully (using service command)"
else
    echo "❌ Failed to restart SSH service"
    echo "Please restart manually: sudo systemctl restart ssh"
    exit 1
fi

echo ""
echo "🎉 SSH Key Setup Complete!"
echo "=========================="
echo "✅ SSH is now configured to accept both passwords and keys"
echo "✅ Ready for SSH key deployment from MonsterBox control system"
echo ""
echo "🏠 Hostname: $HOSTNAME"
echo "🌐 IP Address: $(hostname -I | awk '{print $1}')"
echo ""
echo "✨ Ready for MonsterBox SSH key deployment!"
