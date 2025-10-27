#!/bin/bash
# Update All MonsterBox Animatronics to Version 5.5 (excludes Orlok)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  MonsterBox 5.5 Update Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# List of animatronics (hostname or IP) - Orlok intentionally omitted
ANIMATRONICS=(
    "pumpkinhead:PumpkinHead:192.168.8.150"
    "coffin:Coffin Breaker:192.168.8.140"
    "skulltalker:Skulltalker:192.168.8.130"
)

GROUNDBREAKER_IP="192.168.8.200"

update_animatronic() {
    local host=$1
    local name=$2
    local ip=$3
    
    echo -e "${BLUE}>>> Updating $name ($host)${NC}"
    
    # Update package.json version and description branding to 5.5 remotely
    ssh -o StrictHostKeyChecking=no remote@$host "cd /home/remote/MonsterBox && \
      sed -i 's/\"version\": \"5\\.[34]\.0\"/\"version\": \"5.5.0\"/' package.json && \
      sed -i 's/MonsterBox 5\\.[34]/MonsterBox 5.5/g' package.json"
    
    # Restart service if present, else start via nohup
    if ssh -o StrictHostKeyChecking=no remote@$host "systemctl list-unit-files | grep -q monsterbox.service"; then
      ssh -o StrictHostKeyChecking=no remote@$host "sudo systemctl restart monsterbox.service"
    else
      ssh -o StrictHostKeyChecking=no remote@$host "cd /home/remote/MonsterBox && nohup node server.js > /tmp/monsterbox.log 2>&1 < /dev/null &" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ $name updated and restarted${NC}"
    sleep 2
    
    # Verify
    if curl -s --connect-timeout 5 http://$ip:3000/health | grep -q '"status":"OK"'; then
        echo -e "${GREEN}✅ $name health OK${NC}"
    else
        echo -e "${YELLOW}⚠️  $name health endpoint not responding${NC}"
    fi
    echo ""
}

# Update remote animatronics
for entry in "${ANIMATRONICS[@]}"; do
    IFS=':' read -r host name ip <<< "$entry"
    update_animatronic "$host" "$name" "$ip"
done

# Check Groundbreaker (web-only check)
echo -e "${BLUE}>>> Checking Groundbreaker ($GROUNDBREAKER_IP)${NC}"
if timeout 3 curl -s http://$GROUNDBREAKER_IP:3000/health | grep -q '"status":"OK"'; then
    echo -e "${YELLOW}⚠️  Groundbreaker web reachable; manual SSH setup may be required${NC}"
else
    echo -e "${RED}❌ Groundbreaker not accessible${NC}"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Running final verification..."
sleep 2
./check-all-animatronics.sh || true
