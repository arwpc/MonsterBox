#!/usr/bin/env bash
set -euo pipefail

# Verify 5x Reboot Readiness for LOCAL Animatronic
# Reboots this animatronic 5 times and verifies full functionality

REBOOT_COUNT=5
REPORT_FILE="/tmp/halloween-reboot-test-$(date +%Y%m%d-%H%M%S).log"
STATE_FILE="/tmp/halloween-reboot-state"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$REPORT_FILE"
}

success() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $*"
    echo "$msg"
    echo "$msg" >> "$REPORT_FILE"
}

error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $*"
    echo "$msg" >&2
    echo "$msg" >> "$REPORT_FILE"
}

get_hostname() {
    hostname
}

get_ip() {
    hostname -I | awk '{print $1}'
}

verify_system() {
    local boot_num=$1
    
    log "========================================="
    log "Boot #$boot_num Verification"
    log "========================================="
    
    local all_ok=true
    
    # Check MonsterBox
    log "Checking MonsterBox..."
    if timeout 10 curl -sf http://localhost:3000/ >/dev/null 2>&1; then
        success "MonsterBox is responding"
    else
        error "MonsterBox is NOT responding"
        all_ok=false
    fi
    
    # Check mjpg-streamer
    log "Checking mjpg-streamer..."
    if systemctl is-active --quiet mjpg-streamer; then
        success "mjpg-streamer service is running"
    else
        error "mjpg-streamer service is NOT running"
        all_ok=false
    fi
    
    # Check conversation page
    log "Checking conversation page..."
    if timeout 10 curl -sf http://localhost:3000/conversation | grep -q "Conversation"; then
        success "Conversation page is accessible"
    else
        error "Conversation page is NOT accessible"
        all_ok=false
    fi
    
    # Check audio services
    log "Checking audio services..."
    if systemctl --user is-active --quiet pipewire; then
        success "PipeWire is running"
    else
        error "PipeWire is NOT running"
        all_ok=false
    fi
    
    if systemctl --user is-active --quiet wireplumber; then
        success "WirePlumber is running"
    else
        error "WirePlumber is NOT running"
        all_ok=false
    fi
    
    # Record result
    if [ "$all_ok" = true ]; then
        success "Boot #$boot_num PASSED"
        echo "PASS" >> "${STATE_FILE}.results"
        return 0
    else
        error "Boot #$boot_num FAILED"
        echo "FAIL" >> "${STATE_FILE}.results"
        return 1
    fi
}

initialize_test() {
    log "========================================="
    log "🎃 Halloween 5x Reboot Test 🎃"
    log "========================================="
    log "Hostname: $(get_hostname)"
    log "IP: $(get_ip)"
    log "Report: $REPORT_FILE"
    log "========================================="
    
    # Initialize state
    echo "1" > "$STATE_FILE"
    rm -f "${STATE_FILE}.results"
    
    log "Test initialized. Starting reboot cycle..."
    log "This will take approximately 15-30 minutes."
    log ""
}

check_and_continue() {
    # Check if we're in a reboot test
    if [ ! -f "$STATE_FILE" ]; then
        # First run - initialize
        initialize_test
        
        # Verify current state before first reboot
        log "Verifying system before reboot cycle..."
        if ! verify_system 0; then
            error "System is not ready. Fix issues before running reboot test."
            rm -f "$STATE_FILE"
            exit 1
        fi
        
        # Start reboot cycle
        log ""
        log "Starting reboot #1 of $REBOOT_COUNT..."
        echo "1" > "$STATE_FILE"
        sleep 2
        sudo reboot
        exit 0
    fi
    
    # We're in the middle of a test - get current boot number
    local current_boot=$(cat "$STATE_FILE")
    
    log "========================================="
    log "Resumed after reboot #$current_boot"
    log "========================================="
    
    # Wait for system to settle
    log "Waiting for system to settle (30s)..."
    sleep 30
    
    # Verify this boot
    verify_system "$current_boot"
    
    # Check if we need more reboots
    if [ "$current_boot" -lt "$REBOOT_COUNT" ]; then
        local next_boot=$((current_boot + 1))
        echo "$next_boot" > "$STATE_FILE"
        
        log ""
        log "Starting reboot #$next_boot of $REBOOT_COUNT..."
        sleep 2
        sudo reboot
        exit 0
    else
        # All reboots complete - generate report
        generate_final_report
        rm -f "$STATE_FILE"
        exit 0
    fi
}

generate_final_report() {
    log ""
    log "========================================="
    log "🎃 Final Report 🎃"
    log "========================================="
    log "Hostname: $(get_hostname)"
    log "IP: $(get_ip)"
    log "Total Reboots: $REBOOT_COUNT"
    log ""
    
    # Count results
    local passed=0
    local failed=0
    
    if [ -f "${STATE_FILE}.results" ]; then
        while IFS= read -r result; do
            if [ "$result" = "PASS" ]; then
                passed=$((passed + 1))
            else
                failed=$((failed + 1))
            fi
        done < "${STATE_FILE}.results"
    fi
    
    log "Results:"
    log "  ✅ Passed: $passed"
    log "  ❌ Failed: $failed"
    log ""
    
    if [ $failed -eq 0 ] && [ $passed -eq $REBOOT_COUNT ]; then
        success "🎃 ALL $REBOOT_COUNT REBOOTS SUCCESSFUL! 🎃"
        success "System is READY for Halloween!"
    else
        error "⚠️  Some reboots failed"
        error "System needs attention before Halloween"
    fi
    
    log "========================================="
    log "Full report saved to: $REPORT_FILE"
    log "========================================="
    
    # Cleanup
    rm -f "${STATE_FILE}.results"
}

# Main execution
check_and_continue

