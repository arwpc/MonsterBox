#!/bin/bash
#
# Webcam Watchdog - Monitors mjpg-streamer and webcam health
# Automatically restarts mjpg-streamer if video feed corrupts or service crashes
# This ensures webcam microphone remains accessible for Conversation Mode
#

WEBCAM_DEVICE="/dev/video0"
MJPG_SERVICE="mjpg-streamer"
STREAM_URL="http://localhost:8090/?action=snapshot"
CHECK_INTERVAL=30  # Check every 30 seconds
MAX_FAILURES=3     # Restart after 3 consecutive failures
FAILURE_COUNT=0

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_device_exists() {
    if [ ! -c "$WEBCAM_DEVICE" ]; then
        log "ERROR: Webcam device $WEBCAM_DEVICE does not exist"
        return 1
    fi
    return 0
}

check_service_running() {
    if ! systemctl is-active --quiet "$MJPG_SERVICE"; then
        log "ERROR: $MJPG_SERVICE service is not running"
        return 1
    fi
    return 0
}

check_stream_health() {
    # Try to fetch a snapshot from mjpg-streamer
    # If it fails or times out, the stream is unhealthy
    if ! curl -s -f --max-time 5 "$STREAM_URL" > /dev/null 2>&1; then
        log "ERROR: Failed to fetch snapshot from $STREAM_URL"
        return 1
    fi
    return 0
}

check_audio_device() {
    # Check if webcam audio device is available in PipeWire
    if ! pactl list sources short | grep -q "USB_Camera"; then
        log "WARNING: Webcam audio device not found in PipeWire"
        return 1
    fi
    return 0
}

restart_mjpg_streamer() {
    log "Restarting $MJPG_SERVICE service..."
    systemctl restart "$MJPG_SERVICE"
    sleep 3
    
    if systemctl is-active --quiet "$MJPG_SERVICE"; then
        log "SUCCESS: $MJPG_SERVICE restarted successfully"
        FAILURE_COUNT=0
        return 0
    else
        log "ERROR: Failed to restart $MJPG_SERVICE"
        return 1
    fi
}

log "Webcam watchdog started - monitoring $WEBCAM_DEVICE and $MJPG_SERVICE"

while true; do
    HEALTHY=true
    
    # Check 1: Device exists
    if ! check_device_exists; then
        HEALTHY=false
    fi
    
    # Check 2: Service is running
    if ! check_service_running; then
        HEALTHY=false
    fi
    
    # Check 3: Stream is responding
    if ! check_stream_health; then
        HEALTHY=false
    fi
    
    # Check 4: Audio device is available (warning only)
    check_audio_device
    
    if [ "$HEALTHY" = false ]; then
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        log "Health check failed ($FAILURE_COUNT/$MAX_FAILURES)"
        
        if [ $FAILURE_COUNT -ge $MAX_FAILURES ]; then
            log "Max failures reached - triggering restart"
            restart_mjpg_streamer
        fi
    else
        if [ $FAILURE_COUNT -gt 0 ]; then
            log "Health check passed - resetting failure count"
        fi
        FAILURE_COUNT=0
    fi
    
    sleep $CHECK_INTERVAL
done

