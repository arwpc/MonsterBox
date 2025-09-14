#!/bin/bash

# MonsterBox SSH Installation Script for Target Raspberry Pi
# Run this script on the target Pi to install SSH configuration

set -euo pipefail

USER="remote"
USER_HOME="/home/$USER"
SSH_DIR="$USER_HOME/.ssh"

echo "Installing MonsterBox SSH configuration..."

# Create SSH directory
sudo -u "$USER" mkdir -p "$SSH_DIR"
sudo -u "$USER" chmod 700 "$SSH_DIR"

# Install authorized_keys
if [[ -f "authorized_keys_template" ]]; then
    sudo -u "$USER" cp authorized_keys_template "$SSH_DIR/authorized_keys"
    sudo -u "$USER" chmod 600 "$SSH_DIR/authorized_keys"
    echo "Authorized keys installed"
fi

# Install deployment wrapper
if [[ -f "monsterbox-deploy-wrapper.sh" ]]; then
    sudo cp monsterbox-deploy-wrapper.sh /usr/local/bin/
    sudo chmod +x /usr/local/bin/monsterbox-deploy-wrapper.sh
    echo "Deployment wrapper installed"
fi

# Create known_hosts file
sudo -u "$USER" touch "$SSH_DIR/known_hosts"
sudo -u "$USER" chmod 644 "$SSH_DIR/known_hosts"

echo "SSH configuration installed successfully!"
echo "You can now connect using the MonsterBox SSH keys."
