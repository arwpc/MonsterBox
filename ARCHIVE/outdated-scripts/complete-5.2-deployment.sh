#!/bin/bash

# MonsterBox 5.2 - Complete Deployment Script
# Deploys to all animatronics and configures random poses

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🎃 MonsterBox 5.2 - Complete Deployment"
echo "======================================="
echo ""

# Animatronic configuration
declare -A ANIMATRONICS
ANIMATRONICS[1]="PumpkinHead:192.168.8.150"
ANIMATRONICS[2]="Coffin Breaker:192.168.8.140"
ANIMATRONICS[3]="Orlok:192.168.8.120"
ANIMATRONICS[4]="Skulltalker:192.168.8.130"
ANIMATRONICS[5]="Groundbreaker:192.168.8.200"

# Check network connectivity
echo "🔍 Checking network connectivity..."
echo ""

REACHABLE=()
UNREACHABLE=()

for id in "${!ANIMATRONICS[@]}"; do
    IFS=':' read -r name ip <<< "${ANIMATRONICS[$id]}"
    
    echo -n "  $name ($ip): "
    
    if timeout 2 bash -c "cat < /dev/null > /dev/tcp/$ip/22" 2>/dev/null; then
        echo "✅ SSH reachable"
        REACHABLE+=("$id:$name:$ip")
    else
        echo "❌ SSH unreachable"
        UNREACHABLE+=("$id:$name:$ip")
    fi
done

echo ""

if [ ${#REACHABLE[@]} -eq 0 ]; then
    echo "❌ ERROR: No animatronics are reachable"
    echo ""
    echo "Please ensure:"
    echo "  1. All Raspberry Pis are powered on"
    echo "  2. Network connectivity is working"
    echo "  3. SSH is enabled on all devices"
    echo ""
    exit 1
fi

echo "📊 Summary:"
echo "  Reachable: ${#REACHABLE[@]}"
echo "  Unreachable: ${#UNREACHABLE[@]}"
echo ""

# Deploy to reachable animatronics
echo "🚀 Deploying MonsterBox 5.2..."
echo ""

DEPLOYED=()
FAILED=()

for entry in "${REACHABLE[@]}"; do
    IFS=':' read -r id name ip <<< "$entry"
    
    echo "---"
    echo "📦 Deploying to $name (Character $id, $ip)"
    echo ""
    
    if bash "$SCRIPT_DIR/deploy-to-animatronic.sh" "$id" "$ip"; then
        echo "✅ $name deployed successfully"
        DEPLOYED+=("$id:$name:$ip")
    else
        echo "❌ $name deployment failed"
        FAILED+=("$id:$name:$ip")
    fi
    
    echo ""
done

# Enable random poses on deployed animatronics
echo "🎭 Enabling random poses..."
echo ""

for entry in "${DEPLOYED[@]}"; do
    IFS=':' read -r id name ip <<< "$entry"
    
    echo -n "  $name: "
    
    RESULT=$(curl -sS --connect-timeout 5 -X POST "http://$ip:3000/api/random-poses/enable" \
        -H "Content-Type: application/json; charset=utf-8" \
        --data-binary "{\"characterId\":$id}" 2>/dev/null)
    
    SUCCESS=$(echo "$RESULT" | jq -r '.success' 2>/dev/null)
    
    if [ "$SUCCESS" = "true" ]; then
        echo "✅ Enabled"
    else
        echo "⚠️  Failed (service may not be running yet)"
    fi
done

echo ""

# Final summary
echo "======================================"
echo "🎃 Deployment Complete"
echo "======================================"
echo ""
echo "✅ Deployed: ${#DEPLOYED[@]}"
echo "❌ Failed: ${#FAILED[@]}"
echo "⏸️  Unreachable: ${#UNREACHABLE[@]}"
echo ""

if [ ${#DEPLOYED[@]} -gt 0 ]; then
    echo "Deployed animatronics:"
    for entry in "${DEPLOYED[@]}"; do
        IFS=':' read -r id name ip <<< "$entry"
        echo "  - $name (http://$ip:3000)"
    done
    echo ""
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    echo "⚠️  Failed deployments:"
    for entry in "${FAILED[@]}"; do
        IFS=':' read -r id name ip <<< "$entry"
        echo "  - $name ($ip)"
    done
    echo ""
fi

if [ ${#UNREACHABLE[@]} -gt 0 ]; then
    echo "⏸️  Unreachable animatronics:"
    for entry in "${UNREACHABLE[@]}"; do
        IFS=':' read -r id name ip <<< "$entry"
        echo "  - $name ($ip)"
    done
    echo ""
fi

echo "🔍 Next steps:"
echo "  1. Verify services are running: curl http://IP:3000/"
echo "  2. Check random poses config: curl http://IP:3000/api/random-poses/config"
echo "  3. Test conversation mode via WebSocket (port 8795)"
echo "  4. Start Goblin1 video loop: ./scripts/goblin-video-loop.sh"
echo ""

exit 0

