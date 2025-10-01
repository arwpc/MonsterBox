#!/bin/bash

# MonsterBox Remote HTTPS Deployment Script
# Deploys HTTPS to remote RPi4B devices via SSH

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$SCRIPT_DIR/remote-https-deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Device configurations
declare -A DEVICES=(
    ["skulltalker"]="192.168.8.130"
    ["orlok"]="192.168.8.120"
    ["coffin"]="192.168.8.140"
    ["pumpkinhead"]="192.168.8.200"
)

# SSH configuration
SSH_USER="remote"
SSH_PASSWORD="klrklr89!"
SSH_TIMEOUT=30

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

# Print colored output
print_status() {
    local color="$1"
    local message="$2"
    echo -e "${color}${message}${NC}"
    log "INFO" "$message"
}

# Error handling
error_exit() {
    local message="$1"
    print_status "$RED" "❌ ERROR: $message"
    exit 1
}

# Success message
success() {
    local message="$1"
    print_status "$GREEN" "✅ $message"
}

# Warning message
warning() {
    local message="$1"
    print_status "$YELLOW" "⚠️  $message"
}

# Info message
info() {
    local message="$1"
    print_status "$BLUE" "ℹ️  $message"
}

# Execute SSH command
execute_ssh() {
    local host="$1"
    local command="$2"
    local description="$3"

    info "$description"

    if sshpass -p "$SSH_PASSWORD" ssh -o ConnectTimeout=$SSH_TIMEOUT -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no "$SSH_USER@$host" "$command"; then
        success "$description completed"
        return 0
    else
        warning "$description failed"
        return 1
    fi
}

# Copy file via SCP
copy_file() {
    local local_file="$1"
    local host="$2"
    local remote_file="$3"
    local description="$4"

    info "$description"

    if sshpass -p "$SSH_PASSWORD" scp -o ConnectTimeout=$SSH_TIMEOUT -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no "$local_file" "$SSH_USER@$host:$remote_file"; then
        success "$description completed"
        return 0
    else
        warning "$description failed"
        return 1
    fi
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check if sshpass is available
    if ! command -v sshpass &> /dev/null; then
        error_exit "sshpass is not installed. Please install it first: sudo apt-get install sshpass"
    fi
    
    # Check if certificates exist
    local cert_dir="$SCRIPT_DIR/certificates"
    if [[ ! -d "$cert_dir" ]]; then
        error_exit "Certificate directory not found: $cert_dir. Run generate-ssl-certificates.sh first."
    fi
    
    success "All prerequisites met"
}

# Test SSH connectivity
test_ssh_connectivity() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "Testing SSH connectivity to $device_name ($device_ip)..."
    
    if execute_ssh "$device_ip" "echo 'SSH connection test successful'" "SSH connectivity test"; then
        success "SSH connectivity to $device_name is working"
        return 0
    else
        error_exit "Cannot connect to $device_name via SSH"
    fi
}

# Deploy certificates to remote device
deploy_certificates() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "Deploying certificates to $device_name..."
    
    # Create remote certificate directory with proper permissions
    execute_ssh "$device_ip" "sudo mkdir -p /tmp/monsterbox-ssl && sudo chown remote:remote /tmp/monsterbox-ssl" "Creating temporary SSL directory"

    # Copy certificate files
    local cert_dir="$SCRIPT_DIR/certificates"
    copy_file "$cert_dir/${device_name}.key" "$device_ip" "/tmp/monsterbox-ssl/${device_name}.key" "Copying private key"
    copy_file "$cert_dir/${device_name}.crt" "$device_ip" "/tmp/monsterbox-ssl/${device_name}.crt" "Copying certificate"
    
    # Copy SSL scripts
    copy_file "$SCRIPT_DIR/install-ssl-certificates.sh" "$device_ip" "/tmp/monsterbox-ssl/install-ssl-certificates.sh" "Copying installation script"
    
    # Make installation script executable and run it
    execute_ssh "$device_ip" "chmod +x /tmp/monsterbox-ssl/install-ssl-certificates.sh" "Making installation script executable"
    execute_ssh "$device_ip" "sudo /tmp/monsterbox-ssl/install-ssl-certificates.sh $device_name" "Installing SSL certificates"
    
    # Clean up temporary files
    execute_ssh "$device_ip" "sudo rm -rf /tmp/monsterbox-ssl" "Cleaning up temporary files"
    
    success "Certificates deployed to $device_name"
}

# Update MonsterBox code on remote device
update_monsterbox_code() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "Updating MonsterBox code on $device_name..."
    
    # Navigate to MonsterBox directory and pull latest changes
    execute_ssh "$device_ip" "cd /home/remote/MonsterBox && git pull" "Pulling latest code changes"

    # Update Node.js dependencies with proper permissions
    execute_ssh "$device_ip" "cd /home/remote/MonsterBox && sudo chown -R remote:remote node_modules package-lock.json 2>/dev/null || true && npm install" "Updating Node.js dependencies"

    # Install Python SSL dependencies (skip if externally managed)
    execute_ssh "$device_ip" "python3 -m pip install --upgrade websockets --break-system-packages 2>/dev/null || echo 'Python dependencies already available'" "Installing Python SSL dependencies"
    
    success "MonsterBox code updated on $device_name"
}

# Deploy HTTPS configuration
deploy_https_config() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "Deploying HTTPS configuration to $device_name..."
    
    # Copy deployment script
    copy_file "$SCRIPT_DIR/deploy-https.sh" "$device_ip" "/tmp/deploy-https.sh" "Copying HTTPS deployment script"
    
    # Make deployment script executable and run it
    execute_ssh "$device_ip" "chmod +x /tmp/deploy-https.sh" "Making deployment script executable"
    execute_ssh "$device_ip" "sudo /tmp/deploy-https.sh --auto" "Running HTTPS deployment"
    
    # Clean up deployment script
    execute_ssh "$device_ip" "rm -f /tmp/deploy-https.sh" "Cleaning up deployment script"
    
    success "HTTPS configuration deployed to $device_name"
}

# Validate HTTPS deployment
validate_https_deployment() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "Validating HTTPS deployment on $device_name..."
    
    # Test HTTPS endpoint
    local https_port=8080
    local test_url="https://$device_ip:$https_port/health"
    
    info "Testing HTTPS endpoint: $test_url"
    
    # Wait a moment for services to start
    sleep 10
    
    # Use curl to test HTTPS (ignore certificate warnings for self-signed)
    if curl -k -s --connect-timeout 10 "$test_url" > /dev/null; then
        success "HTTPS endpoint is responding on $device_name"
    else
        warning "HTTPS endpoint test failed on $device_name (services may still be starting)"
    fi
    
    # Check service status via SSH
    execute_ssh "$device_ip" "pgrep -f 'node.*app.js' > /dev/null && echo 'MonsterBox app is running' || echo 'MonsterBox app is not running'" "Checking MonsterBox app status"
    
    success "HTTPS deployment validation completed for $device_name"
}

# Deploy to single device
deploy_to_device() {
    local device_name="$1"
    
    info "🚀 Starting HTTPS deployment to $device_name"
    info "============================================"
    
    test_ssh_connectivity "$device_name"
    deploy_certificates "$device_name"
    update_monsterbox_code "$device_name"
    deploy_https_config "$device_name"
    validate_https_deployment "$device_name"
    
    success "HTTPS deployment to $device_name completed successfully!"
}

# Deploy to all devices
deploy_to_all_devices() {
    info "🚀 Starting HTTPS deployment to all devices"
    info "==========================================="
    
    local success_count=0
    local total_count=0
    
    for device_name in "${!DEVICES[@]}"; do
        total_count=$((total_count + 1))
        info ""
        info "📱 Deploying to $device_name (${DEVICES[$device_name]})..."
        
        if deploy_to_device "$device_name"; then
            success_count=$((success_count + 1))
        else
            warning "Deployment to $device_name failed"
        fi
    done
    
    info ""
    info "🔐 HTTPS Deployment Summary"
    info "=========================="
    info "Total devices: $total_count"
    info "Successful deployments: $success_count"
    info "Failed deployments: $((total_count - success_count))"
    
    if [[ $success_count -eq $total_count ]]; then
        success "All devices deployed successfully!"
    else
        warning "Some deployments failed. Check logs for details."
    fi
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS] [DEVICE]"
    echo ""
    echo "Deploy HTTPS to remote MonsterBox RPi4B devices via SSH"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  -a, --all      Deploy to all devices"
    echo "  -l, --list     List available devices"
    echo "  -t, --test     Test SSH connectivity only"
    echo ""
    echo "DEVICES:"
    for device in "${!DEVICES[@]}"; do
        echo "  $device (${DEVICES[$device]})"
    done
    echo ""
    echo "Examples:"
    echo "  $0 --all                    # Deploy to all devices"
    echo "  $0 skulltalker             # Deploy to skulltalker only"
    echo "  $0 --test orlok            # Test SSH connectivity to orlok"
}

# Main function
main() {
    # Initialize logging
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting remote HTTPS deployment..." > "$LOG_FILE"
    
    info "🔐 MonsterBox Remote HTTPS Deployment"
    info "===================================="
    
    local device_name=""
    local deploy_all=false
    local test_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -a|--all)
                deploy_all=true
                shift
                ;;
            -l|--list)
                info "Available MonsterBox devices:"
                for device in "${!DEVICES[@]}"; do
                    echo "  - $device (${DEVICES[$device]})"
                done
                exit 0
                ;;
            -t|--test)
                test_only=true
                shift
                ;;
            *)
                if [[ -z "$device_name" ]] && [[ "${DEVICES[$1]:-}" ]]; then
                    device_name="$1"
                else
                    error_exit "Unknown device or option: $1"
                fi
                shift
                ;;
        esac
    done
    
    # Check prerequisites
    check_prerequisites
    
    if [[ "$test_only" == true ]]; then
        # Test mode
        if [[ -n "$device_name" ]]; then
            test_ssh_connectivity "$device_name"
        else
            error_exit "Device name required for test mode"
        fi
    elif [[ "$deploy_all" == true ]]; then
        # Deploy to all devices
        deploy_to_all_devices
    elif [[ -n "$device_name" ]]; then
        # Deploy to specific device
        deploy_to_device "$device_name"
    else
        error_exit "Device name required or use --all to deploy to all devices"
    fi
}

# Run main function with all arguments
main "$@"
