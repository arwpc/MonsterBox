#!/bin/bash

# Remote Development Tools Setup for MonsterBox Raspberry Pi 4B
# Configures development environment with zero PowerShell dependencies

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/remote-dev-setup.log"
USER="${USER:-remote}"
USER_HOME="/home/$USER"

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

# Install essential development tools
install_dev_tools() {
    log "Installing essential development tools..."
    
    # Update package list
    sudo apt update
    
    # Install development essentials (skip nodejs/npm if already installed)
    sudo apt install -y \
        git \
        curl \
        wget \
        vim \
        nano \
        htop \
        tree \
        jq \
        unzip \
        build-essential \
        python3-dev \
        python3-pip

    # Check if Node.js and npm are already available
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
        log "Node.js and npm already installed, skipping package installation"
    else
        log "Installing Node.js and npm..."
        sudo apt install -y nodejs npm || warning "Node.js/npm installation failed, but may already be available"
    fi
    
    success "Essential development tools installed"
}

# Configure Git for SSH
configure_git_ssh() {
    log "Configuring Git for SSH authentication..."
    
    # Set up Git configuration if not already set
    if ! git config --global user.name >/dev/null 2>&1; then
        git config --global user.name "MonsterBox Developer"
        log "Set Git user name to 'MonsterBox Developer'"
    fi
    
    if ! git config --global user.email >/dev/null 2>&1; then
        git config --global user.email "developer@monsterbox.local"
        log "Set Git user email to 'developer@monsterbox.local'"
    fi
    
    # Configure Git to use SSH for GitHub
    git config --global url."git@github.com:".insteadOf "https://github.com/"
    
    # Set default branch name
    git config --global init.defaultBranch main
    
    # Configure Git editor
    git config --global core.editor "nano"
    
    # Configure Git to handle line endings properly
    git config --global core.autocrlf input
    
    success "Git configured for SSH authentication"
}

# Create development aliases and functions
create_dev_aliases() {
    log "Creating development aliases and functions..."
    
    cat >> "$USER_HOME/.bashrc" << 'EOF'

# MonsterBox Development Aliases and Functions
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

# Git aliases
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gd='git diff'
alias gb='git branch'
alias gco='git checkout'
alias glog='git log --oneline --graph --decorate'

# MonsterBox specific aliases
alias mb='cd /home/remote/MonsterBox'
alias mbstart='cd /home/remote/MonsterBox && npm start'
alias mbtest='cd /home/remote/MonsterBox && npm test'
alias mblogs='sudo journalctl -u monsterbox -f'
alias mbstatus='systemctl status monsterbox'

# Development functions
mbdeploy() {
    cd /home/remote/MonsterBox
    git pull origin main
    npm install
    npm run build
    sudo systemctl restart monsterbox
    echo "MonsterBox deployed successfully!"
}

mbbackup() {
    local backup_dir="/home/remote/backups/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    cp -r /home/remote/MonsterBox "$backup_dir/"
    echo "Backup created at: $backup_dir"
}

mbclean() {
    cd /home/remote/MonsterBox
    npm run clean
    rm -rf node_modules
    npm install
    echo "MonsterBox cleaned and dependencies reinstalled"
}

# Hardware control functions
hw_status() {
    echo "Hardware Service Status:"
    echo "======================="
    systemctl status monsterbox-hardware 2>/dev/null || echo "Hardware service not running"
    echo ""
    echo "WebSocket Services:"
    netstat -tlnp | grep -E ":(8765|8766|877[0-9])" || echo "No WebSocket services detected"
}

hw_restart() {
    sudo systemctl restart monsterbox-hardware
    echo "Hardware services restarted"
}

# Log viewing functions
view_logs() {
    local service="${1:-monsterbox}"
    sudo journalctl -u "$service" -f --no-pager
}

view_ssh_logs() {
    sudo journalctl -u ssh -f --no-pager
}

# Network utilities
show_ip() {
    echo "Network Interfaces:"
    ip addr show | grep -E "inet.*scope global" | awk '{print $2}' | cut -d/ -f1
}

port_check() {
    local port="${1:-3000}"
    netstat -tlnp | grep ":$port " || echo "Port $port not in use"
}

EOF

    success "Development aliases and functions created"
}

# Configure VS Code Remote SSH settings
configure_vscode_remote() {
    log "Configuring VS Code Remote SSH settings..."
    
    # Create VS Code server directory
    mkdir -p "$USER_HOME/.vscode-server"
    
    # Create settings for VS Code Remote
    mkdir -p "$USER_HOME/.vscode-server/data/Machine"
    
    cat > "$USER_HOME/.vscode-server/data/Machine/settings.json" << 'EOF'
{
    "terminal.integrated.shell.linux": "/bin/bash",
    "terminal.integrated.defaultProfile.linux": "bash",
    "files.watcherExclude": {
        "**/node_modules/**": true,
        "**/.git/objects/**": true,
        "**/.git/subtree-cache/**": true,
        "**/dist/**": true,
        "**/build/**": true
    },
    "search.exclude": {
        "**/node_modules": true,
        "**/dist": true,
        "**/build": true,
        "**/.git": true
    },
    "files.exclude": {
        "**/.git": true,
        "**/node_modules": true,
        "**/dist": true
    },
    "typescript.preferences.includePackageJsonAutoImports": "auto",
    "javascript.preferences.includePackageJsonAutoImports": "auto",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    },
    "extensions.autoUpdate": false,
    "extensions.autoCheckUpdates": false,
    "telemetry.telemetryLevel": "off"
}
EOF

    # Set proper ownership
    chown -R "$USER:$USER" "$USER_HOME/.vscode-server"
    
    success "VS Code Remote SSH settings configured"
}

# Create development scripts to replace PowerShell functionality
create_dev_scripts() {
    log "Creating development scripts to replace PowerShell functionality..."
    
    local scripts_dir="$USER_HOME/bin"
    mkdir -p "$scripts_dir"
    
    # Process monitoring script
    cat > "$scripts_dir/monitor-processes.sh" << 'EOF'
#!/bin/bash
# Process monitoring script - replaces PowerShell Get-Process functionality

echo "MonsterBox Process Monitor"
echo "========================="
echo ""

echo "Node.js Processes:"
ps aux | grep -E "node|npm" | grep -v grep | awk '{print $2, $11, $12, $13, $14, $15}'
echo ""

echo "Python Processes:"
ps aux | grep python | grep -v grep | awk '{print $2, $11, $12, $13, $14, $15}'
echo ""

echo "System Resources:"
echo "Memory Usage: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "Disk Usage: $(df -h / | tail -1 | awk '{print $5}')"
echo ""

echo "Network Connections:"
netstat -tlnp | grep -E ":(3000|8765|8766|877[0-9])" | head -10
EOF

    # Service management script
    cat > "$scripts_dir/manage-services.sh" << 'EOF'
#!/bin/bash
# Service management script - replaces PowerShell service management

ACTION="${1:-status}"
SERVICE="${2:-monsterbox}"

case "$ACTION" in
    "start")
        sudo systemctl start "$SERVICE"
        echo "Started service: $SERVICE"
        ;;
    "stop")
        sudo systemctl stop "$SERVICE"
        echo "Stopped service: $SERVICE"
        ;;
    "restart")
        sudo systemctl restart "$SERVICE"
        echo "Restarted service: $SERVICE"
        ;;
    "status")
        systemctl status "$SERVICE" --no-pager
        ;;
    "logs")
        sudo journalctl -u "$SERVICE" -f --no-pager
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs} [service_name]"
        echo "Default service: monsterbox"
        ;;
esac
EOF

    # File operations script
    cat > "$scripts_dir/file-operations.sh" << 'EOF'
#!/bin/bash
# File operations script - replaces PowerShell file operations

ACTION="${1:-list}"
TARGET="${2:-.}"

case "$ACTION" in
    "list")
        ls -la "$TARGET"
        ;;
    "find")
        find "$TARGET" -name "*${3:-}*" -type f 2>/dev/null
        ;;
    "search")
        grep -r "${3:-}" "$TARGET" 2>/dev/null || echo "No matches found"
        ;;
    "copy")
        cp -r "$TARGET" "${3:-}"
        echo "Copied $TARGET to ${3:-}"
        ;;
    "move")
        mv "$TARGET" "${3:-}"
        echo "Moved $TARGET to ${3:-}"
        ;;
    "delete")
        rm -rf "$TARGET"
        echo "Deleted $TARGET"
        ;;
    *)
        echo "Usage: $0 {list|find|search|copy|move|delete} target [additional_param]"
        ;;
esac
EOF

    # Make scripts executable
    chmod +x "$scripts_dir"/*.sh
    
    # Add bin directory to PATH
    if ! grep -q "$scripts_dir" "$USER_HOME/.bashrc"; then
        echo "export PATH=\"$scripts_dir:\$PATH\"" >> "$USER_HOME/.bashrc"
    fi
    
    success "Development scripts created"
}

# Configure shell environment
configure_shell_environment() {
    log "Configuring shell environment..."
    
    # Set bash as default shell if not already
    if [[ "$SHELL" != "/bin/bash" ]]; then
        chsh -s /bin/bash "$USER"
        log "Changed default shell to bash"
    fi
    
    # Configure bash prompt
    cat >> "$USER_HOME/.bashrc" << 'EOF'

# MonsterBox custom prompt
export PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '

# Set environment variables
export EDITOR=nano
export PAGER=less
export TERM=xterm-256color

# Node.js environment
export NODE_ENV=development
export NPM_CONFIG_PROGRESS=false

# Python environment
export PYTHONPATH="/home/remote/MonsterBox:$PYTHONPATH"

EOF

    success "Shell environment configured"
}

# Test remote development setup
test_remote_setup() {
    log "Testing remote development setup..."
    
    # Test Git SSH
    if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
        success "Git SSH authentication working"
    else
        warning "Git SSH authentication may need manual setup"
    fi
    
    # Test Node.js
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        success "Node.js available: $node_version"
    else
        error "Node.js not available"
    fi
    
    # Test Python
    if command -v python3 >/dev/null 2>&1; then
        local python_version=$(python3 --version)
        success "Python available: $python_version"
    else
        error "Python not available"
    fi
    
    # Test development scripts
    if [[ -x "$USER_HOME/bin/monitor-processes.sh" ]]; then
        success "Development scripts installed and executable"
    else
        error "Development scripts not properly installed"
    fi
}

# Display setup summary
display_summary() {
    echo ""
    success "Remote development setup completed!"
    echo ""
    echo "Setup Summary:"
    echo "=============="
    echo "✓ Essential development tools installed"
    echo "✓ Git configured for SSH authentication"
    echo "✓ Development aliases and functions created"
    echo "✓ VS Code Remote SSH settings configured"
    echo "✓ PowerShell replacement scripts created"
    echo "✓ Shell environment optimized"
    echo ""
    echo "Available Commands:"
    echo "==================="
    echo "mb                 - Navigate to MonsterBox directory"
    echo "mbstart            - Start MonsterBox application"
    echo "mbtest             - Run MonsterBox tests"
    echo "mbdeploy           - Deploy latest changes"
    echo "hw_status          - Check hardware service status"
    echo "monitor-processes  - Monitor system processes"
    echo "manage-services    - Manage system services"
    echo ""
    echo "To activate new settings, run: source ~/.bashrc"
    echo "Or log out and log back in."
}

# Main function
main() {
    log "Starting remote development tools setup..."
    
    install_dev_tools
    configure_git_ssh
    create_dev_aliases
    configure_vscode_remote
    create_dev_scripts
    configure_shell_environment
    test_remote_setup
    display_summary
    
    success "Remote development setup completed successfully!"
}

# Run main function
main "$@"
