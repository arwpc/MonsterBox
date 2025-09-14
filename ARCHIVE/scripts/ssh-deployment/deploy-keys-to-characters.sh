#!/bin/bash

# MonsterBox SSH Key Deployment Script
# Deploys SSH keys to all animatronic characters based on characters.json
# Supports dynamic character management and automatic key deployment

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONSTERBOX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHARACTERS_JSON="$MONSTERBOX_ROOT/data/characters.json"
SSH_KEY_PATH="$SCRIPT_DIR/keys/monsterbox-dev"
LOG_FILE="$SCRIPT_DIR/key-deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
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

# Check prerequisites
check_prerequisites() {
    if [[ ! -f "$CHARACTERS_JSON" ]]; then
        error "Characters file not found: $CHARACTERS_JSON"
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        error "jq is required but not installed. Install with: sudo apt-get install jq"
    fi
    
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        error "SSH private key not found: $SSH_KEY_PATH"
    fi
    
    if [[ ! -f "$SSH_KEY_PATH.pub" ]]; then
        error "SSH public key not found: $SSH_KEY_PATH.pub"
    fi
    
    log "Prerequisites check passed"
}

# Get animatronic hosts from characters.json
get_animatronic_hosts() {
    jq -r '.[] | select(.animatronic.enabled == true) | "\(.char_name)|\(.animatronic.rpi_config.host)|\(.animatronic.rpi_config.user // "remote")"' "$CHARACTERS_JSON"
}

# Test SSH key-based connectivity
test_ssh_key_auth() {
    local host="$1"
    local user="$2"
    
    ssh -i "$SSH_KEY_PATH" \
        -o ConnectTimeout=10 \
        -o StrictHostKeyChecking=accept-new \
        -o PasswordAuthentication=no \
        -o PubkeyAuthentication=yes \
        -o BatchMode=yes \
        "$user@$host" 'echo "SSH key auth successful"' >/dev/null 2>&1
}

# Deploy SSH key using ssh-copy-id
deploy_ssh_key() {
    local host="$1"
    local user="$2"
    
    # Use ssh-copy-id to deploy the key
    ssh-copy-id -i "$SSH_KEY_PATH.pub" \
                -o ConnectTimeout=10 \
                -o StrictHostKeyChecking=accept-new \
                "$user@$host" >/dev/null 2>&1
}

# Deploy keys to all characters
deploy_keys_to_all() {
    log "Starting SSH key deployment to all animatronic characters..."
    
    local total_hosts=0
    local successful_deployments=0
    local failed_deployments=0
    local already_configured=0
    
    # Count total hosts first
    while IFS='|' read -r char_name host user; do
        if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
            ((total_hosts++))
        fi
    done < <(get_animatronic_hosts)
    
    if [[ $total_hosts -eq 0 ]]; then
        warning "No enabled animatronic characters found in $CHARACTERS_JSON"
        return 0
    fi
    
    log "Found $total_hosts animatronic host(s) to process"
    echo ""
    
    # Process each host
    while IFS='|' read -r char_name host user; do
        if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
            log "Processing $char_name at $user@$host..."
            
            # Check if key is already deployed and working
            if test_ssh_key_auth "$host" "$user"; then
                success "✅ $char_name - SSH key already deployed and working"
                ((already_configured++))
            else
                # Try to deploy the key
                log "Deploying SSH key to $char_name..."
                if deploy_ssh_key "$host" "$user"; then
                    # Verify the deployment worked
                    sleep 2  # Brief pause to ensure key is active
                    if test_ssh_key_auth "$host" "$user"; then
                        success "✅ $char_name - SSH key successfully deployed"
                        ((successful_deployments++))
                    else
                        error "❌ $char_name - Key deployed but authentication test failed"
                        ((failed_deployments++))
                    fi
                else
                    warning "❌ $char_name - Failed to deploy SSH key (may need password setup first)"
                    ((failed_deployments++))
                fi
            fi
            echo ""
        fi
    done < <(get_animatronic_hosts)
    
    # Display summary
    echo "=================================="
    log "SSH Key Deployment Summary:"
    echo "=================================="
    echo "Total hosts: $total_hosts"
    echo "Already configured: $already_configured"
    echo "Successfully deployed: $successful_deployments"
    echo "Failed deployments: $failed_deployments"
    echo ""
    
    if [[ $failed_deployments -gt 0 ]]; then
        warning "Some deployments failed. You may need to:"
        echo "1. Ensure target hosts are reachable"
        echo "2. Set up password authentication first"
        echo "3. Check network connectivity"
        return 1
    else
        success "All SSH keys are properly deployed!"
        return 0
    fi
}

# Verify all SSH connections
verify_all_connections() {
    log "Verifying SSH key authentication to all animatronic characters..."
    
    local total_hosts=0
    local successful_connections=0
    local failed_connections=0
    
    while IFS='|' read -r char_name host user; do
        if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
            ((total_hosts++))
            log "Testing $char_name at $user@$host..."
            
            if test_ssh_key_auth "$host" "$user"; then
                success "✅ $char_name - SSH key authentication successful"
                ((successful_connections++))
            else
                warning "❌ $char_name - SSH key authentication failed"
                ((failed_connections++))
            fi
        fi
    done < <(get_animatronic_hosts)
    
    echo ""
    echo "=================================="
    log "SSH Connection Verification Summary:"
    echo "=================================="
    echo "Total hosts: $total_hosts"
    echo "Successful connections: $successful_connections"
    echo "Failed connections: $failed_connections"
    echo ""
    
    return $failed_connections
}

# List all animatronic hosts
list_animatronic_hosts() {
    log "Listing all animatronic hosts from characters.json..."
    echo ""
    echo "Animatronic Characters:"
    echo "======================"

    local count=0
    while IFS='|' read -r char_name host user; do
        if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
            echo "  $char_name: $user@$host"
            ((count++))
        fi
    done < <(get_animatronic_hosts)

    echo ""
    log "Found $count enabled animatronic character(s)"
}

# Main function
main() {
    local command="${1:-deploy}"
    
    case "$command" in
        "deploy")
            check_prerequisites
            deploy_keys_to_all
            ;;
        "verify")
            check_prerequisites
            verify_all_connections
            ;;
        "list")
            check_prerequisites
            list_animatronic_hosts
            ;;
        "help"|"-h"|"--help")
            echo "MonsterBox SSH Key Deployment Script"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  deploy  - Deploy SSH keys to all animatronic characters (default)"
            echo "  verify  - Verify SSH key authentication to all characters"
            echo "  list    - List all animatronic characters and their hosts"
            echo "  help    - Show this help message"
            echo ""
            echo "Files:"
            echo "  Characters: $CHARACTERS_JSON"
            echo "  SSH Key: $SSH_KEY_PATH"
            echo "  Log File: $LOG_FILE"
            ;;
        *)
            error "Unknown command: $command. Use '$0 help' for usage information."
            ;;
    esac
}

# Run main function
main "$@"
