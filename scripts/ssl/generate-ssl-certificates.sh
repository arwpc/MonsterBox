#!/bin/bash

# MonsterBox SSL Certificate Generation Script
# Generates self-signed SSL certificates for RPi4B devices
# Supports all four active devices: skulltalker, orlok, pumpkinhead, coffin

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/certificates"
CONFIG_DIR="$SCRIPT_DIR/configs"
LOG_FILE="$SCRIPT_DIR/ssl-generation.log"

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

# Certificate validity period (days)
CERT_VALIDITY_DAYS=3650  # 10 years for development use

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

# Check if OpenSSL is available
check_dependencies() {
    info "Checking dependencies..."
    
    if ! command -v openssl &> /dev/null; then
        error_exit "OpenSSL is not installed. Please install it first."
    fi
    
    success "All dependencies available"
}

# Create directory structure
setup_directories() {
    info "Setting up directory structure..."
    
    mkdir -p "$CERT_DIR"
    mkdir -p "$CONFIG_DIR"
    
    # Set proper permissions
    chmod 755 "$CERT_DIR"
    chmod 755 "$CONFIG_DIR"
    
    success "Directory structure created"
}

# Generate OpenSSL configuration for a device
generate_openssl_config() {
    local device_name="$1"
    local device_ip="$2"
    local config_file="$CONFIG_DIR/${device_name}.conf"
    
    info "Generating OpenSSL configuration for $device_name ($device_ip)..."
    
    cat > "$config_file" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=Development
L=MonsterBox
O=MonsterBox Animatronics
OU=Development
CN=${device_name}.monsterbox.local

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${device_name}
DNS.2 = ${device_name}.local
DNS.3 = ${device_name}.monsterbox.local
DNS.4 = localhost
IP.1 = ${device_ip}
IP.2 = 127.0.0.1
IP.3 = ::1
EOF

    success "OpenSSL configuration created for $device_name"
}

# Generate SSL certificate for a device
generate_certificate() {
    local device_name="$1"
    local device_ip="$2"
    local config_file="$CONFIG_DIR/${device_name}.conf"
    local key_file="$CERT_DIR/${device_name}.key"
    local cert_file="$CERT_DIR/${device_name}.crt"
    local csr_file="$CERT_DIR/${device_name}.csr"
    
    info "Generating SSL certificate for $device_name..."
    
    # Generate private key
    openssl genrsa -out "$key_file" 2048
    
    # Generate certificate signing request
    openssl req -new -key "$key_file" -out "$csr_file" -config "$config_file"
    
    # Generate self-signed certificate
    openssl x509 -req -in "$csr_file" -signkey "$key_file" -out "$cert_file" \
        -days "$CERT_VALIDITY_DAYS" -extensions v3_req -extfile "$config_file"
    
    # Set proper permissions
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
    
    # Clean up CSR file
    rm -f "$csr_file"
    
    success "SSL certificate generated for $device_name"
}

# Validate certificate
validate_certificate() {
    local device_name="$1"
    local cert_file="$CERT_DIR/${device_name}.crt"
    
    info "Validating certificate for $device_name..."
    
    # Check certificate validity
    if openssl x509 -in "$cert_file" -text -noout > /dev/null 2>&1; then
        success "Certificate validation passed for $device_name"
        
        # Display certificate info
        info "Certificate details for $device_name:"
        openssl x509 -in "$cert_file" -text -noout | grep -E "(Subject:|DNS:|IP Address:)" | head -10
    else
        error_exit "Certificate validation failed for $device_name"
    fi
}

# Create certificate bundle for deployment
create_certificate_bundle() {
    local device_name="$1"
    local bundle_file="$CERT_DIR/${device_name}-bundle.tar.gz"
    local key_file="$CERT_DIR/${device_name}.key"
    local cert_file="$CERT_DIR/${device_name}.crt"
    
    info "Creating certificate bundle for $device_name..."
    
    tar -czf "$bundle_file" -C "$CERT_DIR" "${device_name}.key" "${device_name}.crt"
    
    success "Certificate bundle created: $bundle_file"
}

# Generate certificate for specific device
generate_device_certificate() {
    local device_name="$1"
    
    if [[ -z "${DEVICES[$device_name]:-}" ]]; then
        error_exit "Unknown device: $device_name"
    fi
    
    local device_ip="${DEVICES[$device_name]}"
    
    info "Processing device: $device_name ($device_ip)"
    
    generate_openssl_config "$device_name" "$device_ip"
    generate_certificate "$device_name" "$device_ip"
    validate_certificate "$device_name"
    create_certificate_bundle "$device_name"
    
    success "Certificate generation completed for $device_name"
}

# Generate certificates for all devices
generate_all_certificates() {
    info "Generating SSL certificates for all MonsterBox devices..."
    
    for device_name in "${!DEVICES[@]}"; do
        generate_device_certificate "$device_name"
        echo ""
    done
    
    success "All certificates generated successfully!"
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS] [DEVICE]"
    echo ""
    echo "Generate SSL certificates for MonsterBox RPi4B devices"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help     Show this help message"
    echo "  -a, --all      Generate certificates for all devices"
    echo "  -l, --list     List available devices"
    echo "  -v, --validate Validate existing certificates"
    echo ""
    echo "DEVICES:"
    for device in "${!DEVICES[@]}"; do
        echo "  $device (${DEVICES[$device]})"
    done
    echo ""
    echo "Examples:"
    echo "  $0 --all                    # Generate certificates for all devices"
    echo "  $0 skulltalker             # Generate certificate for skulltalker only"
    echo "  $0 --validate orlok        # Validate existing certificate for orlok"
}

# List available devices
list_devices() {
    info "Available MonsterBox devices:"
    for device in "${!DEVICES[@]}"; do
        echo "  - $device (${DEVICES[$device]})"
    done
}

# Validate existing certificate
validate_existing_certificate() {
    local device_name="$1"
    
    if [[ -z "${DEVICES[$device_name]:-}" ]]; then
        error_exit "Unknown device: $device_name"
    fi
    
    local cert_file="$CERT_DIR/${device_name}.crt"
    
    if [[ ! -f "$cert_file" ]]; then
        error_exit "Certificate not found for $device_name: $cert_file"
    fi
    
    validate_certificate "$device_name"
}

# Main function
main() {
    # Initialize logging
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting SSL certificate generation..." > "$LOG_FILE"
    
    info "🔐 MonsterBox SSL Certificate Generator"
    info "======================================"
    
    # Check dependencies
    check_dependencies
    
    # Setup directories
    setup_directories
    
    # Parse command line arguments
    case "${1:-}" in
        -h|--help)
            usage
            exit 0
            ;;
        -a|--all)
            generate_all_certificates
            ;;
        -l|--list)
            list_devices
            ;;
        -v|--validate)
            if [[ -z "${2:-}" ]]; then
                error_exit "Device name required for validation"
            fi
            validate_existing_certificate "$2"
            ;;
        "")
            warning "No arguments provided. Use --help for usage information."
            usage
            exit 1
            ;;
        *)
            if [[ "${DEVICES[$1]:-}" ]]; then
                generate_device_certificate "$1"
            else
                error_exit "Unknown device or option: $1"
            fi
            ;;
    esac
    
    success "SSL certificate generation completed!"
}

# Run main function with all arguments
main "$@"
