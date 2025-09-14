#!/bin/bash

# MonsterBox HTTPS Deployment Testing Script
# Comprehensive testing of HTTPS functionality across all devices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" >> "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >> "$LOG_FILE"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/https-testing.log"
TIMEOUT=10

# Device configurations
declare -A DEVICES=(
    ["skulltalker"]="192.168.8.130"
    ["orlok"]="192.168.8.120"
    ["coffin"]="192.168.8.140"
    ["pumpkinhead"]="192.168.8.200"
)

# Test results
declare -A TEST_RESULTS

# Initialize log file
echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting HTTPS deployment testing" > "$LOG_FILE"

show_help() {
    cat << EOF
MonsterBox HTTPS Deployment Testing Script

This script performs comprehensive testing of HTTPS functionality across MonsterBox devices.

Usage: $0 [OPTION] [DEVICE]

Options:
    --help              Show this help message
    --test-all          Test all devices
    --test-device       Test a specific device
    --test-local        Test local device only
    --test-certificates Test certificate validity
    --test-services     Test service connectivity
    --report            Generate test report

Devices:
    skulltalker         192.168.8.130
    orlok               192.168.8.120
    coffin              192.168.8.140
    pumpkinhead         192.168.8.200

Examples:
    $0 --test-all
    $0 --test-device skulltalker
    $0 --test-local
    $0 --report

EOF
}

# Test certificate validity
test_certificate() {
    local device="$1"
    local ip="$2"
    
    info "Testing SSL certificate for $device ($ip)"
    
    # Test certificate file existence
    if [[ "$device" == "$(hostname)" ]] || [[ "$ip" == "$(hostname -I | awk '{print $1}')" ]]; then
        # Local device
        if [[ -f "/etc/ssl/monsterbox/${device}.crt" ]] && [[ -f "/etc/ssl/monsterbox/${device}.key" ]]; then
            success "Certificate files exist for $device"
            
            # Test certificate validity
            if openssl x509 -in "/etc/ssl/monsterbox/${device}.crt" -noout -checkend 86400 >/dev/null 2>&1; then
                success "Certificate is valid for $device"
                TEST_RESULTS["${device}_cert"]="PASS"
            else
                error "Certificate is expired or invalid for $device"
                TEST_RESULTS["${device}_cert"]="FAIL"
            fi
        else
            error "Certificate files missing for $device"
            TEST_RESULTS["${device}_cert"]="FAIL"
        fi
    else
        # Remote device - test via HTTPS connection
        if curl -k -s --connect-timeout $TIMEOUT "https://${ip}:8080/health" >/dev/null 2>&1; then
            success "HTTPS certificate working for $device"
            TEST_RESULTS["${device}_cert"]="PASS"
        else
            error "HTTPS certificate test failed for $device"
            TEST_RESULTS["${device}_cert"]="FAIL"
        fi
    fi
}

# Test HTTPS service
test_https_service() {
    local device="$1"
    local ip="$2"
    
    info "Testing HTTPS service for $device ($ip)"
    
    # Test health endpoint
    if response=$(curl -k -s --connect-timeout $TIMEOUT "https://${ip}:8080/health" 2>/dev/null); then
        if echo "$response" | grep -q '"status":"healthy"'; then
            success "HTTPS health endpoint working for $device"
            TEST_RESULTS["${device}_https"]="PASS"
        else
            warning "HTTPS health endpoint returned unexpected response for $device"
            TEST_RESULTS["${device}_https"]="PARTIAL"
        fi
    else
        error "HTTPS health endpoint failed for $device"
        TEST_RESULTS["${device}_https"]="FAIL"
    fi
    
    # Test main page
    if curl -k -s --connect-timeout $TIMEOUT "https://${ip}:8080/" | grep -q "MonsterBox" 2>/dev/null; then
        success "HTTPS main page working for $device"
    else
        warning "HTTPS main page test failed for $device"
    fi
}

# Test WebSocket services
test_websocket_services() {
    local device="$1"
    local ip="$2"
    
    info "Testing WebSocket services for $device ($ip)"
    
    # Test regular WebSocket (if wscat is available)
    if command -v wscat >/dev/null 2>&1; then
        # Test jaw server WebSocket
        if timeout 5 wscat -c "ws://${ip}:8765" -x '{"type":"ping"}' >/dev/null 2>&1; then
            success "WebSocket jaw server working for $device"
        else
            warning "WebSocket jaw server test failed for $device"
        fi
        
        # Test secure WebSocket
        if timeout 5 wscat -c "wss://${ip}:8866" --no-check -x '{"type":"ping"}' >/dev/null 2>&1; then
            success "Secure WebSocket working for $device"
            TEST_RESULTS["${device}_wss"]="PASS"
        else
            warning "Secure WebSocket test failed for $device"
            TEST_RESULTS["${device}_wss"]="FAIL"
        fi
    else
        warning "wscat not available, skipping WebSocket tests"
        TEST_RESULTS["${device}_wss"]="SKIP"
    fi
}

# Test HTTP fallback
test_http_fallback() {
    local device="$1"
    local ip="$2"
    
    info "Testing HTTP fallback for $device ($ip)"
    
    if curl -s --connect-timeout $TIMEOUT "http://${ip}:80/health" | grep -q '"status":"healthy"' 2>/dev/null; then
        success "HTTP fallback working for $device"
        TEST_RESULTS["${device}_http"]="PASS"
    else
        warning "HTTP fallback test failed for $device"
        TEST_RESULTS["${device}_http"]="FAIL"
    fi
}

# Test device
test_device() {
    local device="$1"
    local ip="${DEVICES[$device]}"
    
    if [[ -z "$ip" ]]; then
        error "Unknown device: $device"
        return 1
    fi
    
    info "🔍 Testing device: $device ($ip)"
    echo
    
    # Ping test
    if ping -c 1 -W 3 "$ip" >/dev/null 2>&1; then
        success "Device $device is reachable"
    else
        error "Device $device is not reachable"
        TEST_RESULTS["${device}_ping"]="FAIL"
        return 1
    fi
    
    TEST_RESULTS["${device}_ping"]="PASS"
    
    # Run tests
    test_certificate "$device" "$ip"
    test_https_service "$device" "$ip"
    test_websocket_services "$device" "$ip"
    test_http_fallback "$device" "$ip"
    
    echo
}

# Test all devices
test_all_devices() {
    info "🚀 Testing all MonsterBox devices"
    echo
    
    for device in "${!DEVICES[@]}"; do
        test_device "$device"
    done
}

# Test local device
test_local_device() {
    local hostname=$(hostname)
    local current_ip=$(hostname -I | awk '{print $1}')
    
    info "🏠 Testing local device: $hostname ($current_ip)"
    
    # Find matching device
    local device=""
    for dev in "${!DEVICES[@]}"; do
        if [[ "$hostname" == "$dev" ]] || [[ "$current_ip" == "${DEVICES[$dev]}" ]]; then
            device="$dev"
            break
        fi
    done
    
    if [[ -n "$device" ]]; then
        test_device "$device"
    else
        error "Local device not found in device list"
        exit 1
    fi
}

# Generate test report
generate_report() {
    info "📊 Generating test report"
    echo
    
    local report_file="$SCRIPT_DIR/https-test-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "MonsterBox HTTPS Deployment Test Report"
        echo "======================================="
        echo "Generated: $(date)"
        echo "Log file: $LOG_FILE"
        echo
        
        echo "Test Results Summary:"
        echo "--------------------"
        
        for device in "${!DEVICES[@]}"; do
            echo
            echo "Device: $device (${DEVICES[$device]})"
            echo "  Ping:        ${TEST_RESULTS[${device}_ping]:-NOT_TESTED}"
            echo "  Certificate: ${TEST_RESULTS[${device}_cert]:-NOT_TESTED}"
            echo "  HTTPS:       ${TEST_RESULTS[${device}_https]:-NOT_TESTED}"
            echo "  WebSocket:   ${TEST_RESULTS[${device}_wss]:-NOT_TESTED}"
            echo "  HTTP:        ${TEST_RESULTS[${device}_http]:-NOT_TESTED}"
        done
        
        echo
        echo "Legend:"
        echo "  PASS    - Test passed successfully"
        echo "  FAIL    - Test failed"
        echo "  PARTIAL - Test partially successful"
        echo "  SKIP    - Test skipped"
        echo "  NOT_TESTED - Test not run"
        
        echo
        echo "Detailed Log:"
        echo "-------------"
        cat "$LOG_FILE"
        
    } > "$report_file"
    
    success "Test report generated: $report_file"
    
    # Show summary
    echo
    info "Test Summary:"
    local total_tests=0
    local passed_tests=0
    
    for result in "${TEST_RESULTS[@]}"; do
        ((total_tests++))
        if [[ "$result" == "PASS" ]]; then
            ((passed_tests++))
        fi
    done
    
    echo "  Total tests: $total_tests"
    echo "  Passed: $passed_tests"
    echo "  Failed: $((total_tests - passed_tests))"
    
    if [[ $passed_tests -eq $total_tests ]]; then
        success "All tests passed! 🎉"
    else
        warning "Some tests failed. Check the report for details."
    fi
}

# Main script logic
case "${1:-}" in
    --help|-h)
        show_help
        ;;
    --test-all)
        test_all_devices
        generate_report
        ;;
    --test-device)
        if [[ -z "${2:-}" ]]; then
            error "Device name required for --test-device"
            echo "Usage: $0 --test-device DEVICE"
            exit 1
        fi
        test_device "$2"
        generate_report
        ;;
    --test-local)
        test_local_device
        generate_report
        ;;
    --test-certificates)
        info "Testing certificates for all devices"
        for device in "${!DEVICES[@]}"; do
            test_certificate "$device" "${DEVICES[$device]}"
        done
        ;;
    --test-services)
        info "Testing services for all devices"
        for device in "${!DEVICES[@]}"; do
            test_https_service "$device" "${DEVICES[$device]}"
            test_websocket_services "$device" "${DEVICES[$device]}"
        done
        ;;
    --report)
        generate_report
        ;;
    "")
        info "MonsterBox HTTPS Deployment Testing"
        echo "Use --help for usage information"
        echo "Use --test-all to test all devices"
        ;;
    *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
