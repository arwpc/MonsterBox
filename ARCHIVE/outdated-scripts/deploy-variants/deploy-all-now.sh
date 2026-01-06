#!/usr/bin/env bash
set -euo pipefail

# Deploy to all animatronics NOW
# This script deploys to each animatronic sequentially

ANIMATRONICS=(
    "orlok:192.168.8.120"
    "pumpkinhead:192.168.8.150"
    "skulltalker:192.168.8.130"
    "groundbreaker:192.168.8.200"
)

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=30"
SSH_PASS="klrklr89!"  # Password for remote user
DEPLOY_LOG="/tmp/halloween-deployment-$(date +%Y%m%d-%H%M%S).log"

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
    
    # Pull latest code
    log "Pulling latest code..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "cd ~/MonsterBox && git pull" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "Code pulled successfully"
    else
        error "Failed to pull code"
        return 1
    fi

    # Run installation
    log "Running installation script..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "cd ~/MonsterBox && ./scripts/install-halloween-readiness-local.sh" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "Installation complete"
    else
        error "Installation failed"
        return 1
    fi

    # Wait for services to stabilize
    log "Waiting for services to stabilize (30s)..."
    sleep 30

    # Run verification
    log "Running verification..."
    if sshpass -p "$SSH_PASS" ssh $SSH_OPTS remote@$ip "cd ~/MonsterBox && ./scripts/verify-halloween-readiness.sh" 2>&1 | tee -a "$DEPLOY_LOG"; then
        success "$name deployment SUCCESSFUL"
        return 0
    else
        error "$name verification FAILED"
        return 1
    fi
}

main() {
    log "========================================="
    log "🎃 Halloween Deployment to All Animatronics 🎃"
    log "========================================="
    log "Deployment log: $DEPLOY_LOG"
    echo ""
    
    local success_count=0
    local fail_count=0
    
    for entry in "${ANIMATRONICS[@]}"; do
        IFS=':' read -r name ip <<< "$entry"
        echo ""
        
        if deploy_to_animatronic "$name" "$ip"; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi
        
        echo ""
        log "Progress: $success_count successful, $fail_count failed"
        echo ""
    done
    
    log "========================================="
    log "Deployment Summary"
    log "========================================="
    log "Successful: $success_count"
    log "Failed: $fail_count"
    log "========================================="
    
    if [ $fail_count -eq 0 ]; then
        success "🎃 ALL DEPLOYMENTS SUCCESSFUL! 🎃"
        log ""
        log "Next step: Run 5x reboot tests on each animatronic"
        log "Full log saved to: $DEPLOY_LOG"
        return 0
    else
        error "Some deployments failed. Check log: $DEPLOY_LOG"
        return 1
    fi
}

main "$@"

