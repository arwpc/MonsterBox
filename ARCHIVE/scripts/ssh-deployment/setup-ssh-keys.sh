#!/bin/bash

# SSH Key Management Script for MonsterBox Raspberry Pi 4B Deployment
# Generates and manages SSH keys for secure remote development

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_DIR="$SCRIPT_DIR/keys"
CONFIG_DIR="$SCRIPT_DIR/configs"
LOG_FILE="$SCRIPT_DIR/ssh-keys-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Create directory structure
create_directories() {
    log "Creating directory structure..."
    mkdir -p "$KEY_DIR"
    mkdir -p "$CONFIG_DIR"
    chmod 700 "$KEY_DIR"
    success "Directory structure created"
}

# Generate SSH key pair for development
generate_development_key() {
    local key_name="monsterbox-dev"
    local key_path="$KEY_DIR/$key_name"
    
    log "Generating development SSH key pair..."
    
    if [[ -f "$key_path" ]]; then
        warning "Development key already exists at $key_path"
        return 0
    fi
    
    ssh-keygen -t ed25519 -f "$key_path" -N "" -C "monsterbox-development-$(date +%Y%m%d)"
    chmod 600 "$key_path"
    chmod 644 "$key_path.pub"
    
    success "Development SSH key generated: $key_path"
}

# Generate SSH key pair for deployment
generate_deployment_key() {
    local key_name="monsterbox-deploy"
    local key_path="$KEY_DIR/$key_name"
    
    log "Generating deployment SSH key pair..."
    
    if [[ -f "$key_path" ]]; then
        warning "Deployment key already exists at $key_path"
        return 0
    fi
    
    ssh-keygen -t ed25519 -f "$key_path" -N "" -C "monsterbox-deployment-$(date +%Y%m%d)"
    chmod 600 "$key_path"
    chmod 644 "$key_path.pub"
    
    success "Deployment SSH key generated: $key_path"
}

# Create SSH client configuration template
create_ssh_client_config() {
    log "Creating SSH client configuration template..."
    
    cat > "$CONFIG_DIR/ssh_config_template" << 'EOF'
# MonsterBox SSH Client Configuration Template
# Copy this to ~/.ssh/config and customize as needed

# Development host configuration
Host monsterbox-dev
    HostName REPLACE_WITH_PI_IP
    User remote
    Port 22
    IdentityFile ~/.ssh/monsterbox-dev
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
    Compression yes
    ForwardAgent yes

# Production host configuration  
Host monsterbox-prod
    HostName REPLACE_WITH_PI_IP
    User remote
    Port 22
    IdentityFile ~/.ssh/monsterbox-deploy
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
    Compression yes
    ForwardAgent no

# Wildcard configuration for MonsterBox devices
Host monsterbox-*
    User remote
    Port 22
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
    Compression yes
    StrictHostKeyChecking ask
    UserKnownHostsFile ~/.ssh/known_hosts_monsterbox

# VS Code Remote SSH optimization
Host *
    AddKeysToAgent yes
    UseKeychain yes
EOF

    success "SSH client configuration template created"
}

# Create authorized_keys template
create_authorized_keys_template() {
    log "Creating authorized_keys template..."
    
    local dev_pubkey=""
    local deploy_pubkey=""
    
    if [[ -f "$KEY_DIR/monsterbox-dev.pub" ]]; then
        dev_pubkey=$(cat "$KEY_DIR/monsterbox-dev.pub")
    fi
    
    if [[ -f "$KEY_DIR/monsterbox-deploy.pub" ]]; then
        deploy_pubkey=$(cat "$KEY_DIR/monsterbox-deploy.pub")
    fi
    
    cat > "$CONFIG_DIR/authorized_keys_template" << EOF
# MonsterBox Authorized Keys Template
# Copy this content to ~/.ssh/authorized_keys on target Raspberry Pi

# Development key (full access)
$dev_pubkey

# Deployment key (restricted access)
command="/usr/local/bin/monsterbox-deploy-wrapper.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding $deploy_pubkey

# Add additional developer keys below this line
# Format: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@hostname
EOF

    success "Authorized keys template created"
}

# Create deployment wrapper script
create_deployment_wrapper() {
    log "Creating deployment wrapper script..."
    
    cat > "$CONFIG_DIR/monsterbox-deploy-wrapper.sh" << 'EOF'
#!/bin/bash

# MonsterBox Deployment Wrapper Script
# Restricts deployment key to specific commands only

set -euo pipefail

# Allowed commands for deployment key
ALLOWED_COMMANDS=(
    "git pull"
    "git fetch"
    "git status"
    "npm install"
    "npm run build"
    "systemctl restart monsterbox"
    "systemctl status monsterbox"
    "docker-compose up -d"
    "docker-compose down"
    "docker-compose restart"
)

# Log all deployment activities
LOG_FILE="/var/log/monsterbox-deployment.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deployment command: $SSH_ORIGINAL_COMMAND" >> "$LOG_FILE"

# Check if command is allowed
if [[ -z "${SSH_ORIGINAL_COMMAND:-}" ]]; then
    echo "No command specified. Deployment key is restricted to specific commands only."
    exit 1
fi

# Validate command against allowed list
command_allowed=false
for allowed_cmd in "${ALLOWED_COMMANDS[@]}"; do
    if [[ "$SSH_ORIGINAL_COMMAND" == "$allowed_cmd"* ]]; then
        command_allowed=true
        break
    fi
done

if [[ "$command_allowed" == false ]]; then
    echo "Command not allowed: $SSH_ORIGINAL_COMMAND"
    echo "Allowed commands: ${ALLOWED_COMMANDS[*]}"
    exit 1
fi

# Execute the allowed command
cd /home/remote/MonsterBox || exit 1
exec $SSH_ORIGINAL_COMMAND
EOF

    chmod +x "$CONFIG_DIR/monsterbox-deploy-wrapper.sh"
    success "Deployment wrapper script created"
}

# Create installation script for target Pi
create_target_install_script() {
    log "Creating target installation script..."
    
    cat > "$CONFIG_DIR/install-on-target.sh" << 'EOF'
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
EOF

    chmod +x "$CONFIG_DIR/install-on-target.sh"
    success "Target installation script created"
}

# Create deployment package
create_deployment_package() {
    log "Creating deployment package..."
    
    local package_name="monsterbox-ssh-deployment-$(date +%Y%m%d-%H%M%S).tar.gz"
    local package_path="$SCRIPT_DIR/$package_name"
    
    cd "$SCRIPT_DIR"
    tar -czf "$package_path" \
        configs/ \
        keys/*.pub \
        deploy-ssh-config.sh \
        setup-ssh-keys.sh \
        README.md
    
    success "Deployment package created: $package_path"
    echo "Package contents:"
    tar -tzf "$package_path" | sed 's/^/  /'
}

# Display usage instructions
display_instructions() {
    echo ""
    success "SSH key setup completed!"
    echo ""
    echo "Next Steps:"
    echo "==========="
    echo "1. Copy the deployment package to your target Raspberry Pi 4B"
    echo "2. Extract the package on the target Pi"
    echo "3. Run the deployment script as root:"
    echo "   sudo ./deploy-ssh-config.sh"
    echo "4. Run the target installation script:"
    echo "   ./configs/install-on-target.sh"
    echo ""
    echo "Client Setup:"
    echo "============="
    echo "1. Copy the private keys to your development machine:"
    echo "   cp $KEY_DIR/monsterbox-dev ~/.ssh/"
    echo "   cp $KEY_DIR/monsterbox-deploy ~/.ssh/"
    echo "2. Add the SSH configuration to ~/.ssh/config:"
    echo "   cat $CONFIG_DIR/ssh_config_template >> ~/.ssh/config"
    echo "3. Update the HostName fields with your Pi's IP address"
    echo ""
    echo "Security Notes:"
    echo "==============="
    echo "- Keep private keys secure and never share them"
    echo "- The deployment key has restricted command access"
    echo "- All SSH activities are logged"
    echo "- Password authentication is disabled"
}

# Main function
main() {
    log "Starting SSH key setup for MonsterBox deployment..."
    
    create_directories
    generate_development_key
    generate_deployment_key
    create_ssh_client_config
    create_authorized_keys_template
    create_deployment_wrapper
    create_target_install_script
    create_deployment_package
    display_instructions
    
    success "SSH key setup completed successfully!"
}

# Run main function
main "$@"
