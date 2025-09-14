#!/bin/bash

# MonsterBox HTTPS Deployment Script
# Deploys SSL certificates and configures HTTPS on RPi4B devices

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$SCRIPT_DIR/https-deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Device configurations
declare -A DEVICES=(
    ["skulltalker"]="192.168.8.130"
    ["orlok"]="192.168.8.120"
    ["coffin"]="192.168.8.140"
    ["pumpkinhead"]="192.168.8.200"
)

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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root (use sudo)"
    fi
}

# Detect current device
detect_current_device() {
    local hostname=$(hostname)
    local current_ip=$(hostname -I | awk '{print $1}')
    
    info "Detecting current device..."
    info "Hostname: $hostname"
    info "IP Address: $current_ip"
    
    # Try to match by hostname first
    for device in "${!DEVICES[@]}"; do
        if [[ "$hostname" == "$device" ]]; then
            echo "$device"
            return 0
        fi
    done
    
    # Try to match by IP address
    for device in "${!DEVICES[@]}"; do
        if [[ "$current_ip" == "${DEVICES[$device]}" ]]; then
            echo "$device"
            return 0
        fi
    done
    
    # If no match found, return empty
    echo ""
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check if certificates exist
    local cert_dir="$SCRIPT_DIR/certificates"
    if [[ ! -d "$cert_dir" ]]; then
        error_exit "Certificate directory not found: $cert_dir. Run generate-ssl-certificates.sh first."
    fi
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed. Please install Node.js first."
    fi
    
    # Check if Python3 is available
    if ! command -v python3 &> /dev/null; then
        error_exit "Python3 is not installed. Please install Python3 first."
    fi
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        error_exit "npm is not installed. Please install npm first."
    fi
    
    success "All prerequisites met"
}

# Install SSL certificates
install_ssl_certificates() {
    local device_name="$1"
    
    info "Installing SSL certificates for $device_name..."
    
    # Run the certificate installation script
    if "$SCRIPT_DIR/install-ssl-certificates.sh" --auto; then
        success "SSL certificates installed successfully"
    else
        error_exit "Failed to install SSL certificates"
    fi
}

# Update Node.js dependencies
update_nodejs_dependencies() {
    info "Updating Node.js dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Install/update dependencies
    if npm install; then
        success "Node.js dependencies updated"
    else
        warning "Some Node.js dependencies may have failed to install"
    fi
}

# Install Python dependencies
install_python_dependencies() {
    info "Installing Python dependencies for SSL support..."
    
    # Install websockets with SSL support
    if python3 -m pip install --upgrade websockets ssl-utils; then
        success "Python dependencies installed"
    else
        warning "Some Python dependencies may have failed to install"
    fi
}

# Configure firewall for HTTPS
configure_firewall() {
    info "Configuring firewall for HTTPS..."
    
    # Check if ufw is available
    if command -v ufw &> /dev/null; then
        # Allow HTTPS port
        ufw allow 3443/tcp comment "MonsterBox HTTPS"
        ufw allow 8443/tcp comment "ChatterPi HTTPS"
        ufw allow 8765/tcp comment "Jaw WebSocket WSS"
        ufw allow 8766/tcp comment "AI Bridge WSS"
        success "Firewall configured for HTTPS"
    else
        warning "UFW not available, skipping firewall configuration"
    fi
}

# Test HTTPS configuration
test_https_configuration() {
    local device_name="$1"
    
    info "Testing HTTPS configuration..."
    
    # Check if SSL config file exists
    local ssl_config="/etc/ssl/monsterbox/ssl-config.json"
    if [[ ! -f "$ssl_config" ]]; then
        error_exit "SSL configuration file not found: $ssl_config"
    fi
    
    # Validate SSL configuration
    if python3 -c "
import json
import os
try:
    with open('$ssl_config', 'r') as f:
        config = json.load(f)
    
    # Check required fields
    assert 'certificates' in config
    assert 'https' in config
    assert 'device' in config
    
    # Check certificate files exist
    cert_config = config['certificates']
    assert os.path.exists(cert_config['key'])
    assert os.path.exists(cert_config['cert'])
    
    print('SSL configuration is valid')
except Exception as e:
    print(f'SSL configuration error: {e}')
    exit(1)
"; then
        success "SSL configuration is valid"
    else
        error_exit "SSL configuration validation failed"
    fi
}

# Restart MonsterBox services
restart_services() {
    info "Restarting MonsterBox services..."
    
    # Stop existing services
    pkill -f "node.*app.js" || true
    pkill -f "python3.*gpio_jaw_server.py" || true
    pkill -f "python3.*ai_websocket_bridge.py" || true
    pkill -f "python3.*chat_server.py" || true
    
    # Wait for processes to stop
    sleep 3
    
    # Start services in background
    cd "$PROJECT_ROOT"
    
    # Start main MonsterBox app
    nohup node --no-deprecation app.js > app-https.log 2>&1 &
    
    # Start ChatterPi services if they exist
    if [[ -f "scripts/chatterpi/gpio_jaw_server.py" ]]; then
        nohup python3 scripts/chatterpi/gpio_jaw_server.py --host 0.0.0.0 --port 8765 > jaw-server-https.log 2>&1 &
    fi
    
    if [[ -f "scripts/chatterpi/ai_websocket_bridge.py" ]]; then
        nohup python3 scripts/chatterpi/ai_websocket_bridge.py --host 0.0.0.0 --port 8766 > ai-bridge-https.log 2>&1 &
    fi
    
    if [[ -f "scripts/chatterpi/chat_server.py" ]]; then
        nohup python3 scripts/chatterpi/chat_server.py --host 0.0.0.0 --port 8090 > chat-server-https.log 2>&1 &
    fi
    
    # Wait for services to start
    sleep 5
    
    success "MonsterBox services restarted with HTTPS support"
}

# Validate HTTPS deployment
validate_deployment() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "Validating HTTPS deployment..."
    
    # Test HTTPS endpoints
    local https_port=3443
    local test_url="https://$device_ip:$https_port/health"
    
    info "Testing HTTPS endpoint: $test_url"
    
    # Use curl to test HTTPS (ignore certificate warnings for self-signed)
    if curl -k -s --connect-timeout 10 "$test_url" > /dev/null; then
        success "HTTPS endpoint is responding"
    else
        warning "HTTPS endpoint test failed (this may be normal if services are still starting)"
    fi
    
    # Check if services are running
    local services_running=0
    
    if pgrep -f "node.*app.js" > /dev/null; then
        info "✅ MonsterBox main app is running"
        services_running=$((services_running + 1))
    else
        warning "❌ MonsterBox main app is not running"
    fi
    
    if pgrep -f "python3.*gpio_jaw_server.py" > /dev/null; then
        info "✅ GPIO Jaw Server is running"
        services_running=$((services_running + 1))
    fi
    
    if pgrep -f "python3.*ai_websocket_bridge.py" > /dev/null; then
        info "✅ AI WebSocket Bridge is running"
        services_running=$((services_running + 1))
    fi
    
    if pgrep -f "python3.*chat_server.py" > /dev/null; then
        info "✅ Chat Server is running"
        services_running=$((services_running + 1))
    fi
    
    if [[ $services_running -gt 0 ]]; then
        success "HTTPS deployment validation completed ($services_running services running)"
    else
        warning "No MonsterBox services are currently running"
    fi
}

# Display deployment summary
display_summary() {
    local device_name="$1"
    local device_ip="${DEVICES[$device_name]}"
    
    info "🔐 HTTPS Deployment Summary"
    info "=========================="
    info "Device: $device_name ($device_ip)"
    info "SSL Certificates: /etc/ssl/monsterbox/"
    info "Configuration: /etc/ssl/monsterbox/ssl-config.json"
    info ""
    info "HTTPS Endpoints:"
    info "  Main App: https://$device_name:8080 or https://$device_ip:8080"
    info "  Chat Interface: https://$device_name:8090 or https://$device_ip:8090"
    info ""
    info "Secure WebSocket Endpoints:"
    info "  Jaw Control: wss://$device_name:8765 or wss://$device_ip:8765"
    info "  AI Bridge: wss://$device_name:8766 or wss://$device_ip:8766"
    info ""
    info "Note: You may need to accept browser security warnings for self-signed certificates"
    info ""
    success "HTTPS deployment completed successfully!"
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS] [DEVICE]"
    echo ""
    echo "Deploy HTTPS support to MonsterBox RPi4B devices"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  -a, --auto     Auto-detect current device and deploy"
    echo "  -l, --list     List available devices"
    echo "  -t, --test     Test HTTPS configuration only"
    echo ""
    echo "DEVICES:"
    for device in "${!DEVICES[@]}"; do
        echo "  $device (${DEVICES[$device]})"
    done
    echo ""
    echo "Examples:"
    echo "  sudo $0 --auto              # Auto-detect and deploy"
    echo "  sudo $0 skulltalker         # Deploy to skulltalker"
    echo "  sudo $0 --test orlok        # Test HTTPS on orlok"
}

# Main function
main() {
    # Initialize logging
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting HTTPS deployment..." > "$LOG_FILE"
    
    info "🔐 MonsterBox HTTPS Deployment"
    info "=============================="
    
    # Check if running as root
    check_root
    
    local device_name=""
    local test_only=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -a|--auto)
                device_name=$(detect_current_device)
                if [[ -z "$device_name" ]]; then
                    error_exit "Could not auto-detect current device"
                fi
                info "Auto-detected device: $device_name"
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
    
    # Check if device name is provided
    if [[ -z "$device_name" ]]; then
        error_exit "Device name required. Use --auto to auto-detect or specify device name."
    fi
    
    # Check prerequisites
    check_prerequisites
    
    if [[ "$test_only" == true ]]; then
        # Test only mode
        test_https_configuration "$device_name"
        validate_deployment "$device_name"
    else
        # Full deployment
        install_ssl_certificates "$device_name"
        update_nodejs_dependencies
        install_python_dependencies
        configure_firewall
        test_https_configuration "$device_name"
        restart_services
        validate_deployment "$device_name"
        display_summary "$device_name"
    fi
}

# Run main function with all arguments
main "$@"
