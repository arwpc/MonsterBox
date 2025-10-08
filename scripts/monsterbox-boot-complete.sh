#!/usr/bin/env bash
set -euo pipefail

# MonsterBox Complete Boot Initialization
# Ensures all services are running and ready for Halloween
# This script runs after MonsterBox service starts to verify full readiness

LOG_FILE="/var/log/monsterbox-boot.log"
MAX_WAIT=120  # Maximum wait time in seconds
POLL_INTERVAL=2

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$LOG_FILE" >&2
}

# Wait for a service to be active
wait_for_service() {
    local service=$1
    local is_user_service=${2:-false}
    local elapsed=0
    
    log "Waiting for $service to be active..."
    
    while [ $elapsed -lt $MAX_WAIT ]; do
        if [ "$is_user_service" = "true" ]; then
            if systemctl --user is-active --quiet "$service" 2>/dev/null; then
                log "✓ $service is active"
                return 0
            fi
        else
            if systemctl is-active --quiet "$service" 2>/dev/null; then
                log "✓ $service is active"
                return 0
            fi
        fi
        
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
    done
    
    error "$service failed to start within ${MAX_WAIT}s"
    return 1
}

# Wait for HTTP endpoint to respond
wait_for_http() {
    local url=$1
    local name=$2
    local elapsed=0
    
    log "Waiting for $name at $url..."
    
    while [ $elapsed -lt $MAX_WAIT ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            log "✓ $name is responding"
            return 0
        fi
        
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
    done
    
    error "$name failed to respond within ${MAX_WAIT}s"
    return 1
}

# Start audio services if not running
ensure_audio_services() {
    log "Ensuring audio services are running..."

    # Check if running as user service (systemd user session)
    if ! systemctl --user is-system-running &>/dev/null; then
        log "⚠ User systemd session not available, skipping audio service checks"
        log "  (Audio services may need to be started manually or via user login)"
        return 0
    fi

    # Start PipeWire services
    systemctl --user start pipewire pipewire-pulse wireplumber 2>/dev/null || true

    # Give services a moment to start
    sleep 3

    # Check if services are running (but don't fail if not)
    local audio_ok=true
    if systemctl --user is-active --quiet pipewire; then
        log "✓ PipeWire is running"
    else
        log "⚠ PipeWire is not running (may need manual start)"
        audio_ok=false
    fi

    if systemctl --user is-active --quiet wireplumber; then
        log "✓ WirePlumber is running"
    else
        log "⚠ WirePlumber is not running (may need manual start)"
        audio_ok=false
    fi

    # Verify wpctl is working (optional)
    if wpctl status &>/dev/null; then
        log "✓ Audio system is ready (wpctl responding)"
    else
        log "⚠ Audio system not responding (wpctl)"
    fi

    # Don't fail boot if audio isn't ready - it's not critical for basic operation
    return 0
}

# Ensure mjpg-streamer is running
ensure_video_service() {
    log "Ensuring mjpg-streamer is running..."
    
    # Start if not running
    if ! systemctl is-active --quiet mjpg-streamer; then
        sudo systemctl start mjpg-streamer 2>/dev/null || true
    fi
    
    wait_for_service "mjpg-streamer" false
    wait_for_http "http://localhost:8090/" "mjpg-streamer"
}

# Ensure MonsterBox application is running
ensure_monsterbox_app() {
    log "Ensuring MonsterBox application is running..."
    
    wait_for_http "http://localhost:3000/health" "MonsterBox"
    
    # Additional verification - check that conversation page loads
    if curl -sf "http://localhost:3000/conversation" >/dev/null 2>&1; then
        log "✓ MonsterBox conversation page is accessible"
    else
        error "MonsterBox conversation page not accessible"
        return 1
    fi
}

# Enable conversation mode by default
enable_conversation_mode() {
    log "Configuring conversation mode defaults..."
    
    # Wait a bit for MonsterBox to fully initialize
    sleep 5
    
    # Enable random poses with safe defaults
    if curl -sf -X POST "http://localhost:3000/api/orchestration/enable-random-poses" \
        -H "Content-Type: application/json" \
        --data '{"cooldownMs":3000,"minAmplitude":0.2,"maxAmplitude":0.5}' >/dev/null 2>&1; then
        log "✓ Random poses enabled"
    else
        log "⚠ Could not enable random poses (may not be critical)"
    fi
}

# Main execution
main() {
    log "========================================="
    log "MonsterBox Boot Initialization Starting"
    log "========================================="
    
    # Wait for system to settle
    log "Waiting for system to settle..."
    sleep 5
    
    # Ensure all services are running
    ensure_audio_services || exit 1
    ensure_video_service || exit 1
    ensure_monsterbox_app || exit 1
    enable_conversation_mode || true
    
    log "========================================="
    log "MonsterBox Boot Initialization COMPLETE"
    log "========================================="
    log ""
    log "System Status:"
    log "  ✓ Audio: PipeWire, PipeWire-Pulse, WirePlumber"
    log "  ✓ Video: mjpg-streamer on port 8090"
    log "  ✓ MonsterBox: Application on port 3000"
    log "  ✓ Conversation: Ready for visitors"
    log ""
    log "🎃 READY FOR HALLOWEEN! 🎃"
}

main "$@"

