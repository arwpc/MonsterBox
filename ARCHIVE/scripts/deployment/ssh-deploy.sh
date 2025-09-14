#!/bin/bash

# SSH-Based Deployment Pipeline for MonsterBox
# Deploys MonsterBox to multiple Raspberry Pi 4B devices using SSH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deployment-config.json"
LOG_FILE="$SCRIPT_DIR/deployment-$(date +%Y%m%d-%H%M%S).log"

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

# Default configuration
DEFAULT_CONFIG='{
  "targets": [
    {
      "name": "development",
      "host": "192.168.1.100",
      "user": "remote",
      "ssh_key": "~/.ssh/monsterbox-dev",
      "branch": "main",
      "pre_deploy_commands": [
        "sudo systemctl stop monsterbox || true"
      ],
      "post_deploy_commands": [
        "npm install",
        "sudo systemctl start monsterbox",
        "sudo systemctl enable monsterbox"
      ],
      "health_check_url": "http://localhost:3000/health",
      "timeout": 300
    }
  ],
  "deployment": {
    "backup_enabled": true,
    "backup_retention_days": 7,
    "rollback_enabled": true,
    "health_check_enabled": true,
    "parallel_deployment": false
  }
}'

# Load configuration
load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log "Creating default deployment configuration..."
        echo "$DEFAULT_CONFIG" | jq '.' > "$CONFIG_FILE"
        success "Default configuration created at $CONFIG_FILE"
        warning "Please update the configuration with your target hosts"
    fi
    
    if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
        error "Invalid JSON in configuration file: $CONFIG_FILE"
    fi
    
    log "Configuration loaded from $CONFIG_FILE"
}

# Validate SSH connectivity
validate_ssh_connectivity() {
    local host="$1"
    local user="$2"
    local ssh_key="$3"
    
    log "Validating SSH connectivity to $user@$host..."
    
    if ssh -i "$ssh_key" -o ConnectTimeout=10 -o BatchMode=yes "$user@$host" "echo 'SSH connection successful'" >/dev/null 2>&1; then
        success "SSH connectivity to $user@$host verified"
        return 0
    else
        error "SSH connectivity to $user@$host failed"
        return 1
    fi
}

# Create backup on target
create_backup() {
    local host="$1"
    local user="$2"
    local ssh_key="$3"
    local target_name="$4"
    
    log "Creating backup on $target_name..."
    
    local backup_dir="/home/$user/backups/monsterbox-$(date +%Y%m%d-%H%M%S)"
    
    ssh -i "$ssh_key" "$user@$host" "
        mkdir -p '$backup_dir'
        if [[ -d '/home/$user/MonsterBox' ]]; then
            cp -r '/home/$user/MonsterBox' '$backup_dir/'
            echo 'Backup created at: $backup_dir'
        else
            echo 'No existing MonsterBox installation found'
        fi
    "
    
    success "Backup created on $target_name"
}

# Deploy to target
deploy_to_target() {
    local target_config="$1"
    
    local name=$(echo "$target_config" | jq -r '.name')
    local host=$(echo "$target_config" | jq -r '.host')
    local user=$(echo "$target_config" | jq -r '.user')
    local ssh_key=$(echo "$target_config" | jq -r '.ssh_key')
    local branch=$(echo "$target_config" | jq -r '.branch // "main"')
    
    # Expand tilde in SSH key path
    ssh_key="${ssh_key/#\~/$HOME}"
    
    log "Starting deployment to $name ($user@$host)..."
    
    # Validate SSH connectivity
    validate_ssh_connectivity "$host" "$user" "$ssh_key"
    
    # Create backup if enabled
    local backup_enabled=$(jq -r '.deployment.backup_enabled // true' "$CONFIG_FILE")
    if [[ "$backup_enabled" == "true" ]]; then
        create_backup "$host" "$user" "$ssh_key" "$name"
    fi
    
    # Execute pre-deploy commands
    local pre_commands=$(echo "$target_config" | jq -r '.pre_deploy_commands[]? // empty')
    if [[ -n "$pre_commands" ]]; then
        log "Executing pre-deploy commands on $name..."
        while IFS= read -r cmd; do
            log "Running: $cmd"
            ssh -i "$ssh_key" "$user@$host" "$cmd" || warning "Pre-deploy command failed: $cmd"
        done <<< "$pre_commands"
    fi
    
    # Deploy code
    log "Deploying code to $name..."
    ssh -i "$ssh_key" "$user@$host" "
        cd /home/$user
        if [[ -d 'MonsterBox' ]]; then
            cd MonsterBox
            git fetch origin
            git checkout '$branch'
            git pull origin '$branch'
        else
            git clone git@github.com:arwpc/MonsterBox.git
            cd MonsterBox
            git checkout '$branch'
        fi
    "
    
    # Execute post-deploy commands
    local post_commands=$(echo "$target_config" | jq -r '.post_deploy_commands[]? // empty')
    if [[ -n "$post_commands" ]]; then
        log "Executing post-deploy commands on $name..."
        while IFS= read -r cmd; do
            log "Running: $cmd"
            ssh -i "$ssh_key" "$user@$host" "cd /home/$user/MonsterBox && $cmd"
        done <<< "$post_commands"
    fi
    
    # Health check
    local health_check_enabled=$(jq -r '.deployment.health_check_enabled // true' "$CONFIG_FILE")
    if [[ "$health_check_enabled" == "true" ]]; then
        perform_health_check "$target_config"
    fi
    
    success "Deployment to $name completed successfully"
}

# Perform health check
perform_health_check() {
    local target_config="$1"
    
    local name=$(echo "$target_config" | jq -r '.name')
    local host=$(echo "$target_config" | jq -r '.host')
    local user=$(echo "$target_config" | jq -r '.user')
    local ssh_key=$(echo "$target_config" | jq -r '.ssh_key')
    local health_url=$(echo "$target_config" | jq -r '.health_check_url // "http://localhost:3000/health"')
    local timeout=$(echo "$target_config" | jq -r '.timeout // 300')
    
    # Expand tilde in SSH key path
    ssh_key="${ssh_key/#\~/$HOME}"
    
    log "Performing health check on $name..."
    
    local start_time=$(date +%s)
    local max_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $max_time ]]; do
        if ssh -i "$ssh_key" "$user@$host" "curl -f '$health_url' >/dev/null 2>&1"; then
            success "Health check passed for $name"
            return 0
        fi
        
        log "Health check failed, retrying in 10 seconds..."
        sleep 10
    done
    
    error "Health check failed for $name after $timeout seconds"
}

# Rollback deployment
rollback_deployment() {
    local target_name="$1"
    
    log "Rolling back deployment on $target_name..."
    
    # Find target configuration
    local target_config=$(jq -r ".targets[] | select(.name == \"$target_name\")" "$CONFIG_FILE")
    if [[ -z "$target_config" ]]; then
        error "Target $target_name not found in configuration"
    fi
    
    local host=$(echo "$target_config" | jq -r '.host')
    local user=$(echo "$target_config" | jq -r '.user')
    local ssh_key=$(echo "$target_config" | jq -r '.ssh_key')
    
    # Expand tilde in SSH key path
    ssh_key="${ssh_key/#\~/$HOME}"
    
    # Find latest backup
    local latest_backup=$(ssh -i "$ssh_key" "$user@$host" "
        ls -1t /home/$user/backups/monsterbox-* 2>/dev/null | head -1 || echo ''
    ")
    
    if [[ -z "$latest_backup" ]]; then
        error "No backup found for rollback on $target_name"
    fi
    
    log "Rolling back to backup: $latest_backup"
    
    ssh -i "$ssh_key" "$user@$host" "
        sudo systemctl stop monsterbox || true
        rm -rf /home/$user/MonsterBox
        cp -r '$latest_backup/MonsterBox' /home/$user/
        cd /home/$user/MonsterBox
        npm install
        sudo systemctl start monsterbox
    "
    
    success "Rollback completed for $target_name"
}

# Clean old backups
clean_old_backups() {
    local target_config="$1"
    
    local name=$(echo "$target_config" | jq -r '.name')
    local host=$(echo "$target_config" | jq -r '.host')
    local user=$(echo "$target_config" | jq -r '.user')
    local ssh_key=$(echo "$target_config" | jq -r '.ssh_key')
    
    # Expand tilde in SSH key path
    ssh_key="${ssh_key/#\~/$HOME}"
    
    local retention_days=$(jq -r '.deployment.backup_retention_days // 7' "$CONFIG_FILE")
    
    log "Cleaning backups older than $retention_days days on $name..."
    
    ssh -i "$ssh_key" "$user@$host" "
        find /home/$user/backups -name 'monsterbox-*' -type d -mtime +$retention_days -exec rm -rf {} + 2>/dev/null || true
    "
    
    success "Old backups cleaned on $name"
}

# Deploy to all targets
deploy_all() {
    load_config
    
    local parallel=$(jq -r '.deployment.parallel_deployment // false' "$CONFIG_FILE")
    local targets=$(jq -c '.targets[]' "$CONFIG_FILE")
    
    if [[ "$parallel" == "true" ]]; then
        log "Starting parallel deployment to all targets..."
        local pids=()
        
        while IFS= read -r target; do
            deploy_to_target "$target" &
            pids+=($!)
        done <<< "$targets"
        
        # Wait for all deployments to complete
        for pid in "${pids[@]}"; do
            wait "$pid"
        done
    else
        log "Starting sequential deployment to all targets..."
        while IFS= read -r target; do
            deploy_to_target "$target"
        done <<< "$targets"
    fi
    
    # Clean old backups
    while IFS= read -r target; do
        clean_old_backups "$target"
    done <<< "$targets"
    
    success "Deployment completed for all targets"
}

# Deploy to specific target
deploy_target() {
    local target_name="$1"
    
    load_config
    
    local target_config=$(jq -c ".targets[] | select(.name == \"$target_name\")" "$CONFIG_FILE")
    if [[ -z "$target_config" ]]; then
        error "Target $target_name not found in configuration"
    fi
    
    deploy_to_target "$target_config"
    clean_old_backups "$target_config"
}

# Show deployment status
show_status() {
    load_config
    
    echo "Deployment Status"
    echo "================="
    
    local targets=$(jq -c '.targets[]' "$CONFIG_FILE")
    while IFS= read -r target; do
        local name=$(echo "$target" | jq -r '.name')
        local host=$(echo "$target" | jq -r '.host')
        local user=$(echo "$target" | jq -r '.user')
        local ssh_key=$(echo "$target" | jq -r '.ssh_key')
        
        # Expand tilde in SSH key path
        ssh_key="${ssh_key/#\~/$HOME}"
        
        echo ""
        echo "Target: $name ($user@$host)"
        echo "------------------------"
        
        if validate_ssh_connectivity "$host" "$user" "$ssh_key" 2>/dev/null; then
            local status=$(ssh -i "$ssh_key" "$user@$host" "
                if systemctl is-active --quiet monsterbox; then
                    echo 'Running'
                else
                    echo 'Stopped'
                fi
            " 2>/dev/null || echo "Unknown")
            
            local version=$(ssh -i "$ssh_key" "$user@$host" "
                cd /home/$user/MonsterBox 2>/dev/null && git rev-parse --short HEAD 2>/dev/null || echo 'Unknown'
            " 2>/dev/null || echo "Unknown")
            
            echo "SSH: Connected"
            echo "Service: $status"
            echo "Version: $version"
        else
            echo "SSH: Failed"
            echo "Service: Unknown"
            echo "Version: Unknown"
        fi
    done <<< "$targets"
}

# Main function
main() {
    case "${1:-}" in
        "deploy")
            if [[ -n "${2:-}" ]]; then
                deploy_target "$2"
            else
                deploy_all
            fi
            ;;
        "rollback")
            if [[ -z "${2:-}" ]]; then
                error "Target name required for rollback"
            fi
            rollback_deployment "$2"
            ;;
        "status")
            show_status
            ;;
        "monitor")
            if [[ -z "${2:-}" ]]; then
                error "Target name required for monitoring"
            fi
            monitor_deployment "$2" "${3:-300}"
            ;;
        "config")
            if [[ -f "$CONFIG_FILE" ]]; then
                cat "$CONFIG_FILE"
            else
                echo "$DEFAULT_CONFIG" | jq '.'
            fi
            ;;
        *)
            echo "Usage: $0 {deploy [target]|rollback <target>|status|monitor <target> [duration]|config}"
            echo ""
            echo "Commands:"
            echo "  deploy [target]           - Deploy to all targets or specific target"
            echo "  rollback <target>         - Rollback deployment on specific target"
            echo "  status                    - Show deployment status for all targets"
            echo "  monitor <target> [duration] - Monitor deployment (default: 300 seconds)"
            echo "  config                    - Show current configuration"
            echo ""
            echo "Examples:"
            echo "  $0 deploy                    # Deploy to all targets"
            echo "  $0 deploy development        # Deploy to development target"
            echo "  $0 rollback development      # Rollback development target"
            echo "  $0 status                    # Show status of all targets"
            echo "  $0 monitor development 600   # Monitor development for 10 minutes"
            exit 1
            ;;
    esac
}

# Monitor deployment
monitor_deployment() {
    local target_name="$1"
    local duration="${2:-300}"

    load_config

    local target_config=$(jq -c ".targets[] | select(.name == \"$target_name\")" "$CONFIG_FILE")
    if [[ -z "$target_config" ]]; then
        error "Target $target_name not found in configuration"
    fi

    local host=$(echo "$target_config" | jq -r '.host')
    local user=$(echo "$target_config" | jq -r '.user')
    local ssh_key=$(echo "$target_config" | jq -r '.ssh_key')

    # Expand tilde in SSH key path
    ssh_key="${ssh_key/#\~/$HOME}"

    log "Monitoring deployment on $target_name for $duration seconds..."

    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    while [[ $(date +%s) -lt $end_time ]]; do
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

        # Check service status
        local service_status=$(ssh -i "$ssh_key" "$user@$host" "
            if systemctl is-active --quiet monsterbox; then
                echo 'Running'
            else
                echo 'Stopped'
            fi
        " 2>/dev/null || echo "Unknown")

        # Check memory usage
        local memory_usage=$(ssh -i "$ssh_key" "$user@$host" "
            free | grep Mem | awk '{printf \"%.1f\", \$3/\$2 * 100.0}'
        " 2>/dev/null || echo "Unknown")

        # Check CPU usage
        local cpu_usage=$(ssh -i "$ssh_key" "$user@$host" "
            top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1
        " 2>/dev/null || echo "Unknown")

        echo "[$timestamp] Service: $service_status | Memory: ${memory_usage}% | CPU: ${cpu_usage}%"

        sleep 30
    done

    success "Monitoring completed for $target_name"
}

# Run main function
main "$@"
