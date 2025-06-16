#!/bin/bash

# Git SSH Configuration Script for MonsterBox Development
# Ensures Git uses SSH for all operations, eliminating HTTPS/PowerShell dependencies

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/git-ssh-config.log"

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

# Configure Git global settings for SSH
configure_git_global() {
    log "Configuring Git global settings for SSH..."
    
    # Force Git to use SSH for GitHub
    git config --global url."git@github.com:".insteadOf "https://github.com/"
    git config --global url."git@github.com:".insteadOf "git://github.com/"
    
    # Force Git to use SSH for GitLab
    git config --global url."git@gitlab.com:".insteadOf "https://gitlab.com/"
    git config --global url."git@gitlab.com:".insteadOf "git://gitlab.com/"
    
    # Force Git to use SSH for Bitbucket
    git config --global url."git@bitbucket.org:".insteadOf "https://bitbucket.org/"
    git config --global url."git@bitbucket.org:".insteadOf "git://bitbucket.org/"
    
    # Set default branch name
    git config --global init.defaultBranch main
    
    # Configure Git editor (no PowerShell ISE)
    git config --global core.editor "nano"
    
    # Configure merge tool
    git config --global merge.tool "vimdiff"
    
    # Configure line ending handling for Linux
    git config --global core.autocrlf input
    git config --global core.eol lf
    
    # Configure Git to handle file permissions properly
    git config --global core.filemode true
    
    # Configure Git to use SSH agent
    git config --global core.sshCommand "ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no"
    
    success "Git global settings configured for SSH"
}

# Configure Git user information
configure_git_user() {
    log "Configuring Git user information..."
    
    local current_name=$(git config --global user.name 2>/dev/null || echo "")
    local current_email=$(git config --global user.email 2>/dev/null || echo "")
    
    if [[ -z "$current_name" ]]; then
        git config --global user.name "MonsterBox Developer"
        log "Set Git user name to 'MonsterBox Developer'"
    else
        log "Git user name already set to: $current_name"
    fi
    
    if [[ -z "$current_email" ]]; then
        git config --global user.email "developer@monsterbox.local"
        log "Set Git user email to 'developer@monsterbox.local'"
    else
        log "Git user email already set to: $current_email"
    fi
    
    success "Git user information configured"
}

# Configure SSH for Git operations
configure_ssh_for_git() {
    log "Configuring SSH for Git operations..."
    
    local ssh_dir="$HOME/.ssh"
    local ssh_config="$ssh_dir/config"
    
    # Ensure SSH directory exists
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    
    # Create or update SSH config for Git hosts
    if [[ ! -f "$ssh_config" ]]; then
        touch "$ssh_config"
        chmod 600 "$ssh_config"
    fi
    
    # Remove existing Git host configurations
    sed -i '/# MonsterBox Git SSH Configuration/,/# End MonsterBox Git SSH Configuration/d' "$ssh_config"
    
    # Add Git SSH configuration
    cat >> "$ssh_config" << 'EOF'

# MonsterBox Git SSH Configuration
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3

Host gitlab.com
    HostName gitlab.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3

Host bitbucket.org
    HostName bitbucket.org
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3

# MonsterBox development key
Host github.com-monsterbox
    HostName github.com
    User git
    IdentityFile ~/.ssh/monsterbox-dev
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
# End MonsterBox Git SSH Configuration

EOF

    success "SSH configured for Git operations"
}

# Test SSH connections to Git hosts
test_ssh_connections() {
    log "Testing SSH connections to Git hosts..."
    
    local hosts=("github.com" "gitlab.com" "bitbucket.org")
    local success_count=0
    
    for host in "${hosts[@]}"; do
        log "Testing SSH connection to $host..."
        
        if ssh -T "git@$host" -o ConnectTimeout=10 -o BatchMode=yes 2>&1 | grep -q "successfully authenticated\|You've successfully authenticated"; then
            success "SSH connection to $host successful"
            ((success_count++))
        else
            warning "SSH connection to $host failed (this may be normal if you don't have access)"
        fi
    done
    
    if [[ $success_count -gt 0 ]]; then
        success "At least one Git host SSH connection successful"
    else
        warning "No Git host SSH connections successful - you may need to add SSH keys to your Git providers"
    fi
}

# Configure MonsterBox repository for SSH
configure_monsterbox_repo() {
    log "Configuring MonsterBox repository for SSH..."
    
    local repo_dir="/home/remote/MonsterBox"
    
    if [[ -d "$repo_dir/.git" ]]; then
        cd "$repo_dir"
        
        # Get current remote URL
        local current_url=$(git remote get-url origin 2>/dev/null || echo "")
        
        if [[ "$current_url" == https://github.com/* ]]; then
            # Convert HTTPS URL to SSH
            local ssh_url=$(echo "$current_url" | sed 's|https://github.com/|git@github.com:|')
            git remote set-url origin "$ssh_url"
            success "Converted MonsterBox repository remote from HTTPS to SSH: $ssh_url"
        elif [[ "$current_url" == git@github.com:* ]]; then
            success "MonsterBox repository already using SSH: $current_url"
        else
            warning "MonsterBox repository remote URL not recognized: $current_url"
        fi
        
        # Test repository access
        if git ls-remote origin >/dev/null 2>&1; then
            success "MonsterBox repository SSH access verified"
        else
            warning "MonsterBox repository SSH access failed - check SSH keys"
        fi
    else
        warning "MonsterBox repository not found at $repo_dir"
    fi
}

# Create Git aliases for common operations
create_git_aliases() {
    log "Creating Git aliases for common operations..."
    
    # Git aliases for productivity
    git config --global alias.st "status"
    git config --global alias.co "checkout"
    git config --global alias.br "branch"
    git config --global alias.ci "commit"
    git config --global alias.df "diff"
    git config --global alias.lg "log --oneline --graph --decorate --all"
    git config --global alias.last "log -1 HEAD"
    git config --global alias.unstage "reset HEAD --"
    git config --global alias.visual "!gitk"
    
    # MonsterBox specific aliases
    git config --global alias.mb-deploy "!f() { git pull origin main && echo 'Deployment complete'; }; f"
    git config --global alias.mb-backup "!f() { git add -A && git commit -m \"Backup: \$(date)\"; }; f"
    git config --global alias.mb-sync "!f() { git add -A && git commit -m \"Auto-sync: \$(date)\" && git push origin main; }; f"
    
    success "Git aliases created"
}

# Create Git hooks for MonsterBox
create_git_hooks() {
    log "Creating Git hooks for MonsterBox..."
    
    local repo_dir="/home/remote/MonsterBox"
    local hooks_dir="$repo_dir/.git/hooks"
    
    if [[ -d "$hooks_dir" ]]; then
        # Pre-commit hook to run tests
        cat > "$hooks_dir/pre-commit" << 'EOF'
#!/bin/bash
# MonsterBox pre-commit hook

echo "Running MonsterBox pre-commit checks..."

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js not found, skipping JavaScript checks"
    exit 0
fi

# Run linting if available
if [[ -f package.json ]] && grep -q "lint" package.json; then
    echo "Running linter..."
    npm run lint || {
        echo "Linting failed. Please fix errors before committing."
        exit 1
    }
fi

# Run tests if available
if [[ -f package.json ]] && grep -q "test" package.json; then
    echo "Running tests..."
    npm test || {
        echo "Tests failed. Please fix tests before committing."
        exit 1
    }
fi

echo "Pre-commit checks passed!"
EOF

        # Post-merge hook to install dependencies
        cat > "$hooks_dir/post-merge" << 'EOF'
#!/bin/bash
# MonsterBox post-merge hook

echo "Running MonsterBox post-merge actions..."

# Check if package.json was updated
if git diff-tree -r --name-only --no-commit-id HEAD@{1} HEAD | grep -q "package.json"; then
    echo "package.json updated, running npm install..."
    npm install
fi

# Check if requirements.txt was updated
if git diff-tree -r --name-only --no-commit-id HEAD@{1} HEAD | grep -q "requirements.txt"; then
    echo "requirements.txt updated, running pip install..."
    pip3 install -r requirements.txt
fi

echo "Post-merge actions completed!"
EOF

        # Make hooks executable
        chmod +x "$hooks_dir/pre-commit"
        chmod +x "$hooks_dir/post-merge"
        
        success "Git hooks created and configured"
    else
        warning "Git hooks directory not found - repository may not be initialized"
    fi
}

# Display configuration summary
display_summary() {
    echo ""
    success "Git SSH configuration completed!"
    echo ""
    echo "Configuration Summary:"
    echo "====================="
    echo "✓ Git configured to use SSH for all Git operations"
    echo "✓ SSH configuration updated for Git hosts"
    echo "✓ Git user information configured"
    echo "✓ Git aliases created for productivity"
    echo "✓ Git hooks configured for MonsterBox"
    echo ""
    echo "Git Aliases Available:"
    echo "====================="
    echo "git st          - git status"
    echo "git co          - git checkout"
    echo "git br          - git branch"
    echo "git ci          - git commit"
    echo "git df          - git diff"
    echo "git lg          - git log (graph view)"
    echo "git mb-deploy   - Pull latest changes"
    echo "git mb-backup   - Create backup commit"
    echo "git mb-sync     - Auto-sync with remote"
    echo ""
    echo "Next Steps:"
    echo "==========="
    echo "1. Ensure your SSH key is added to your Git provider"
    echo "2. Test Git operations: git clone, git push, git pull"
    echo "3. All Git operations will now use SSH (no PowerShell required)"
}

# Main function
main() {
    log "Starting Git SSH configuration for MonsterBox development..."
    
    configure_git_global
    configure_git_user
    configure_ssh_for_git
    test_ssh_connections
    configure_monsterbox_repo
    create_git_aliases
    create_git_hooks
    display_summary
    
    success "Git SSH configuration completed successfully!"
}

# Run main function
main "$@"
