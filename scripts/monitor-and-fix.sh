#!/usr/bin/env bash
# Continuous monitoring script for 5x reboot test

LOG_FILE="/tmp/5x-reboot-safe-output.log"
MONITOR_LOG="/tmp/monitor-and-fix.log"

log() {
    echo "[$(date '+%H:%M:%S')] $*" | tee -a "$MONITOR_LOG"
}

log "Starting continuous monitoring of 5x reboot test"
log "Watching: $LOG_FILE"

while true; do
    if [ -f "$LOG_FILE" ]; then
        # Check if process is still running
        if pgrep -f "verify-5x-reboot-safe.sh" >/dev/null; then
            log "Test is running - monitoring for errors..."
            
            # Show last 30 lines
            echo "=== Last 30 lines ===" | tee -a "$MONITOR_LOG"
            tail -30 "$LOG_FILE" | tee -a "$MONITOR_LOG"
            
        else
            log "Test process has completed or stopped"
            log "Final status:"
            tail -50 "$LOG_FILE" | tee -a "$MONITOR_LOG"
            break
        fi
    else
        log "Waiting for log file to be created..."
    fi
    
    sleep 60
done

log "Monitoring complete"

