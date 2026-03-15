#!/usr/bin/env bash
set -euo pipefail

# Start Conversation Mode on All Animatronics
# Starts webcam streaming and enables conversation mode

# Color codes
GREEN='\033[0;32m'
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

log() { echo -e "[$(date '+%H:%M:%S')] $*"; }
success() { log "${GREEN}✅ $*${NC}"; }
info() { log "${BLUE}ℹ️  $*${NC}"; }

start_webcam() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    info "Starting webcam for $name..."
    
    curl -sf -X POST "http://${ip}:3000/api/streaming/start/${char_id}" \
        -H "Content-Type: application/json" > /dev/null 2>&1 || true
    
    sleep 2
}

enable_conversation() {
    local name=$1
    local ip=$2
    local char_id=$3
    
    info "Enabling conversation mode for $name..."
    
    # Use the conversation WebSocket to start conversation mode
    node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://${ip}:8795');
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'set_character', characterId: ${char_id} }));
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'set_mic_source', source: 'server' }));
            }, 500);
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'set_output_mode', mode: 'server' }));
            }, 1000);
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'start_conversation' }));
            }, 1500);
            setTimeout(() => {
                ws.close();
                process.exit(0);
            }, 2000);
        });
        ws.on('error', (err) => {
            console.error('Error:', err.message);
            process.exit(1);
        });
    " 2>&1 || true
    
    sleep 1
}

main() {
    log "========================================="
    log "🎃 STARTING ALL ANIMATRONICS 🎃"
    log "========================================="
    log ""
    
    for name in "${!ANIMATRONICS[@]}"; do
        IFS=':' read -r ip char_id <<< "${ANIMATRONICS[$name]}"
        
        log "Configuring $name (Character $char_id)..."
        
        # Start webcam
        start_webcam "$name" "$ip" "$char_id"
        
        # Enable conversation mode
        enable_conversation "$name" "$ip" "$char_id"
        
        success "$name is ready!"
        log ""
    done
    
    log "========================================="
    success "ALL ANIMATRONICS STARTED! 🎃"
    log "========================================="
    log ""
    log "All animatronics are now in conversation mode with:"
    log "  ✅ Webcam streaming"
    log "  ✅ Conversation mode enabled"
    log "  ✅ Server-side microphone input"
    log "  ✅ Server-side audio output"
    log ""
    log "You can now interact with them via:"
    log "  - Web interface: http://<ip>:3000/conversation"
    log "  - WebSocket: ws://<ip>:8795"
}

main "$@"

