#!/usr/bin/env bash
set -euo pipefail

# Fix mjpg-streamer on all animatronics with auto-detect

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'

ANIMATRONICS=(
    "orlok:192.168.8.120"
    "pumpkinhead:192.168.8.150"
    "coffin:192.168.8.140"
    "skulltalker:192.168.8.130"
    "groundbreaker:192.168.8.200"
)

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

fix_animatronic() {
    local name=$1
    local ip=$2
    
    log "========================================="
    log "Fixing $name ($ip)"
    log "========================================="
    
    # Copy the auto-detect script
    log "Copying auto-detect script..."
    sshpass -p "$PASS" scp $SSH_OPTS scripts/start-mjpg-auto.sh remote@$ip:~/MonsterBox/scripts/
    
    # Make it executable
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'chmod +x ~/MonsterBox/scripts/start-mjpg-auto.sh'
    
    # Copy the new service file
    log "Installing new service file..."
    sshpass -p "$PASS" scp $SSH_OPTS scripts/mjpg-streamer-auto.service remote@$ip:/tmp/
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo cp /tmp/mjpg-streamer-auto.service /etc/systemd/system/mjpg-streamer.service'
    
    # Reload and restart
    log "Reloading and restarting service..."
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo systemctl daemon-reload && sudo systemctl restart mjpg-streamer && sleep 3'
    
    # Check status
    if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'systemctl is-active mjpg-streamer' | grep -q "active"; then
        log "✅ $name mjpg-streamer is running"
        
        # Verify it's responding
        if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'curl -sf http://localhost:8090/ >/dev/null 2>&1'; then
            log "✅ $name mjpg-streamer is responding on port 8090"
        else
            log "⚠️  $name mjpg-streamer is running but not responding yet"
        fi
    else
        log "❌ $name mjpg-streamer failed to start"
        sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo journalctl -u mjpg-streamer -n 20'
    fi
    
    echo ""
}

main() {
    log "🎃 Fixing mjpg-streamer on all animatronics 🎃"
    echo ""
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        
        # Skip if it's the local machine
        if [ "$ip" = "192.168.8.140" ]; then
            log "Skipping coffin (local machine) - will fix manually"
            echo ""
            continue
        fi
        
        fix_animatronic "$name" "$ip"
    done
    
    log "========================================="
    log "✅ All remote animatronics updated"
    log "========================================="
    log ""
    log "To fix coffin (local), run:"
    log "  sudo cp scripts/mjpg-streamer-auto.service /etc/systemd/system/mjpg-streamer.service"
    log "  sudo systemctl daemon-reload"
    log "  sudo systemctl restart mjpg-streamer"
}

main "$@"

