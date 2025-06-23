#!/bin/bash

# MonsterBox SSL Certificate Installation Script
# Installs SSL certificates on RPi4B devices for HTTPS support

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_SOURCE_DIR="$SCRIPT_DIR/certificates"
CERT_INSTALL_DIR="/etc/ssl/monsterbox"
LOG_FILE="$SCRIPT_DIR/ssl-installation.log"

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

# Detect current device
detect_current_device() {
    local hostname=$(hostname)
    local current_ip=$(hostname -I | awk '{print $1}')

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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root (use sudo)"
    fi
}

# Create certificate installation directory
setup_certificate_directory() {
    info "Setting up certificate installation directory..."
    
    mkdir -p "$CERT_INSTALL_DIR"
    chmod 755 "$CERT_INSTALL_DIR"
    
    success "Certificate directory created: $CERT_INSTALL_DIR"
}

# Install certificates for a device
install_device_certificates() {
    local device_name="$1"
    local source_key="$CERT_SOURCE_DIR/${device_name}.key"
    local source_cert="$CERT_SOURCE_DIR/${device_name}.crt"
    local dest_key="$CERT_INSTALL_DIR/${device_name}.key"
    local dest_cert="$CERT_INSTALL_DIR/${device_name}.crt"
    
    info "Installing certificates for $device_name..."
    
    # Check if source certificates exist
    if [[ ! -f "$source_key" ]]; then
        error_exit "Private key not found: $source_key"
    fi
    
    if [[ ! -f "$source_cert" ]]; then
        error_exit "Certificate not found: $source_cert"
    fi
    
    # Copy certificates to installation directory
    cp "$source_key" "$dest_key"
    cp "$source_cert" "$dest_cert"
    
    # Set proper permissions
    chmod 600 "$dest_key"
    chmod 644 "$dest_cert"
    
    # Set ownership to root
    chown root:root "$dest_key" "$dest_cert"
    
    success "Certificates installed for $device_name"
    
    # Create symbolic links for easy access
    ln -sf "$dest_key" "$CERT_INSTALL_DIR/server.key"
    ln -sf "$dest_cert" "$CERT_INSTALL_DIR/server.crt"
    
    success "Symbolic links created for easy access"
}

# Validate installed certificates
validate_installed_certificates() {
    local device_name="$1"
    local cert_file="$CERT_INSTALL_DIR/${device_name}.crt"
    local key_file="$CERT_INSTALL_DIR/${device_name}.key"
    
    info "Validating installed certificates for $device_name..."
    
    # Check certificate file
    if [[ ! -f "$cert_file" ]]; then
        error_exit "Certificate file not found: $cert_file"
    fi
    
    # Check private key file
    if [[ ! -f "$key_file" ]]; then
        error_exit "Private key file not found: $key_file"
    fi
    
    # Validate certificate
    if openssl x509 -in "$cert_file" -text -noout > /dev/null 2>&1; then
        success "Certificate validation passed"
    else
        error_exit "Certificate validation failed"
    fi
    
    # Check if private key matches certificate
    local cert_modulus=$(openssl x509 -noout -modulus -in "$cert_file" | openssl md5)
    local key_modulus=$(openssl rsa -noout -modulus -in "$key_file" | openssl md5)
    
    if [[ "$cert_modulus" == "$key_modulus" ]]; then
        success "Private key matches certificate"
    else
        error_exit "Private key does not match certificate"
    fi
    
    # Display certificate information
    info "Certificate details:"
    openssl x509 -in "$cert_file" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:|IP Address:)" | head -15
}

# Create certificate configuration file for applications
create_certificate_config() {
    local device_name="$1"
    local config_file="$CERT_INSTALL_DIR/ssl-config.json"
    
    info "Creating SSL configuration file..."
    
    cat > "$config_file" << EOF
{
  "device": "$device_name",
  "certificates": {
    "key": "$CERT_INSTALL_DIR/${device_name}.key",
    "cert": "$CERT_INSTALL_DIR/${device_name}.crt",
    "keySymlink": "$CERT_INSTALL_DIR/server.key",
    "certSymlink": "$CERT_INSTALL_DIR/server.crt"
  },
  "https": {
    "enabled": true,
    "port": 8080,
    "redirectHttp": true
  },
  "websocket": {
    "secure": true,
    "port": 8765
  },
  "installation": {
    "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "1.0.0"
  }
}
EOF

    chmod 644 "$config_file"
    success "SSL configuration file created: $config_file"
}

# Update system certificate store (optional)
update_system_certificates() {
    local device_name="$1"
    local cert_file="$CERT_INSTALL_DIR/${device_name}.crt"
    local system_cert_dir="/usr/local/share/ca-certificates"
    local system_cert_file="$system_cert_dir/monsterbox-${device_name}.crt"
    
    info "Adding certificate to system certificate store..."
    
    # Copy certificate to system certificate directory
    cp "$cert_file" "$system_cert_file"
    chmod 644 "$system_cert_file"
    
    # Update certificate store
    if command -v update-ca-certificates &> /dev/null; then
        update-ca-certificates
        success "System certificate store updated"
    else
        warning "update-ca-certificates not available, skipping system certificate store update"
    fi
}

# Display installation summary
display_summary() {
    local device_name="$1"
    
    info "🔐 SSL Certificate Installation Summary"
    info "======================================"
    info "Device: $device_name"
    info "Certificate Directory: $CERT_INSTALL_DIR"
    info "Certificate File: $CERT_INSTALL_DIR/${device_name}.crt"
    info "Private Key File: $CERT_INSTALL_DIR/${device_name}.key"
    info "Configuration File: $CERT_INSTALL_DIR/ssl-config.json"
    info ""
    info "Next Steps:"
    info "1. Restart MonsterBox services to enable HTTPS"
    info "2. Access web interface using https://$device_name:8080"
    info "3. Accept browser security warning for self-signed certificate"
    info ""
    success "SSL certificate installation completed!"
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS] [DEVICE]"
    echo ""
    echo "Install SSL certificates on MonsterBox RPi4B devices"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  -a, --auto     Auto-detect current device and install"
    echo "  -l, --list     List available devices"
    echo "  -s, --system   Update system certificate store"
    echo ""
    echo "DEVICES:"
    for device in "${!DEVICES[@]}"; do
        echo "  $device (${DEVICES[$device]})"
    done
    echo ""
    echo "Examples:"
    echo "  sudo $0 --auto              # Auto-detect and install"
    echo "  sudo $0 skulltalker         # Install for skulltalker"
    echo "  sudo $0 orlok --system      # Install for orlok and update system store"
}

# Main function
main() {
    # Initialize logging
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting SSL certificate installation..." > "$LOG_FILE"
    
    info "🔐 MonsterBox SSL Certificate Installer"
    info "======================================="
    
    # Check if running as root
    check_root
    
    # Setup certificate directory
    setup_certificate_directory
    
    local device_name=""
    local update_system=false
    
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
            -s|--system)
                update_system=true
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
    
    # Install certificates
    install_device_certificates "$device_name"
    validate_installed_certificates "$device_name"
    create_certificate_config "$device_name"
    
    # Update system certificate store if requested
    if [[ "$update_system" == true ]]; then
        update_system_certificates "$device_name"
    fi
    
    # Display summary
    display_summary "$device_name"
}

# Run main function with all arguments
main "$@"
