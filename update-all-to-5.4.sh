#!/bin/bash
# Update All MonsterBox Animatronics to Version 5.4

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  MonsterBox 5.4 Update Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# List of animatronics (hostname or IP)
ANIMATRONICS=(
    "pumpkinhead:PumpkinHead:192.168.8.150"
    "coffin:Coffin Breaker:192.168.8.140"
    "skulltalker:Skulltalker:192.168.8.130"
)

ORLOK_LOCAL=true
GROUNDBREAKER_IP="192.168.8.200"

update_animatronic() {
    local host=$1
    local name=$2
    local ip=$3
    
    echo -e "${BLUE}>>> Updating $name ($host)${NC}"
    
    # Update package.json version
    ssh remote@$host "cd /home/remote/MonsterBox && sed -i 's/\"version\": \"5.3.0\"/\"version\": \"5.4.0\"/' package.json"
    
    # Update description
    ssh remote@$host "cd /home/remote/MonsterBox && sed -i 's/MonsterBox 5.3/MonsterBox 5.4/' package.json"
    
    # Restart service
    ssh remote@$host "sudo systemctl restart monsterbox.service"
    
    echo -e "${GREEN}✅ $name updated and restarted${NC}"
    sleep 2
    
    # Verify
    if ssh remote@$host "systemctl is-active monsterbox.service" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $name service is running${NC}"
    else
        echo -e "${RED}❌ $name service failed to start${NC}"
    fi
    echo ""
}

# Update remote animatronics
for entry in "${ANIMATRONICS[@]}"; do
    IFS=':' read -r host name ip <<< "$entry"
    update_animatronic "$host" "$name" "$ip"
done

# Update Orlok (local machine)
if [ "$ORLOK_LOCAL" = true ]; then
    echo -e "${BLUE}>>> Updating Orlok (local machine)${NC}"
    cd /home/remote/MonsterBox
    
    # Update package.json
    sed -i 's/"version": "5.3.0"/"version": "5.4.0"/' package.json
    sed -i 's/MonsterBox 5.3/MonsterBox 5.4/' package.json
    
    # Restart service
    sudo systemctl restart monsterbox.service
    
    echo -e "${GREEN}✅ Orlok updated and restarted${NC}"
    sleep 2
    
    if systemctl is-active monsterbox.service > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Orlok service is running${NC}"
    else
        echo -e "${RED}❌ Orlok service failed to start${NC}"
    fi
    echo ""
fi

# Check Groundbreaker
echo -e "${BLUE}>>> Checking Groundbreaker ($GROUNDBREAKER_IP)${NC}"
if timeout 3 curl -s http://$GROUNDBREAKER_IP:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Groundbreaker is accessible via web but SSH needs configuration${NC}"
    echo -e "${YELLOW}   Manual update required for Groundbreaker${NC}"
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
./check-all-animatronics.sh
