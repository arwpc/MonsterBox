#!/bin/bash
# Deploy CLI blanking fix to all Goblins
# Fixes issue where CLI is briefly visible during video transitions
#
# What this fixes:
# 1. CLI visibility during MPV spawn
# 2. Console not being blanked before each video playback
# 3. Terminal output leaking to tty1 during process transitions
#
# Usage: ./scripts/deploy-goblin-cli-fix.sh [goblin-ip]

set -e

GOBLIN_PASS="klrklr89!"
SOURCE_FILE="goblin/src/mpvController.js"

# Goblin IPs
GOBLIN_ONE="192.168.8.40"
GOBLIN_TWO="192.168.8.160"
GOBLIN_THREE="192.168.8.14"

deploy_to_goblin() {
    local goblin_ip="$1"
    local goblin_name="$2"
    
    echo "=================================================="
    echo "Deploying CLI fix to $goblin_name ($goblin_ip)"
    echo "=================================================="
    
    # Check if goblin is online
    if ! ping -c 1 -W 2 "$goblin_ip" >/dev/null 2>&1; then
        echo "❌ $goblin_name is offline or unreachable"
        return 1
    fi
    
    echo "✅ $goblin_name is reachable"
    
    # Deploy updated mpvController.js
    echo "📦 Deploying updated mpvController.js..."
    if sshpass -p "$GOBLIN_PASS" scp -o StrictHostKeyChecking=no \
        "$SOURCE_FILE" "remote@$goblin_ip:/home/remote/goblin/src/mpvController.js"; then
        echo "✅ File deployed successfully"
    else
        echo "❌ Failed to deploy file"
        return 1
    fi
    
    # Restart goblin service
    echo "🔄 Restarting goblin service..."
    if sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no \
        "remote@$goblin_ip" 'sudo systemctl restart goblin.service'; then
        echo "✅ Service restarted"
    else
        echo "❌ Failed to restart service"
        return 1
    fi
    
    # Wait for service to stabilize
    sleep 3
    
    # Check service status
    echo "🔍 Checking service status..."
    if sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no \
        "remote@$goblin_ip" 'systemctl is-active goblin.service' >/dev/null 2>&1; then
        echo "✅ $goblin_name service is active"
    else
        echo "⚠️  $goblin_name service may not be running properly"
        return 1
    fi
    
    # Check health endpoint
    if curl -s --connect-timeout 5 "http://$goblin_ip:3001/health" >/dev/null 2>&1; then
        echo "✅ $goblin_name health check passed"
    else
        echo "⚠️  $goblin_name health check failed"
        return 1
    fi
    
    echo "🎉 $goblin_name deployment complete!"
    echo ""
    return 0
}

# Main execution
echo ""
echo "🎃 Goblin CLI Fix Deployment Script"
echo "===================================="
echo ""
echo "This script deploys the console blanking fix to prevent CLI visibility"
echo "during video transitions."
echo ""

if [ "$1" ]; then
    # Deploy to specific goblin
    case "$1" in
        "192.168.8.40"|"goblin-one"|"1")
            deploy_to_goblin "$GOBLIN_ONE" "Goblin One"
            ;;
        "192.168.8.160"|"goblin-two"|"2")
            deploy_to_goblin "$GOBLIN_TWO" "Goblin Two"
            ;;
        "192.168.8.14"|"goblin-three"|"3")
            deploy_to_goblin "$GOBLIN_THREE" "Goblin Three"
            ;;
        *)
            echo "Unknown goblin: $1"
            echo "Usage: $0 [goblin-one|goblin-two|goblin-three|1|2|3]"
            exit 1
            ;;
    esac
else
    # Deploy to all goblins
    success_count=0
    fail_count=0
    
    if deploy_to_goblin "$GOBLIN_ONE" "Goblin One"; then
        ((success_count++))
    else
        ((fail_count++))
    fi
    
    if deploy_to_goblin "$GOBLIN_TWO" "Goblin Two"; then
        ((success_count++))
    else
        ((fail_count++))
    fi
    
    if deploy_to_goblin "$GOBLIN_THREE" "Goblin Three"; then
        ((success_count++))
    else
        ((fail_count++))
    fi
    
    echo ""
    echo "=================================================="
    echo "Deployment Summary"
    echo "=================================================="
    echo "✅ Successful: $success_count"
    echo "❌ Failed: $fail_count"
    echo ""
    
    if [ $fail_count -eq 0 ]; then
        echo "🎉 All goblins updated successfully!"
        exit 0
    else
        echo "⚠️  Some goblins failed to update. Check logs above."
        exit 1
    fi
fi
