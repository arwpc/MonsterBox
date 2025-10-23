#!/bin/bash
# MonsterBox 5.4 - All Animatronics Status Check

echo "============================================"
echo "  MonsterBox 5.4 - Animatronic Status"
echo "============================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_animatronic() {
    local name=$1
    local host=$2
    local char_id=$3
    
    echo "[$char_id] $name ($host)"
    echo "----------------------------------------"
    
    # Check if it's the local machine
    if [ "$host" == "$(hostname)" ]; then
        if systemctl is-active monsterbox.service > /dev/null 2>&1; then
            echo -e "Status: ${GREEN}✅ RUNNING${NC}"
            echo "PID: $(pgrep -f 'node.*server.js' | head -1)"
        else
            echo -e "Status: ${RED}❌ STOPPED${NC}"
        fi
    else
        # Check remote machine
        if timeout 3 ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 remote@$host "systemctl is-active monsterbox.service" > /dev/null 2>&1; then
            echo -e "Status: ${GREEN}✅ RUNNING${NC}"
            PID=$(timeout 3 ssh remote@$host "pgrep -f 'node.*server.js' | head -1" 2>/dev/null)
            echo "PID: $PID"
        else
            # Try web interface
            if timeout 2 curl -s http://$host:3000 > /dev/null 2>&1; then
                echo -e "Status: ${YELLOW}⚠️  RUNNING (web accessible, SSH issues)${NC}"
            else
                echo -e "Status: ${RED}❌ NOT ACCESSIBLE${NC}"
            fi
        fi
    fi
    echo ""
}

# Check all 5 animatronics
check_animatronic "PumpkinHead" "pumpkinhead" "1"
check_animatronic "Coffin Breaker" "coffin" "2"
check_animatronic "Orlok" "orlok" "3"
check_animatronic "Skulltalker" "skulltalker" "4"
check_animatronic "Groundbreaker" "192.168.8.200" "6"

echo "============================================"
echo "Summary:"
RUNNING=$(ssh remote@pumpkinhead "systemctl is-active monsterbox.service" 2>/dev/null && echo -n "1" || echo -n "0")
RUNNING=$((RUNNING + $(ssh remote@coffin "systemctl is-active monsterbox.service" 2>/dev/null && echo -n "1" || echo -n "0")))
RUNNING=$((RUNNING + $(systemctl is-active monsterbox.service > /dev/null 2>&1 && echo "1" || echo "0")))
RUNNING=$((RUNNING + $(ssh remote@skulltalker "systemctl is-active monsterbox.service" 2>/dev/null && echo -n "1" || echo -n "0")))

echo "Verified Running: $RUNNING/5 animatronics"
echo "============================================"
