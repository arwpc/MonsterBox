#!/usr/bin/env bash
set -euo pipefail

# Comprehensive Halloween Test - All Animatronics
# Tests: Network, Service, Webcam, TTS, Audio, WebSocket
# Then makes each animatronic speak to verify full functionality

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Animatronics configuration
declare -A ANIMATRONICS=(
    ["orlok"]="192.168.8.120:3"
    ["pumpkinhead"]="192.168.8.150:1"
    ["coffin"]="192.168.8.140:2"
    ["skulltalker"]="192.168.8.130:4"
    ["groundbreaker"]="192.168.8.200:5"
)

declare -A HALLOWEEN_MESSAGES=(
    ["orlok"]="I am Count Orlok, master of the night. Welcome to my castle this Halloween!"
    ["pumpkinhead"]="I am PumpkinHead, guardian of the harvest. The spirits are restless tonight!"
    ["coffin"]="I rise from my eternal slumber. The coffin opens and I emerge for Halloween!"
    ["skulltalker"]="My skull speaks from beyond the grave. Listen to my Halloween warnings!"
    ["groundbreaker"]="I break through the earth to join the Halloween celebration!"
)

log() { echo -e "[$(date '+%H:%M:%S')] $*"; }
success() { log "${GREEN}✅ $*${NC}"; }
error() { log "${RED}❌ $*${NC}"; }
warning() { log "${YELLOW}⚠️  $*${NC}"; }
info() { log "${BLUE}ℹ️  $*${NC}"; }
speak() { log "${MAGENTA}🗣️  $*${NC}"; }

test_and_speak() {
    local name=$1
    local ip=$2
    local char_id=$3
    local message="${HALLOWEEN_MESSAGES[$name]}"
    
    log ""
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Testing $name (Character $char_id) at $ip"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local tests_passed=0
    local tests_failed=0
    
    # Test 1: Network
    if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        success "Network connectivity"
        ((tests_passed++))
    else
        error "Network connectivity FAILED"
        ((tests_failed++))
        return 1
    fi
    
    # Test 2: MonsterBox Service
    if timeout 10 curl -sf "http://${ip}:3000/" > /dev/null 2>&1; then
        success "MonsterBox service responding"
        ((tests_passed++))
    else
        error "MonsterBox service NOT responding"
        ((tests_failed++))
        return 1
    fi
    
    # Test 3: ElevenLabs API configured
    if timeout 10 curl -sf "http://${ip}:3000/api/elevenlabs/status" > /dev/null 2>&1; then
        success "ElevenLabs API configured"
        ((tests_passed++))
    else
        warning "ElevenLabs API not configured"
    fi
    
    # Test 4: Audio system
    if timeout 10 curl -sf "http://${ip}:3000/setup/audio/api/system-config" > /dev/null 2>&1; then
        success "Audio system configured"
        ((tests_passed++))
    else
        warning "Audio system check failed"
    fi
    
    # Test 5: Webcam streaming capability
    local webcam_result=$(timeout 10 curl -sf "http://${ip}:3000/api/streaming/status/${char_id}" 2>&1 || echo "failed")
    if [ "$webcam_result" != "failed" ]; then
        success "Webcam streaming available"
        ((tests_passed++))
    else
        warning "Webcam not streaming (will start on demand)"
    fi
    
    # Test 6: WebSocket connectivity
    local ws_test=$(timeout 10 node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://${ip}:8795');
        ws.on('open', () => {
            ws.close();
            process.exit(0);
        });
        ws.on('error', () => process.exit(1));
    " 2>&1 || echo "failed")
    
    if [ $? -eq 0 ]; then
        success "WebSocket service available"
        ((tests_passed++))
    else
        warning "WebSocket service not responding"
    fi
    
    # Test 7: TTS - Make it speak!
    speak "Making $name speak: \"$message\""
    
    local tts_response=$(timeout 30 curl -sf -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${message}\",\"characterId\":${char_id}}" 2>&1)
    
    if echo "$tts_response" | grep -q "success"; then
        success "TTS WORKING - $name is speaking!"
        ((tests_passed++))
        
        # Give it time to speak
        sleep 8
    else
        error "TTS FAILED - $name cannot speak"
        ((tests_failed++))
    fi
    
    # Summary
    log ""
    if [ $tests_failed -eq 0 ]; then
        success "$name: ALL TESTS PASSED ($tests_passed tests) ✅"
        return 0
    else
        error "$name: SOME TESTS FAILED ($tests_passed passed, $tests_failed failed) ❌"
        return 1
    fi
}

main() {
    log "========================================="
    log "🎃 COMPREHENSIVE HALLOWEEN TEST 🎃"
    log "========================================="
    log "Testing all 5 animatronics:"
    log "  - Network connectivity"
    log "  - MonsterBox service"
    log "  - ElevenLabs AI"
    log "  - Audio system"
    log "  - Webcam streaming"
    log "  - WebSocket services"
    log "  - TTS (Text-to-Speech)"
    log ""
    log "Each animatronic will speak to verify full functionality!"
    log "========================================="
    
    local all_passed=true
    local ready_count=0
    local total_count=0
    
    # Test each animatronic in sequence
    for name in orlok pumpkinhead coffin skulltalker groundbreaker; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"
        ((total_count++))
        
        if test_and_speak "$name" "$ip" "$char_id"; then
            ((ready_count++))
        else
            all_passed=false
        fi
        
        # Brief pause between animatronics
        sleep 2
    done
    
    # Final summary
    log ""
    log "========================================="
    log "🎃 FINAL HALLOWEEN READINESS REPORT 🎃"
    log "========================================="
    log ""
    log "Animatronics Ready: $ready_count / $total_count"
    log ""
    
    if [ "$all_passed" = true ]; then
        success "ALL ANIMATRONICS ARE READY FOR HALLOWEEN! 🎃👻🦇"
        log ""
        log "All systems operational:"
        log "  ✅ Orlok - The Vampire"
        log "  ✅ PumpkinHead - Guardian of the Harvest"
        log "  ✅ Coffin Breaker - The Risen Dead"
        log "  ✅ Skulltalker - Voice from Beyond"
        log "  ✅ Groundbreaker - Earth's Fury"
        log ""
        log "Ready for trick-or-treaters! 🎃"
        exit 0
    else
        error "SOME ANIMATRONICS NEED ATTENTION"
        log ""
        log "Please review the test results above."
        log "Fix any failed tests before Halloween!"
        exit 1
    fi
}

main "$@"

