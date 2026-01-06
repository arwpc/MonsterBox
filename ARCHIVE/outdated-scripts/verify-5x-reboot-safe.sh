#!/usr/bin/env bash
set -euo pipefail

# Verify 5x Reboot Readiness - Safe version
# Tests remote animatronics first, then Coffin last with delays

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'
REBOOT_COUNT=5
BOOT_WAIT=180  # 3 minutes max wait for boot
RECONNECT_DELAY=180  # 3 minutes delay after Coffin reboot

# Test remote animatronics first, Coffin last
ANIMATRONICS=(
    "orlok:192.168.8.120"
    "pumpkinhead:192.168.8.150"
    "skulltalker:192.168.8.130"
    "groundbreaker:192.168.8.200"
    "coffin:192.168.8.140"
)

# Results tracking
declare -A RESULTS
REPORT_FILE="/tmp/halloween-5x-reboot-$(date +%Y%m%d-%H%M%S).log"

log() {
    local msg="[$(date '+%H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$REPORT_FILE"
}

error() {
    local msg="[$(date '+%H:%M:%S')] ERROR: $*"
    echo "$msg" >&2
    echo "$msg" >> "$REPORT_FILE"
}

wait_for_ssh() {
    local ip=$1
    local max_wait=$2
    local elapsed=0
    
    log "Waiting for SSH to be available..."
    
    while [ $elapsed -lt $max_wait ]; do
        if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'echo OK' >/dev/null 2>&1; then
            log "✓ SSH is available"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    error "SSH not available after ${max_wait}s"
    return 1
}

wait_for_monsterbox() {
    local ip=$1
    local max_wait=$2
    local elapsed=0
    
    log "Waiting for MonsterBox to be ready..."
    
    while [ $elapsed -lt $max_wait ]; do
        if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'timeout 10 curl -sf http://localhost:3000/ >/dev/null 2>&1'; then
            log "✓ MonsterBox is responding"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    error "MonsterBox not ready after ${max_wait}s"
    return 1
}

verify_single_boot() {
    local name=$1
    local ip=$2
    local boot_num=$3
    
    log "========================================="
    log "$name - Boot #$boot_num Verification"
    log "========================================="
    
    # Wait for SSH
    if ! wait_for_ssh "$ip" "$BOOT_WAIT"; then
        error "Boot #$boot_num FAILED - SSH timeout"
        return 1
    fi
    
    # Wait for MonsterBox
    if ! wait_for_monsterbox "$ip" "$BOOT_WAIT"; then
        error "Boot #$boot_num FAILED - MonsterBox timeout"
        return 1
    fi
    
    # Run verification script
    log "Running verification script..."
    if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'cd ~/MonsterBox && ./scripts/verify-halloween-readiness.sh' 2>&1 | tee -a "$REPORT_FILE"; then
        log "✅ Boot #$boot_num PASSED"
        return 0
    else
        error "Boot #$boot_num FAILED - Verification failed"
        return 1
    fi
}

test_animatronic() {
    local name=$1
    local ip=$2
    
    log "========================================="
    log "Testing $name ($ip)"
    log "========================================="
    
    local success_count=0
    
    for i in $(seq 1 $REBOOT_COUNT); do
        log ""
        log "--- Reboot $i of $REBOOT_COUNT ---"
        
        # Special handling for Coffin (local machine)
        if [ "$name" = "coffin" ]; then
            log "⚠️  WARNING: Rebooting local machine (Coffin)"
            log "⚠️  This will disconnect the session"
            log "⚠️  Waiting ${RECONNECT_DELAY}s after reboot for reconnection"
            
            # Initiate reboot
            log "Initiating reboot..."
            sudo reboot &
            
            # Wait for system to go down
            log "Waiting for system to go down..."
            sleep 10
            
            # Wait for reconnection delay
            log "Waiting ${RECONNECT_DELAY}s for system to come back..."
            sleep $RECONNECT_DELAY
            
        else
            # Remote animatronic - normal reboot
            log "Initiating reboot..."
            sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo reboot' || true
            
            # Wait for it to go down
            log "Waiting for system to go down..."
            sleep 10
        fi
        
        # Verify this boot
        if verify_single_boot "$name" "$ip" "$i"; then
            success_count=$((success_count + 1))
            RESULTS["${name}_${i}"]="PASS"
        else
            RESULTS["${name}_${i}"]="FAIL"
        fi
        
        # Small delay between reboots
        if [ $i -lt $REBOOT_COUNT ]; then
            log "Waiting before next reboot..."
            sleep 10
        fi
    done
    
    log ""
    log "========================================="
    log "$name Summary: $success_count/$REBOOT_COUNT boots successful"
    log "========================================="
    
    if [ $success_count -eq $REBOOT_COUNT ]; then
        log "✅ $name PASSED all $REBOOT_COUNT reboots"
        return 0
    else
        error "❌ $name FAILED - only $success_count/$REBOOT_COUNT successful"
        return 1
    fi
}

generate_report() {
    log ""
    log "========================================="
    log "🎃 Halloween Readiness Report 🎃"
    log "========================================="
    log "Generated: $(date)"
    log "Reboot Count: $REBOOT_COUNT per animatronic"
    log ""
    log "Results:"
    log "========================================="
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        log ""
        log "$name ($ip):"
        
        for i in $(seq 1 $REBOOT_COUNT); do
            local result="${RESULTS[${name}_${i}]:-UNKNOWN}"
            local symbol="❌"
            [ "$result" = "PASS" ] && symbol="✅"
            log "  Boot $i: $symbol $result"
        done
    done
    
    log ""
    log "========================================="
    log "Summary"
    log "========================================="
    
    local total_tests=$((${#ANIMATRONICS[@]} * REBOOT_COUNT))
    local passed=0
    
    for key in "${!RESULTS[@]}"; do
        [ "${RESULTS[$key]}" = "PASS" ] && passed=$((passed + 1))
    done
    
    log "Total Tests: $total_tests"
    log "Passed: $passed"
    log "Failed: $((total_tests - passed))"
    log ""
    
    if [ $passed -eq $total_tests ]; then
        log "🎃 ALL ANIMATRONICS READY FOR HALLOWEEN! 🎃"
    else
        log "⚠️  Some animatronics need attention"
    fi
    
    log "========================================="
    log "Full report saved to: $REPORT_FILE"
}

main() {
    log "🎃 Starting 5x Reboot Verification (Safe Mode) 🎃"
    log "Testing remote animatronics first, Coffin last"
    log "Report file: $REPORT_FILE"
    echo ""
    
    local all_passed=true
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        
        if ! test_animatronic "$name" "$ip"; then
            all_passed=false
        fi
        
        echo ""
    done
    
    # Generate final report
    generate_report
    
    if [ "$all_passed" = true ]; then
        log "========================================="
        log "✅ ALL ANIMATRONICS PASSED!"
        log "========================================="
        exit 0
    else
        error "========================================="
        error "❌ SOME ANIMATRONICS FAILED"
        error "========================================="
        exit 1
    fi
}

main "$@"

