#!/bin/bash

# MonsterBox 5.3 - Deploy Goblin Queue Fix (Simple Version)
# Fixes queue start hanging issue and implements auto-start on boot

set -e

# Configuration
GOBLIN_IPS=("192.168.8.106" "192.168.8.14")
GOBLIN_NAMES=("Goblin Two" "Goblin Three")
GOBLIN_DIR="/home/remote/goblin"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Goblin Queue Fix Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}🎯 FIXES:${NC}"
echo "  ✅ Queue start no longer hangs"
echo "  ✅ Queue runs in background"
echo "  ✅ Auto-resume after reboot"
echo ""

for i in "${!GOBLIN_IPS[@]}"; do
    IP="${GOBLIN_IPS[$i]}"
    NAME="${GOBLIN_NAMES[$i]}"
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Deploying to $NAME ($IP)${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # Stop service
    echo -e "${BLUE}Stopping Goblin service...${NC}"
    ssh remote@$IP "sudo systemctl stop goblin 2>/dev/null || true; pkill -f 'node.*goblin' || true; sleep 2"
    echo -e "${GREEN}✅ Service stopped${NC}"
    
    # Copy files
    echo -e "${BLUE}Copying updated files...${NC}"
    scp goblin-system/src/videoQueue.js remote@$IP:$GOBLIN_DIR/src/
    scp goblin-system/src/server.js remote@$IP:$GOBLIN_DIR/src/
    echo -e "${GREEN}✅ Files copied${NC}"
    
    # Start service
    echo -e "${BLUE}Starting Goblin service...${NC}"
    ssh remote@$IP "sudo systemctl start goblin"
    sleep 5
    echo -e "${GREEN}✅ Service started${NC}"
    
    # Check status
    echo -e "${BLUE}Checking status...${NC}"
    if curl -s -f http://$IP:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $NAME is healthy!${NC}"
        curl -s http://$IP:3001/health | jq -r '"  Uptime: \(.uptime)s, Memory: \(.memory.used)/\(.memory.total)MB"'
    else
        echo -e "${RED}❌ $NAME health check failed${NC}"
    fi
    echo ""
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✅ Queue fix deployed to all online Goblins${NC}"
echo ""
echo -e "${BLUE}Test queue start:${NC}"
echo "  curl -X POST http://192.168.8.106:3001/queue/start \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"videos\":[\"video1.mp4\",\"video2.mp4\"],\"mode\":\"loop\"}'"
echo ""

