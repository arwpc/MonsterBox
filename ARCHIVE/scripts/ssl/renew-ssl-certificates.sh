#!/bin/bash

# MonsterBox SSL Certificate Renewal Script
# Automatically renews SSL certificates before expiration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/certificates"
LOG_FILE="$SCRIPT_DIR/ssl-renewal.log"
RENEWAL_THRESHOLD_DAYS=30  # Renew if certificate expires within 30 days

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

# Check certificate expiration
check_certificate_expiration() {
    local device_name="$1"
    local cert_file="$CERT_DIR/${device_name}.crt"
    
    if [[ ! -f "$cert_file" ]]; then
        warning "Certificate not found for $device_name: $cert_file"
        return 1
    fi
    
    # Get certificate expiration date
    local expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
    local expiry_epoch=$(date -d "$expiry_date" +%s)
    local current_epoch=$(date +%s)
    local threshold_epoch=$((current_epoch + RENEWAL_THRESHOLD_DAYS * 24 * 3600))
    
    info "Certificate for $device_name expires: $expiry_date"
    
    if [[ $expiry_epoch -lt $threshold_epoch ]]; then
        warning "Certificate for $device_name expires within $RENEWAL_THRESHOLD_DAYS days"
        return 0  # Needs renewal
    else
        local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
        success "Certificate for $device_name is valid for $days_until_expiry more days"
        return 1  # No renewal needed
    fi
}

# Renew certificate for a device
renew_certificate() {
    local device_name="$1"
    
    info "Renewing certificate for $device_name..."
    
    # Backup existing certificate
    local backup_dir="$CERT_DIR/backup/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    if [[ -f "$CERT_DIR/${device_name}.crt" ]]; then
        cp "$CERT_DIR/${device_name}.crt" "$backup_dir/"
        cp "$CERT_DIR/${device_name}.key" "$backup_dir/"
        success "Existing certificates backed up to $backup_dir"
    fi
    
    # Generate new certificate
    if "$SCRIPT_DIR/generate-ssl-certificates.sh" "$device_name"; then
        success "Certificate renewed for $device_name"
        return 0
    else
        error_exit "Failed to renew certificate for $device_name"
    fi
}

# Check and renew certificates for all devices
check_and_renew_all() {
    info "Checking all certificates for renewal..."
    
    local renewed_count=0
    local total_count=0
    
    for device_name in "${!DEVICES[@]}"; do
        total_count=$((total_count + 1))
        info "Checking certificate for $device_name..."
        
        if check_certificate_expiration "$device_name"; then
            renew_certificate "$device_name"
            renewed_count=$((renewed_count + 1))
        fi
        
        echo ""
    done
    
    info "Certificate renewal summary:"
    info "- Total certificates checked: $total_count"
    info "- Certificates renewed: $renewed_count"
    
    if [[ $renewed_count -gt 0 ]]; then
        warning "Some certificates were renewed. Consider restarting services to use new certificates."
    fi
}

# Force renewal of specific certificate
force_renew() {
    local device_name="$1"
    
    if [[ -z "${DEVICES[$device_name]:-}" ]]; then
        error_exit "Unknown device: $device_name"
    fi
    
    info "Force renewing certificate for $device_name..."
    renew_certificate "$device_name"
}

# Display certificate status
show_certificate_status() {
    info "Certificate Status Report"
    info "========================"
    
    for device_name in "${!DEVICES[@]}"; do
        local cert_file="$CERT_DIR/${device_name}.crt"
        
        if [[ -f "$cert_file" ]]; then
            local expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
            local expiry_epoch=$(date -d "$expiry_date" +%s)
            local current_epoch=$(date +%s)
            local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
            
            if [[ $days_until_expiry -lt 0 ]]; then
                print_status "$RED" "$device_name: EXPIRED ($expiry_date)"
            elif [[ $days_until_expiry -lt $RENEWAL_THRESHOLD_DAYS ]]; then
                print_status "$YELLOW" "$device_name: Expires in $days_until_expiry days ($expiry_date)"
            else
                print_status "$GREEN" "$device_name: Valid for $days_until_expiry days ($expiry_date)"
            fi
        else
            print_status "$RED" "$device_name: Certificate not found"
        fi
    done
}

# Setup cron job for automatic renewal
setup_cron_job() {
    local cron_schedule="0 2 * * 0"  # Run every Sunday at 2 AM
    local cron_command="$SCRIPT_DIR/renew-ssl-certificates.sh --check-all"
    local cron_entry="$cron_schedule $cron_command >> $LOG_FILE 2>&1"
    
    info "Setting up automatic certificate renewal..."
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "$SCRIPT_DIR/renew-ssl-certificates.sh"; then
        warning "Cron job already exists for certificate renewal"
        return 0
    fi
    
    # Add cron job
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    
    success "Automatic certificate renewal scheduled (every Sunday at 2 AM)"
    info "Cron entry: $cron_entry"
}

# Remove cron job
remove_cron_job() {
    info "Removing automatic certificate renewal..."
    
    # Remove cron job
    crontab -l 2>/dev/null | grep -v "$SCRIPT_DIR/renew-ssl-certificates.sh" | crontab -
    
    success "Automatic certificate renewal removed"
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS] [DEVICE]"
    echo ""
    echo "Manage SSL certificate renewal for MonsterBox RPi4B devices"
    echo ""
    echo "OPTIONS:"
    echo "  -h, --help         Show this help message"
    echo "  -c, --check-all    Check all certificates and renew if needed"
    echo "  -s, --status       Show certificate status for all devices"
    echo "  -f, --force        Force renewal of specific device certificate"
    echo "  --setup-cron       Setup automatic renewal cron job"
    echo "  --remove-cron      Remove automatic renewal cron job"
    echo ""
    echo "DEVICES:"
    for device in "${!DEVICES[@]}"; do
        echo "  $device (${DEVICES[$device]})"
    done
    echo ""
    echo "Examples:"
    echo "  $0 --check-all              # Check and renew certificates as needed"
    echo "  $0 --status                 # Show certificate status"
    echo "  $0 --force skulltalker      # Force renew skulltalker certificate"
    echo "  $0 --setup-cron             # Setup automatic renewal"
}

# Main function
main() {
    # Initialize logging
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting SSL certificate renewal check..." >> "$LOG_FILE"
    
    info "🔄 MonsterBox SSL Certificate Renewal"
    info "====================================="
    
    # Parse command line arguments
    case "${1:-}" in
        -h|--help)
            usage
            exit 0
            ;;
        -c|--check-all)
            check_and_renew_all
            ;;
        -s|--status)
            show_certificate_status
            ;;
        -f|--force)
            if [[ -z "${2:-}" ]]; then
                error_exit "Device name required for force renewal"
            fi
            force_renew "$2"
            ;;
        --setup-cron)
            setup_cron_job
            ;;
        --remove-cron)
            remove_cron_job
            ;;
        "")
            warning "No arguments provided. Use --help for usage information."
            usage
            exit 1
            ;;
        *)
            error_exit "Unknown option: $1"
            ;;
    esac
    
    success "Certificate renewal operation completed!"
}

# Run main function with all arguments
main "$@"
