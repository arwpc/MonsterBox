#!/usr/bin/env bash
set -euo pipefail

# Deploy Halloween Readiness System to All Animatronics
# This script deploys the complete boot system and verification tests

PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no -o ConnectTimeout=10'

# Animatronics to deploy to
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

error() {
    echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
}

deploy_to_animatronic() {
    local name=$1
    local ip=$2
    
    log "========================================="
    log "Deploying to $name ($ip)"
    log "========================================="
    
    # Test connectivity
    if ! sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'echo OK' >/dev/null 2>&1; then
        error "Cannot reach $name at $ip"
        return 1
    fi
    
    log "✓ Connected to $name"
    
    # Copy boot completion script
    log "Copying boot completion script..."
    sshpass -p "$PASS" scp $SSH_OPTS scripts/monsterbox-boot-complete.sh remote@$ip:/home/remote/MonsterBox/scripts/ || {
        error "Failed to copy boot script to $name"
        return 1
    }
    
    # Make it executable
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'chmod +x /home/remote/MonsterBox/scripts/monsterbox-boot-complete.sh' || {
        error "Failed to make boot script executable on $name"
        return 1
    }
    
    log "✓ Boot completion script deployed"
    
    # Copy systemd service file
    log "Installing systemd service..."
    sshpass -p "$PASS" scp $SSH_OPTS scripts/monsterbox-complete.service remote@$ip:/tmp/monsterbox.service || {
        error "Failed to copy service file to $name"
        return 1
    }
    
    # Install service
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo mv /tmp/monsterbox.service /etc/systemd/system/monsterbox.service && sudo systemctl daemon-reload' || {
        error "Failed to install service on $name"
        return 1
    }
    
    log "✓ Systemd service installed"
    
    # Enable and restart service
    log "Enabling and restarting MonsterBox service..."
    sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'sudo systemctl enable monsterbox && sudo systemctl restart monsterbox' || {
        error "Failed to restart service on $name"
        return 1
    }
    
    log "✓ Service restarted"
    
    # Wait for service to be ready
    log "Waiting for MonsterBox to be ready..."
    local elapsed=0
    local max_wait=60
    
    while [ $elapsed -lt $max_wait ]; do
        if sshpass -p "$PASS" ssh $SSH_OPTS remote@$ip 'curl -sf http://localhost:3000/health >/dev/null 2>&1'; then
            log "✓ MonsterBox is responding"
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    
    if [ $elapsed -ge $max_wait ]; then
        error "MonsterBox did not start within ${max_wait}s on $name"
        return 1
    fi
    
    # Copy Playwright test
    log "Copying verification tests..."
    sshpass -p "$PASS" scp $SSH_OPTS tests/playwright/halloween-readiness.spec.js remote@$ip:/home/remote/MonsterBox/tests/playwright/ || {
        error "Failed to copy tests to $name"
        return 1
    }
    
    log "✓ Verification tests deployed"
    
    log "========================================="
    log "✅ $name deployment COMPLETE"
    log "========================================="
    echo ""
    
    return 0
}

# Main execution
main() {
    log "🎃 Halloween Readiness Deployment Starting 🎃"
    echo ""
    
    local success_count=0
    local fail_count=0
    local failed_hosts=()
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        
        if deploy_to_animatronic "$name" "$ip"; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
            failed_hosts+=("$name")
        fi
    done
    
    echo ""
    log "========================================="
    log "Deployment Summary"
    log "========================================="
    log "Successful: $success_count"
    log "Failed: $fail_count"
    
    if [ $fail_count -gt 0 ]; then
        log "Failed hosts: ${failed_hosts[*]}"
        exit 1
    fi
    
    log "========================================="
    log "✅ All animatronics deployed successfully!"
    log "========================================="
    
    return 0
}

main "$@"

