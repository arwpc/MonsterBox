#!/usr/bin/env bash
set -euo pipefail

# Deploy Halloween Readiness to All Animatronics
# This script pushes code to git and provides instructions for deployment

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

success() {
    echo "[$(date '+%H:%M:%S')] ✅ $*"
}

error() {
    echo "[$(date '+%H:%M:%S')] ❌ $*" >&2
}

main() {
    log "========================================="
    log "🎃 Halloween Readiness Deployment 🎃"
    log "========================================="
    echo ""
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "scripts" ]; then
        error "Must run from MonsterBox root directory"
        exit 1
    fi
    
    # Check if there are uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        error "You have uncommitted changes. Please commit first."
        git status --short
        exit 1
    fi
    
    log "Pushing changes to git..."
    if git push origin main; then
        success "Code pushed to git successfully"
    else
        error "Failed to push to git"
        exit 1
    fi
    
    echo ""
    log "========================================="
    log "📋 Deployment Instructions"
    log "========================================="
    echo ""
    
    cat <<'EOF'
The code has been pushed to git. Now deploy to each animatronic:

┌─────────────────────────────────────────────────────────────┐
│ ORLOK (192.168.8.120)                                       │
└─────────────────────────────────────────────────────────────┘

ssh remote@192.168.8.120
cd ~/MonsterBox
git pull
./scripts/install-halloween-readiness-local.sh
./scripts/verify-halloween-readiness.sh

┌─────────────────────────────────────────────────────────────┐
│ PUMPKINHEAD (192.168.8.150)                                 │
└─────────────────────────────────────────────────────────────┘

ssh remote@192.168.8.150
cd ~/MonsterBox
git pull
./scripts/install-halloween-readiness-local.sh
./scripts/verify-halloween-readiness.sh

┌─────────────────────────────────────────────────────────────┐
│ SKULLTALKER (192.168.8.130)                                 │
└─────────────────────────────────────────────────────────────┘

ssh remote@192.168.8.130
cd ~/MonsterBox
git pull
./scripts/install-halloween-readiness-local.sh
./scripts/verify-halloween-readiness.sh

┌─────────────────────────────────────────────────────────────┐
│ GROUNDBREAKER (192.168.8.200)                               │
└─────────────────────────────────────────────────────────────┘

ssh remote@192.168.8.200
cd ~/MonsterBox
git pull
./scripts/install-halloween-readiness-local.sh
./scripts/verify-halloween-readiness.sh

┌─────────────────────────────────────────────────────────────┐
│ After all deployments, test 5x reboot on each:             │
└─────────────────────────────────────────────────────────────┘

On each animatronic:
./scripts/verify-5x-reboot.sh

This will reboot the animatronic 5 times and verify full functionality
after each boot. Results will be saved to:
/tmp/halloween-reboot-test-TIMESTAMP.log

EOF
    
    echo ""
    log "========================================="
    log "Current Status:"
    log "  ✅ Coffin (192.168.8.140) - COMPLETE"
    log "  ⏳ Orlok (192.168.8.120) - PENDING"
    log "  ⏳ PumpkinHead (192.168.8.150) - PENDING"
    log "  ⏳ Skulltalker (192.168.8.130) - PENDING"
    log "  ⏳ Groundbreaker (192.168.8.200) - PENDING"
    log "========================================="
    echo ""
    
    success "Deployment preparation complete!"
    log "Follow the instructions above to deploy to each animatronic."
    echo ""
}

main "$@"

