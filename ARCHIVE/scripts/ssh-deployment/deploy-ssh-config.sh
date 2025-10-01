#!/bin/bash

# SSH Key Deployment Script for MonsterBox Animatronic Network
# Dynamically deploys SSH keys to all animatronics based on characters.json
# Implements secure key-based authentication for webcam streaming and remote operations

set -euo pipefail

# Configuration variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONSTERBOX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHARACTERS_JSON="$MONSTERBOX_ROOT/data/characters.json"
SSH_PORT="${SSH_PORT:-22}"
SSH_USER="${SSH_USER:-remote}"
SSH_KEY_PATH="$SCRIPT_DIR/keys/monsterbox-dev"
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

# Check if characters.json exists and is readable
check_characters_json() {
    if [[ ! -f "$CHARACTERS_JSON" ]]; then
        error "Characters file not found: $CHARACTERS_JSON"
    fi

    if ! command -v jq >/dev/null 2>&1; then
        error "jq is required but not installed. Install with: sudo apt-get install jq"
    fi

    log "Found characters file: $CHARACTERS_JSON"
}

# Check if SSH key exists
check_ssh_key() {
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        error "SSH private key not found: $SSH_KEY_PATH"
    fi

    if [[ ! -f "$SSH_KEY_PATH.pub" ]]; then
        error "SSH public key not found: $SSH_KEY_PATH.pub"
    fi

    log "Found SSH keys: $SSH_KEY_PATH"
}

# Get list of animatronic characters with their IP addresses
get_animatronic_hosts() {
    jq -r '.[] | select(.animatronic.enabled == true) | "\(.char_name)|\(.animatronic.rpi_config.host)|\(.animatronic.rpi_config.user // "remote")"' "$CHARACTERS_JSON"
}

# Test SSH connectivity to a host
test_ssh_connectivity() {
    local host="$1"
    local user="$2"
    local timeout=10

    log "Testing SSH connectivity to $user@$host..."

    if ssh -i "$SSH_KEY_PATH" \
           -o ConnectTimeout=$timeout \
           -o StrictHostKeyChecking=accept-new \
           -o PasswordAuthentication=no \
           -o PubkeyAuthentication=yes \
           -o BatchMode=yes \
           "$user@$host" 'echo "SSH connection successful"' >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Deploy SSH key to a single host using ssh-copy-id
deploy_key_to_host() {
    local char_name="$1"
    local host="$2"
    local user="$3"

    log "Deploying SSH key to $char_name ($user@$host)..."

    # First try to deploy the key using ssh-copy-id
    if ssh-copy-id -i "$SSH_KEY_PATH.pub" \
                   -o ConnectTimeout=10 \
                   -o StrictHostKeyChecking=accept-new \
                   "$user@$host" >/dev/null 2>&1; then
        success "SSH key deployed to $char_name ($host)"
        return 0
    else
        warning "Failed to deploy SSH key to $char_name ($host) - may require password authentication first"
        return 1
    fi
}

# Clean up old SSH connections for removed characters
cleanup_removed_characters() {
    log "Cleaning up connections for removed characters..."

    # This function can be extended to clean up known_hosts entries
    # and other SSH-related cleanup when characters are removed
    # For now, we'll just log that cleanup would happen here

    log "SSH cleanup completed (placeholder for future implementation)"
}

# Display deployment summary
display_deployment_summary() {
    local ip_address
    ip_address=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "unknown")

    echo ""
    success "SSH key deployment summary:"
    echo ""
    echo "Configuration:"
    echo "============="
    echo "SSH Key: $SSH_KEY_PATH"
    echo "Characters File: $CHARACTERS_JSON"
    echo "Local IP: $ip_address"
    echo ""
    echo "Usage:"
    echo "======"
    echo "Deploy keys:  $0 deploy"
    echo "Verify keys:  $0 verify"
    echo "List hosts:   $0 list"
    echo ""
}



# Deploy SSH keys to all animatronics
deploy_keys_to_all_animatronics() {
    log "Deploying SSH keys to all animatronic hosts..."

    local deployment_results=()
    local successful_deployments=0
    local failed_deployments=0

    while IFS='|' read -r char_name host user; do
        if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
            log "Processing $char_name at $host..."

            # Test if key is already deployed
            if test_ssh_connectivity "$host" "$user"; then
                success "SSH key already deployed and working for $char_name ($host)"
                deployment_results+=("✅ $char_name ($host) - Already configured")
                ((successful_deployments++))
            else
                # Try to deploy the key
                if deploy_key_to_host "$char_name" "$host" "$user"; then
                    # Verify deployment worked
                    if test_ssh_connectivity "$host" "$user"; then
                        deployment_results+=("✅ $char_name ($host) - Successfully deployed")
                        ((successful_deployments++))
                    else
                        deployment_results+=("❌ $char_name ($host) - Deployed but connection test failed")
                        ((failed_deployments++))
                    fi
                else
                    deployment_results+=("❌ $char_name ($host) - Deployment failed")
                    ((failed_deployments++))
                fi
            fi
        fi
    done < <(get_animatronic_hosts)

    # Display results
    echo ""
    log "SSH Key Deployment Results:"
    echo "=========================="
    for result in "${deployment_results[@]}"; do
        echo "$result"
    done
    echo ""
    log "Summary: $successful_deployments successful, $failed_deployments failed"

    if [[ $failed_deployments -gt 0 ]]; then
        warning "Some deployments failed. Check network connectivity and ensure target hosts are accessible."
        echo "You may need to manually set up password authentication first, then re-run this script."
        return 1
    else
        success "All SSH keys deployed successfully!"
        return 0
    fi
}

# Verify all SSH connections
verify_all_connections() {
    log "Verifying SSH connections to all animatronics..."

    local verification_results=()
    local successful_connections=0
    local failed_connections=0

    while IFS='|' read -r char_name host user; do
        if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
            if test_ssh_connectivity "$host" "$user"; then
                verification_results+=("✅ $char_name ($host) - Connection successful")
                ((successful_connections++))
            else
                verification_results+=("❌ $char_name ($host) - Connection failed")
                ((failed_connections++))
            fi
        fi
    done < <(get_animatronic_hosts)

    # Display results
    echo ""
    log "SSH Connection Verification Results:"
    echo "==================================="
    for result in "${verification_results[@]}"; do
        echo "$result"
    done
    echo ""
    log "Summary: $successful_connections successful, $failed_connections failed"

    return $failed_connections
}

# Main deployment function
main() {
    local mode="${1:-deploy}"

    case "$mode" in
        "deploy")
            log "Starting SSH key deployment for MonsterBox animatronic network..."
            check_characters_json
            check_ssh_key
            deploy_keys_to_all_animatronics
            ;;
        "verify")
            log "Verifying SSH connections to MonsterBox animatronic network..."
            check_characters_json
            check_ssh_key
            verify_all_connections
            ;;
        "list")
            log "Listing MonsterBox animatronic hosts from characters.json..."
            check_characters_json
            echo ""
            echo "Animatronic Hosts:"
            echo "=================="
            while IFS='|' read -r char_name host user; do
                if [[ -n "$char_name" && -n "$host" && -n "$user" ]]; then
                    echo "  $char_name: $user@$host"
                fi
            done < <(get_animatronic_hosts)
            echo ""
            ;;
        *)
            echo "Usage: $0 [deploy|verify|list]"
            echo ""
            echo "Commands:"
            echo "  deploy  - Deploy SSH keys to all animatronics (default)"
            echo "  verify  - Verify SSH connections to all animatronics"
            echo "  list    - List all animatronic hosts from characters.json"
            exit 1
            ;;
    esac

    success "SSH key management completed successfully!"
}

# Run main function with all arguments
main "$@"
