#!/usr/bin/env bash
set -euo pipefail

# Verify 5x Reboot Readiness for All Animatronics
# Reboots each animatronic 5 times and verifies full functionality with Playwright

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'
REBOOT_COUNT=5
BOOT_WAIT=180  # 3 minutes max wait for boot

# Animatronics to test
ANIMATRONICS=(
    "orlok:192.168.8.120"
    "pumpkinhead:192.168.8.150"
    "coffin:192.168.8.140"
    "skulltalker:192.168.8.130"
    "groundbreaker:192.168.8.200"
)

# Results tracking
declare -A RESULTS

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

error() {
    echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
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
        if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'curl -sf http://localhost:3000/health >/dev/null 2>&1'; then
            log "✓ MonsterBox is responding"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    error "MonsterBox not ready after ${max_wait}s"
    return 1
}

run_playwright_verification() {
    local name=$1
    local ip=$2
    
    log "Running Playwright verification on $name..."
    
    # Run the Halloween readiness test remotely
    if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'cd /home/remote/MonsterBox && npx playwright test tests/playwright/halloween-readiness.spec.js --reporter=list' 2>&1 | tee /tmp/${name}-playwright.log; then
        log "✅ Playwright verification PASSED"
        return 0
    else
        error "❌ Playwright verification FAILED"
        cat /tmp/${name}-playwright.log
        return 1
    fi
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
    
    # Run Playwright verification
    if ! run_playwright_verification "$name" "$ip"; then
        error "Boot #$boot_num FAILED - Playwright verification failed"
        return 1
    fi
    
    log "✅ Boot #$boot_num PASSED"
    return 0
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
        
        # Reboot the animatronic
        log "Initiating reboot..."
        sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo reboot' || true
        
        # Wait for it to go down
        log "Waiting for system to go down..."
        sleep 10
        
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
    local report_file="halloween-readiness-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "========================================="
        echo "🎃 Halloween Readiness Report 🎃"
        echo "========================================="
        echo "Generated: $(date)"
        echo "Reboot Count: $REBOOT_COUNT per animatronic"
        echo ""
        echo "Results:"
        echo "========================================="
        
        for entry in "${ANIMATRONICS[@]}"; do
            IFS=':' read -r name ip <<< "$entry"
            echo ""
            echo "$name ($ip):"
            
            for i in $(seq 1 $REBOOT_COUNT); do
                local result="${RESULTS[${name}_${i}]:-UNKNOWN}"
                local symbol="❌"
                [ "$result" = "PASS" ] && symbol="✅"
                echo "  Boot $i: $symbol $result"
            done
        done
        
        echo ""
        echo "========================================="
        echo "Summary"
        echo "========================================="
        
        local total_tests=$((${#ANIMATRONICS[@]} * REBOOT_COUNT))
        local passed=0
        
        for key in "${!RESULTS[@]}"; do
            [ "${RESULTS[$key]}" = "PASS" ] && passed=$((passed + 1))
        done
        
        echo "Total Tests: $total_tests"
        echo "Passed: $passed"
        echo "Failed: $((total_tests - passed))"
        echo ""
        
        if [ $passed -eq $total_tests ]; then
            echo "🎃 ALL ANIMATRONICS READY FOR HALLOWEEN! 🎃"
        else
            echo "⚠️  Some animatronics need attention"
        fi
        
        echo "========================================="
    } | tee "$report_file"
    
    log "Report saved to: $report_file"
}

main() {
    log "🎃 Starting 5x Reboot Verification 🎃"
    log "This will take approximately $((${#ANIMATRONICS[@]} * REBOOT_COUNT * 5)) minutes"
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

