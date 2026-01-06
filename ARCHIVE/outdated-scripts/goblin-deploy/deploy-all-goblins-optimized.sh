#!/bin/bash
#
# Deploy Optimized Goblin System to All 3 Goblins
# Deploys rock-solid video playback to all Goblin Pi3s
#

set -e

echo "🎃 MonsterBox Goblin Mass Deployment"
echo "====================================="
echo ""

# Goblin configuration
declare -A GOBLINS
GOBLINS[goblin-one]="192.168.8.40"
GOBLINS[goblin-two]="192.168.8.106"
GOBLINS[goblin-three]="192.168.8.14"

# Check if deployment script exists
if [ ! -f "deploy-optimized-goblin.sh" ]; then
    echo "❌ deploy-optimized-goblin.sh not found"
    exit 1
fi

chmod +x deploy-optimized-goblin.sh

# Deploy to each Goblin
DEPLOYED=0
FAILED=0

for GOBLIN_NAME in "${!GOBLINS[@]}"; do
    GOBLIN_IP="${GOBLINS[$GOBLIN_NAME]}"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Deploying to: $GOBLIN_NAME ($GOBLIN_IP)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if ./deploy-optimized-goblin.sh "$GOBLIN_IP" "$GOBLIN_NAME"; then
        echo "✅ $GOBLIN_NAME deployed successfully"
        ((DEPLOYED++))
    else
        echo "❌ $GOBLIN_NAME deployment failed"
        ((FAILED++))
    fi
    
    echo ""
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DEPLOYMENT SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Deployed: $DEPLOYED"
echo "❌ Failed: $FAILED"
echo "📊 Total: ${#GOBLINS[@]}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 ALL GOBLINS DEPLOYED SUCCESSFULLY!"
    echo ""
    echo "⚠️  REBOOT ALL GOBLINS for optimizations to take effect"
    echo ""
    echo "Reboot commands:"
    for GOBLIN_NAME in "${!GOBLINS[@]}"; do
        GOBLIN_IP="${GOBLINS[$GOBLIN_NAME]}"
        echo "  sshpass -p 'klrklr89!' ssh remote@$GOBLIN_IP 'sudo reboot'  # $GOBLIN_NAME"
    done
    echo ""
    echo "Or reboot all at once:"
    echo "  for ip in 192.168.8.40 192.168.8.106 192.168.8.14; do sshpass -p 'klrklr89!' ssh remote@\$ip 'sudo reboot'; done"
    echo ""
else
    echo "⚠️  Some deployments failed. Check logs above."
fi

echo ""

