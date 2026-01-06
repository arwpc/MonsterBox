#!/usr/bin/env bash
set -euo pipefail

# Halloween Full Readiness Test & Deployment Script
# Tests all animatronics: AI, Webcam, TTS, STT, Audio, Conversation Mode
# Reboots each and verifies persistence

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'
BOOT_WAIT=120  # 2 minutes wait for boot
TEST_TIMEOUT=30

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Animatronics configuration
declare -A ANIMATRONICS=(
    ["orlok"]="192.168.8.120:3"
    ["pumpkinhead"]="192.168.8.150:1"
    ["coffin"]="192.168.8.140:2"
    ["skulltalker"]="192.168.8.130:4"
    ["groundbreaker"]="192.168.8.200:5"
)

# Test results tracking
declare -A PRE_REBOOT_RESULTS
declare -A POST_REBOOT_RESULTS
REPORT_FILE="/tmp/halloween-readiness-$(date +%Y%m%d-%H%M%S).log"

log() {
    local msg="[$(date '+%H:%M:%S')] $*"
    echo -e "$msg"
    echo -e "$msg" >> "$REPORT_FILE"
}

success() {
    log "${GREEN}✅ $*${NC}"
}

error() {
    log "${RED}❌ $*${NC}"
}

warning() {
    log "${YELLOW}⚠️  $*${NC}"
}

info() {
    log "${BLUE}ℹ️  $*${NC}"
}

# Test network connectivity
test_network() {
    local name=$1
    local ip=$2
    
    if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test MonsterBox service
test_monsterbox_service() {
    local name=$1
    local ip=$2
    
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test webcam streaming
test_webcam() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    # Check if webcam stream is accessible
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/api/streaming/status/${char_id}" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test TTS (Text-to-Speech)
test_tts() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    local response=$(timeout $TEST_TIMEOUT curl -sf -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${name} is ready for Halloween\",\"characterId\":${char_id}}" 2>&1)
    
    if echo "$response" | grep -q "success"; then
        return 0
    else
        return 1
    fi
}

# Test STT (Speech-to-Text) service
test_stt() {
    local name=$1
    local ip=$2
    
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/api/elevenlabs/stt/status" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test audio system
test_audio() {
    local name=$1
    local ip=$2
    
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/setup/audio/api/system-config" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Test conversation mode WebSocket
test_conversation_mode() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    # Use Node.js to test WebSocket connection
    local test_result=$(timeout $TEST_TIMEOUT node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://${ip}:8795');
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'set_character', characterId: ${char_id} }));
            setTimeout(() => { ws.close(); process.exit(0); }, 1000);
        });
        ws.on('error', () => { process.exit(1); });
    " 2>&1)
    
    if [ $? -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Test AI agent
test_ai_agent() {
    local name=$1
    local ip=$2
    
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/api/elevenlabs/status" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Verify systemd service is enabled
verify_systemd_enabled() {
    local name=$1
    local ip=$2
    
    local result=$(sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'systemctl is-enabled monsterbox 2>&1' || echo "failed")
    
    if [ "$result" = "enabled" ]; then
        return 0
    else
        return 1
    fi
}

# Enable systemd service if not enabled
enable_systemd_service() {
    local name=$1
    local ip=$2
    
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo systemctl enable monsterbox && sudo systemctl restart monsterbox' > /dev/null 2>&1
    return $?
}

# Run all tests for an animatronic
run_all_tests() {
    local name=$1
    local ip=$2
    local char_id=$3
    local phase=$4
    
    local all_passed=true
    local results=""
    
    info "Testing $name ($ip) - Character ID: $char_id"
    
    # Network test
    if test_network "$name" "$ip"; then
        success "  Network: OK"
        results="${results}network:PASS "
    else
        error "  Network: FAILED"
        results="${results}network:FAIL "
        all_passed=false
        return 1
    fi
    
    # MonsterBox service test
    if test_monsterbox_service "$name" "$ip"; then
        success "  MonsterBox Service: OK"
        results="${results}service:PASS "
    else
        error "  MonsterBox Service: FAILED"
        results="${results}service:FAIL "
        all_passed=false
    fi
    
    # Webcam test
    if test_webcam "$name" "$ip" "$char_id"; then
        success "  Webcam: OK"
        results="${results}webcam:PASS "
    else
        warning "  Webcam: FAILED (may need manual start)"
        results="${results}webcam:WARN "
    fi
    
    # TTS test
    if test_tts "$name" "$ip" "$char_id"; then
        success "  TTS: OK"
        results="${results}tts:PASS "
    else
        error "  TTS: FAILED"
        results="${results}tts:FAIL "
        all_passed=false
    fi
    
    # STT test
    if test_stt "$name" "$ip"; then
        success "  STT: OK"
        results="${results}stt:PASS "
    else
        warning "  STT: FAILED"
        results="${results}stt:WARN "
    fi
    
    # Audio system test
    if test_audio "$name" "$ip"; then
        success "  Audio System: OK"
        results="${results}audio:PASS "
    else
        error "  Audio System: FAILED"
        results="${results}audio:FAIL "
        all_passed=false
    fi
    
    # Conversation mode test
    if test_conversation_mode "$name" "$ip" "$char_id"; then
        success "  Conversation Mode: OK"
        results="${results}conversation:PASS "
    else
        error "  Conversation Mode: FAILED"
        results="${results}conversation:FAIL "
        all_passed=false
    fi
    
    # AI agent test
    if test_ai_agent "$name" "$ip"; then
        success "  AI Agent: OK"
        results="${results}ai:PASS "
    else
        error "  AI Agent: FAILED"
        results="${results}ai:FAIL "
        all_passed=false
    fi
    
    # Store results
    if [ "$phase" = "pre" ]; then
        PRE_REBOOT_RESULTS["$name"]="$results"
    else
        POST_REBOOT_RESULTS["$name"]="$results"
    fi
    
    if [ "$all_passed" = true ]; then
        return 0
    else
        return 1
    fi
}

# Reboot animatronic and wait for it to come back
reboot_and_wait() {
    local name=$1
    local ip=$2
    
    info "Rebooting $name..."
    
    # Initiate reboot
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo reboot' || true
    
    # Wait for it to go down
    sleep 10
    
    # Wait for it to come back up
    local waited=0
    while [ $waited -lt $BOOT_WAIT ]; do
        if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
            sleep 5  # Give services time to start
            if timeout 10 curl -sf "http://${ip}:3000/" > /dev/null 2>&1; then
                success "$name is back online after $waited seconds"
                return 0
            fi
        fi
        sleep 5
        waited=$((waited + 5))
    done
    
    error "$name did not come back online within $BOOT_WAIT seconds"
    return 1
}

# Generate final report
generate_report() {
    log ""
    log "========================================="
    log "🎃 HALLOWEEN READINESS REPORT 🎃"
    log "========================================="
    log ""

    local all_ready=true

    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"

        log "--- $name (Character $char_id) ---"
        log "  IP: $ip"

        if [ -n "${PRE_REBOOT_RESULTS[$name]:-}" ]; then
            log "  Pre-Reboot: ${PRE_REBOOT_RESULTS[$name]}"
        else
            log "  Pre-Reboot: NOT TESTED"
            all_ready=false
        fi

        if [ -n "${POST_REBOOT_RESULTS[$name]:-}" ]; then
            log "  Post-Reboot: ${POST_REBOOT_RESULTS[$name]}"
        else
            log "  Post-Reboot: NOT TESTED"
            all_ready=false
        fi

        # Check if all critical tests passed
        if echo "${POST_REBOOT_RESULTS[$name]:-}" | grep -q "FAIL"; then
            error "  Status: NOT READY ❌"
            all_ready=false
        elif echo "${POST_REBOOT_RESULTS[$name]:-}" | grep -q "service:PASS.*tts:PASS.*ai:PASS.*conversation:PASS"; then
            success "  Status: READY FOR HALLOWEEN ✅"
        else
            warning "  Status: PARTIALLY READY ⚠️"
            all_ready=false
        fi

        log ""
    done

    log "========================================="
    if [ "$all_ready" = true ]; then
        success "ALL ANIMATRONICS ARE READY FOR HALLOWEEN! 🎃"
    else
        error "SOME ANIMATRONICS NEED ATTENTION"
    fi
    log "========================================="
    log ""
    log "Full report saved to: $REPORT_FILE"
}

# Main execution
main() {
    log "========================================="
    log "🎃 HALLOWEEN FULL READINESS TEST 🎃"
    log "========================================="
    log "Testing: AI, Webcam, TTS, STT, Audio, Conversation Mode"
    log "Will reboot each animatronic and verify persistence"
    log ""

    # Phase 1: Pre-Reboot Testing
    log "========================================="
    log "PHASE 1: PRE-REBOOT TESTING"
    log "========================================="
    log ""

    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"

        log "Testing $name..."

        # Verify systemd service is enabled
        if ! verify_systemd_enabled "$name" "$ip"; then
            warning "MonsterBox service not enabled on $name, enabling..."
            if enable_systemd_service "$name" "$ip"; then
                success "Service enabled on $name"
            else
                error "Failed to enable service on $name"
            fi
        fi

        # Run all tests
        run_all_tests "$name" "$ip" "$char_id" "pre"

        log ""
    done

    # Phase 2: Reboot Testing
    log "========================================="
    log "PHASE 2: REBOOT TESTING"
    log "========================================="
    log ""

    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"

        if ! reboot_and_wait "$name" "$ip"; then
            error "Reboot test failed for $name"
            POST_REBOOT_RESULTS["$name"]="REBOOT_FAILED"
            continue
        fi

        log ""
    done

    # Phase 3: Post-Reboot Testing
    log "========================================="
    log "PHASE 3: POST-REBOOT TESTING"
    log "========================================="
    log ""

    # Wait a bit more for all services to fully initialize
    info "Waiting 30 seconds for all services to fully initialize..."
    sleep 30

    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"

        log "Re-testing $name after reboot..."
        run_all_tests "$name" "$ip" "$char_id" "post"

        log ""
    done

    # Generate final report
    generate_report
}

# Run main function
main "$@"

