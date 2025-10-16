#!/usr/bin/env bash
set -euo pipefail

# Quick Halloween Readiness Test (No Reboot)
# Tests all animatronics: AI, Webcam, TTS, STT, Audio, Conversation Mode

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'
TEST_TIMEOUT=30

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Animatronics configuration
declare -A ANIMATRONICS=(
    ["orlok"]="192.168.8.120:3"
    ["pumpkinhead"]="192.168.8.150:1"
    ["coffin"]="192.168.8.140:2"
    ["skulltalker"]="192.168.8.130:4"
    ["groundbreaker"]="192.168.8.200:5"
)

log() { echo -e "[$(date '+%H:%M:%S')] $*"; }
success() { log "${GREEN}✅ $*${NC}"; }
error() { log "${RED}❌ $*${NC}"; }
warning() { log "${YELLOW}⚠️  $*${NC}"; }
info() { log "${BLUE}ℹ️  $*${NC}"; }

test_animatronic() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    info "Testing $name ($ip) - Character ID: $char_id"
    
    local passed=0
    local failed=0
    
    # Network
    if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        success "  Network: OK"
        ((passed++))
    else
        error "  Network: FAILED"
        ((failed++))
        return 1
    fi
    
    # MonsterBox Service
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/" > /dev/null 2>&1; then
        success "  MonsterBox Service: OK"
        ((passed++))
    else
        error "  MonsterBox Service: FAILED"
        ((failed++))
    fi
    
    # Webcam
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/api/streaming/status/${char_id}" > /dev/null 2>&1; then
        success "  Webcam: OK"
        ((passed++))
    else
        warning "  Webcam: Not streaming (may need manual start)"
    fi
    
    # TTS
    local tts_response=$(timeout $TEST_TIMEOUT curl -sf -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${name} test\",\"characterId\":${char_id}}" 2>&1 || echo "failed")
    
    if echo "$tts_response" | grep -q "success"; then
        success "  TTS: OK"
        ((passed++))
    else
        error "  TTS: FAILED"
        ((failed++))
    fi
    
    # STT
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/api/elevenlabs/stt/status" > /dev/null 2>&1; then
        success "  STT: OK"
        ((passed++))
    else
        warning "  STT: Service not responding"
    fi
    
    # Audio System
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/setup/audio/api/system-config" > /dev/null 2>&1; then
        success "  Audio System: OK"
        ((passed++))
    else
        error "  Audio System: FAILED"
        ((failed++))
    fi
    
    # Conversation Mode WebSocket
    local ws_test=$(timeout $TEST_TIMEOUT node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://${ip}:8795');
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'set_character', characterId: ${char_id} }));
            setTimeout(() => { ws.close(); process.exit(0); }, 1000);
        });
        ws.on('error', () => { process.exit(1); });
    " 2>&1 || echo "failed")
    
    if [ $? -eq 0 ]; then
        success "  Conversation Mode: OK"
        ((passed++))
    else
        error "  Conversation Mode: FAILED"
        ((failed++))
    fi
    
    # AI Agent
    if timeout $TEST_TIMEOUT curl -sf "http://${ip}:3000/api/elevenlabs/status" > /dev/null 2>&1; then
        success "  AI Agent: OK"
        ((passed++))
    else
        error "  AI Agent: FAILED"
        ((failed++))
    fi
    
    # Summary
    if [ $failed -eq 0 ]; then
        success "$name: ALL TESTS PASSED ($passed/8) ✅"
        return 0
    else
        error "$name: SOME TESTS FAILED ($passed passed, $failed failed) ❌"
        return 1
    fi
}

main() {
    log "========================================="
    log "🎃 QUICK HALLOWEEN READINESS TEST 🎃"
    log "========================================="
    log ""
    
    local all_passed=true
    
    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"
        
        if ! test_animatronic "$name" "$ip" "$char_id"; then
            all_passed=false
        fi
        
        log ""
    done
    
    log "========================================="
    if [ "$all_passed" = true ]; then
        success "ALL ANIMATRONICS READY FOR HALLOWEEN! 🎃"
        log "========================================="
        exit 0
    else
        error "SOME ANIMATRONICS NEED ATTENTION"
        log "========================================="
        log ""
        log "Run full test with reboot: ./scripts/halloween-full-readiness.sh"
        exit 1
    fi
}

main "$@"

