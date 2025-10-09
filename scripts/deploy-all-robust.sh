#!/usr/bin/env bash
set -euo pipefail

# Robust deployment to all animatronics
# Handles git conflicts and service startup issues

ANIMATRONICS=(
    "orlok:192.168.8.120"
    "pumpkinhead:192.168.8.150"
    "skulltalker:192.168.8.130"
    "groundbreaker:192.168.8.200"
)

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=30"
SSH_PASS="klrklr89!"
DEPLOY_LOG="/tmp/halloween-deployment-robust-$(date +%Y%m%d-%H%M%S).log"

log() {
    local msg="[$(date '+%H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$DEPLOY_LOG"
}

success() {
    local msg="[$(date '+%H:%M:%S')] ✅ $*"
    echo "$msg"
    echo "$msg" >> "$DEPLOY_LOG"
}

error() {
    local msg="[$(date '+%H:%M:%S')] ❌ $*"
    echo "$msg" >&2
    echo "$msg" >> "$DEPLOY_LOG"
}

deploy_to_animatronic() {
    local name=$1
    local ip=$2
    
    log "========================================="
    log "Deploying to $name ($ip)"
    log "========================================="
    
    # Test connectivity
    log "Testing connectivity..."
    if ! ping -c 1 -W 5 "$ip" >/dev/null 2>&1; then
        error "$name is not reachable"
        return 1
    fi
    success "Connectivity OK"
    
    # Stash any local changes and pull
    log "Stashing local changes and pulling code..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "cd ~/MonsterBox && git stash && git pull" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "Code updated successfully"
    else
        error "Failed to update code"
        return 1
    fi
    
    # Stop MonsterBox service if running
    log "Stopping MonsterBox service..."
    sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "sudo systemctl stop monsterbox 2>/dev/null || true" 2>&1 | tee -a "$DEPLOY_LOG"
    
    # Run installation
    log "Running installation script..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "cd ~/MonsterBox && ./scripts/install-halloween-readiness-local.sh" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "Installation script completed"
    else
        log "⚠ Installation script had issues, continuing..."
    fi
    
    # Give it more time to start
    log "Waiting for services to stabilize (60s)..."
    sleep 60
    
    # Check if MonsterBox is running
    log "Checking MonsterBox status..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "timeout 10 curl -sf http://localhost:3000/ >/dev/null 2>&1" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "MonsterBox is responding"
    else
        log "⚠ MonsterBox not responding yet, checking service..."
        sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "sudo systemctl status monsterbox --no-pager -l" 2>&1 | tee -a "$DEPLOY_LOG" || true
        
        # Try to start it manually
        log "Attempting to start MonsterBox..."
        sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "sudo systemctl start monsterbox" 2>&1 | tee -a "$DEPLOY_LOG" || true
        
        sleep 30
        
        if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "timeout 10 curl -sf http://localhost:3000/ >/dev/null 2>&1" 2>&1; then
            success "MonsterBox is now responding"
        else
            error "MonsterBox still not responding"
            return 1
        fi
    fi
    
    # Run verification
    log "Running verification..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "cd ~/MonsterBox && ./scripts/verify-halloween-readiness.sh" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "$name deployment SUCCESSFUL"
        return 0
    else
        error "$name verification FAILED (but may still be functional)"
        return 1
    fi
}

main() {
    log "========================================="
    log "🎃 Robust Halloween Deployment 🎃"
    log "========================================="
    log "Deployment log: $DEPLOY_LOG"
    echo ""
    
    local success_count=0
    local fail_count=0
    declare -A results
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        echo ""
        
        if deploy_to_animatronic "$name" "$ip"; then
            success_count=$((success_count + 1))
            results["$name"]="✅ SUCCESS"
        else
            fail_count=$((fail_count + 1))
            results["$name"]="❌ FAILED"
        fi
        
        echo ""
        log "Progress: $success_count successful, $fail_count failed"
        echo ""
    done
    
    log "========================================="
    log "Deployment Summary"
    log "========================================="
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        log "$name ($ip): ${results[$name]}"
    done
    log "========================================="
    log "Successful: $success_count"
    log "Failed: $fail_count"
    log "========================================="
    
    if [ $fail_count -eq 0 ]; then
        success "🎃 ALL DEPLOYMENTS SUCCESSFUL! 🎃"
        log ""
        log "Next step: Run verification on each animatronic"
        log "Full log saved to: $DEPLOY_LOG"
        return 0
    else
        log "Some deployments had issues. Check log: $DEPLOY_LOG"
        log "You may need to manually check the failed animatronics."
        return 1
    fi
}

main "$@"

