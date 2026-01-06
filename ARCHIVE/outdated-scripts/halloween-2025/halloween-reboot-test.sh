#!/usr/bin/env bash
set -euo pipefail

# Halloween Reboot Test
# Reboots each animatronic and verifies all services come back up

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'
BOOT_WAIT=180  # 3 minutes max wait for boot

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Animatronics - test remote ones first, Coffin (local) last
ANIMATRONICS=(
    "orlok:192.168.8.120:3"
    "pumpkinhead:192.168.8.150:1"
    "skulltalker:192.168.8.130:4"
    "groundbreaker:192.168.8.200:5"
    "coffin:192.168.8.140:2"
)

REPORT_FILE="/tmp/halloween-reboot-$(date +%Y%m%d-%H%M%S).log"

log() {
    local msg="[$(date '+%H:%M:%S')] $*"
    echo -e "$msg"
    echo -e "$msg" >> "$REPORT_FILE"
}

success() { log "${GREEN}✅ $*${NC}"; }
error() { log "${RED}❌ $*${NC}"; }
warning() { log "${YELLOW}⚠️  $*${NC}"; }
info() { log "${BLUE}ℹ️  $*${NC}"; }

# Verify systemd service is enabled
verify_systemd() {
    local name=$1
    local ip=$2
    
    local result=$(sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'systemctl is-enabled monsterbox 2>&1' || echo "failed")
    
    if [ "$result" = "enabled" ]; then
        return 0
    else
        return 1
    fi
}

# Enable systemd service
enable_systemd() {
    local name=$1
    local ip=$2
    
    info "Enabling MonsterBox service on $name..."
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo systemctl enable monsterbox && sudo systemctl restart monsterbox' > /dev/null 2>&1
    return $?
}

# Test if animatronic is responsive
test_responsive() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    # Check network
    if ! ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        return 1
    fi
    
    # Check MonsterBox service
    if ! timeout 10 curl -sf "http://${ip}:3000/" > /dev/null 2>&1; then
        return 1
    fi
    
    # Check TTS
    local tts_result=$(timeout 15 curl -sf -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${name} reboot test\",\"characterId\":${char_id}}" 2>&1 || echo "failed")
    
    if echo "$tts_result" | grep -q "success"; then
        return 0
    else
        return 1
    fi
}

# Reboot and wait for animatronic to come back
reboot_and_verify() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Rebooting $name ($ip)"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Verify systemd is enabled before rebooting
    if ! verify_systemd "$name" "$ip"; then
        warning "MonsterBox service not enabled, enabling now..."
        if ! enable_systemd "$name" "$ip"; then
            error "Failed to enable service on $name"
            return 1
        fi
        success "Service enabled on $name"
        sleep 5
    else
        success "MonsterBox service already enabled"
    fi
    
    # Initiate reboot
    info "Initiating reboot..."
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo reboot' || true
    
    # Wait for it to go down
    info "Waiting for system to go down..."
    sleep 15
    
    # Wait for it to come back up
    info "Waiting for system to boot (max ${BOOT_WAIT}s)..."
    local waited=0
    local boot_time=0
    
    while [ $waited -lt $BOOT_WAIT ]; do
        if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
            boot_time=$waited
            info "Network is back after ${boot_time}s, waiting for services..."
            sleep 10  # Give services time to start
            
            if timeout 10 curl -sf "http://${ip}:3000/" > /dev/null 2>&1; then
                success "$name is back online! (boot time: ${boot_time}s)"
                
                # Wait a bit more for all services to initialize
                info "Waiting for all services to initialize..."
                sleep 20
                
                # Test full functionality
                info "Testing functionality..."
                if test_responsive "$name" "$ip" "$char_id"; then
                    success "$name: ALL TESTS PASSED after reboot ✅"
                    return 0
                else
                    error "$name: Services not fully functional after reboot"
                    return 1
                fi
            fi
        fi
        sleep 5
        waited=$((waited + 5))
    done
    
    error "$name did not come back online within ${BOOT_WAIT}s"
    return 1
}

main() {
    log "========================================="
    log "🎃 HALLOWEEN REBOOT TEST 🎃"
    log "========================================="
    log "Testing reboot persistence for all animatronics"
    log "Report will be saved to: $REPORT_FILE"
    log ""
    
    local all_passed=true
    local passed_count=0
    local failed_count=0
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip char_id <<< "$entry"
        
        if reboot_and_verify "$name" "$ip" "$char_id"; then
            ((passed_count++))
        else
            ((failed_count++))
            all_passed=false
        fi
        
        # Brief pause between reboots
        if [ "$name" != "coffin" ]; then
            sleep 5
        fi
    done
    
    # Final report
    log ""
    log "========================================="
    log "🎃 REBOOT TEST RESULTS 🎃"
    log "========================================="
    log ""
    log "Passed: $passed_count / ${#ANIMATRONICS[@]}"
    log "Failed: $failed_count / ${#ANIMATRONICS[@]}"
    log ""
    
    if [ "$all_passed" = true ]; then
        success "ALL ANIMATRONICS PASSED REBOOT TEST! 🎃"
        log ""
        log "All animatronics:"
        log "  ✅ Auto-start MonsterBox service on boot"
        log "  ✅ Restore full functionality after reboot"
        log "  ✅ TTS working after reboot"
        log "  ✅ Ready for Halloween!"
        log ""
        log "Full report: $REPORT_FILE"
        exit 0
    else
        error "SOME ANIMATRONICS FAILED REBOOT TEST"
        log ""
        log "Please review the report: $REPORT_FILE"
        exit 1
    fi
}

main "$@"

