#!/usr/bin/env bash
set -euo pipefail

# Test Conversation Mode on All Animatronics
# Sends a test message to each and verifies response

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Animatronics configuration
declare -A ANIMATRONICS=(
    ["orlok"]="192.168.8.120:3"
    ["pumpkinhead"]="192.168.8.150:1"
    ["mina"]="192.168.8.140:2"
    ["sirdragomir"]="192.168.8.130:4"
    ["groundbreaker"]="192.168.8.200:5"
)

declare -A MESSAGES=(
    ["orlok"]="Greetings, I am Count Orlok. Are you ready for Halloween?"
    ["pumpkinhead"]="I am the guardian of the harvest. Halloween approaches!"
    ["mina"]="I rise from my coffin to greet you this Halloween night."
    ["sirdragomir"]="My bones rattle with excitement for Halloween!"
    ["groundbreaker"]="I emerge from the ground to celebrate Halloween!"
)

log() { echo -e "[$(date '+%H:%M:%S')] $*"; }
success() { log "${GREEN}✅ $*${NC}"; }
error() { log "${RED}❌ $*${NC}"; }
info() { log "${BLUE}ℹ️  $*${NC}"; }

test_conversation() {
    local name=$1
    local ip=$2
    local char_id=$3
    local message="${MESSAGES[$name]}"
    
    info "Testing $name conversation..."
    
    # Send message via WebSocket
    local result=$(timeout 15 node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://${ip}:8795');
        let gotResponse = false;
        
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'set_character', characterId: ${char_id} }));
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'send_message', text: '${message}' }));
            }, 1000);
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'agent_response' && msg.text) {
                    console.log('SUCCESS: ' + msg.text.slice(0, 100));
                    gotResponse = true;
                    setTimeout(() => { ws.close(); process.exit(0); }, 500);
                }
            } catch (e) {}
        });
        
        ws.on('error', (err) => {
            console.error('ERROR: ' + err.message);
            process.exit(1);
        });
        
        setTimeout(() => {
            if (!gotResponse) {
                console.error('TIMEOUT: No response received');
                process.exit(1);
            }
        }, 12000);
    " 2>&1)
    
    if echo "$result" | grep -q "SUCCESS:"; then
        local response=$(echo "$result" | grep "SUCCESS:" | sed 's/SUCCESS: //')
        success "$name responded: $response"
        return 0
    else
        error "$name failed to respond: $result"
        return 1
    fi
}

main() {
    log "========================================="
    log "🎃 TESTING ALL CONVERSATIONS 🎃"
    log "========================================="
    log ""
    
    local all_passed=true
    
    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"
        
        if ! test_conversation "$name" "$ip" "$char_id"; then
            all_passed=false
        fi
        
        log ""
        sleep 2  # Brief pause between tests
    done
    
    log "========================================="
    if [ "$all_passed" = true ]; then
        success "ALL CONVERSATIONS WORKING! 🎃"
        log "========================================="
        exit 0
    else
        error "SOME CONVERSATIONS FAILED"
        log "========================================="
        exit 1
    fi
}

main "$@"

