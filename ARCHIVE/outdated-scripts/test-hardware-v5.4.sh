#!/bin/bash
# MonsterBox 5.4 Hardware Testing Script
# Tests all parts on each animatronic
# Date: 2025-10-25

echo "🧪 MonsterBox 5.4 Hardware Testing Script"
echo "=========================================="
echo ""

# Animatronics
declare -A ANIMATRONICS
ANIMATRONICS[orlok]="192.168.8.120"
ANIMATRONICS[coffin]="192.168.8.140"
ANIMATRONICS[pumpkinhead]="192.168.8.150"
ANIMATRONICS[skulltalker]="192.168.8.130"
ANIMATRONICS[groundbreaker]="192.168.8.200"

test_animatronic_parts() {
    local name=$1
    local ip=$2
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Testing $name ($ip)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Get list of parts
    echo "📋 Fetching parts list..."
    local parts_json=$(curl -s "http://$ip:3000/setup/parts/api/parts")
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to connect to $name"
        return 1
    fi
    
    # Parse parts and test each one
    local part_count=$(echo "$parts_json" | grep -o '"id"' | wc -l)
    echo "✅ Found $part_count parts"
    echo ""
    
    # Extract part IDs and types
    local part_ids=$(echo "$parts_json" | grep -oP '"id":"?\K[0-9]+' | head -20)
    
    for part_id in $part_ids; do
        echo "  🧪 Testing part ID: $part_id"
        
        # Test the part
        local test_result=$(curl -s -X POST \
            "http://$ip:3000/setup/parts/api/parts/$part_id/test" \
            -H "Content-Type: application/json" \
            -d '{}')
        
        if echo "$test_result" | grep -q '"success":true'; then
            echo "    ✅ Part $part_id tested successfully"
        else
            echo "    ⚠️  Part $part_id test result: $(echo $test_result | grep -oP '"message":"?\K[^"]+' | head -1)"
        fi
        
        # Small delay between tests
        sleep 0.5
    done
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

echo "This script will test hardware parts on each animatronic."
echo "Parts will move during testing. Ensure area is clear!"
echo ""
read -p "Press ENTER to continue or Ctrl+C to cancel..."
echo ""

for name in "${!ANIMATRONICS[@]}"; do
    ip="${ANIMATRONICS[$name]}"
    test_animatronic_parts "$name" "$ip"
done

echo "✨ Testing complete!"
echo ""
echo "📋 Manual verification steps:"
echo "  1. Check that all parts moved as expected"
echo "  2. Verify no error messages appeared"
echo "  3. Test PCA9685 servos specifically via calibration UI"
echo "  4. Confirm scene queue works in loop mode"
echo ""
