#!/usr/bin/env bash
set -euo pipefail

# Install Halloween Readiness System Locally
# Run this script ON each animatronic to install the complete boot system

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

error() {
    echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
}

main() {
    log "🎃 Installing Halloween Readiness System 🎃"
    echo ""
    
    # Ensure we're in the MonsterBox directory
    cd /home/remote/MonsterBox || {
        error "MonsterBox directory not found"
        exit 1
    }
    
    # Make boot script executable
    log "Setting up boot completion script..."
    chmod +x scripts/monsterbox-boot-complete.sh
    log "✓ Boot script ready"
    
    # Install systemd service
    log "Installing systemd service..."
    sudo cp scripts/monsterbox-complete.service /etc/systemd/system/monsterbox.service
    sudo systemctl daemon-reload
    log "✓ Service file installed"
    
    # Enable service
    log "Enabling MonsterBox service..."
    sudo systemctl enable monsterbox
    log "✓ Service enabled"
    
    # Ensure mjpg-streamer is enabled
    log "Ensuring mjpg-streamer is enabled..."
    sudo systemctl enable mjpg-streamer || log "⚠ mjpg-streamer service not found (may need installation)"
    
    # Ensure audio services are enabled
    log "Enabling audio services..."
    systemctl --user enable pipewire pipewire-pulse wireplumber || true
    log "✓ Audio services enabled"
    
    # Create log directory
    log "Setting up logging..."
    sudo touch /var/log/monsterbox.log /var/log/monsterbox.err /var/log/monsterbox-boot.log
    sudo chown remote:remote /var/log/monsterbox*.log /var/log/monsterbox*.err
    log "✓ Log files created"
    
    # Restart MonsterBox service
    log "Restarting MonsterBox service..."
    sudo systemctl restart monsterbox
    log "✓ Service restarted"
    
    # Wait for service to be ready
    log "Waiting for MonsterBox to be ready..."
    local elapsed=0
    local max_wait=60
    
    while [ $elapsed -lt $max_wait ]; do
        if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            log "✓ MonsterBox is responding"
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    
    if [ $elapsed -ge $max_wait ]; then
        error "MonsterBox did not start within ${max_wait}s"
        log "Check logs: sudo journalctl -u monsterbox -n 50"
        exit 1
    fi
    
    # Show service status
    echo ""
    log "========================================="
    log "Service Status"
    log "========================================="
    sudo systemctl status monsterbox --no-pager -l | head -20
    
    echo ""
    log "========================================="
    log "✅ Installation Complete!"
    log "========================================="
    log ""
    log "Next steps:"
    log "1. Verify system: npx playwright test tests/playwright/halloween-readiness.spec.js"
    log "2. Check logs: tail -f /var/log/monsterbox-boot.log"
    log "3. Reboot to test: sudo reboot"
    log ""
    log "🎃 Ready for Halloween! 🎃"
}

main "$@"

