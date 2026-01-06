#!/bin/bash
###############################################################################
# MonsterBox 5.4 - Deploy to All Animatronics
# Pulls latest code from GitHub and restarts services
###############################################################################

# Don't use set -e here as it conflicts with arithmetic operations

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Animatronic Configuration
declare -A ANIMATRONICS
ANIMATRONICS[pumpkinhead]="192.168.8.150"
ANIMATRONICS[coffinbreaker]="192.168.8.140"
ANIMATRONICS[skulltalker]="192.168.8.130"
ANIMATRONICS[groundbreaker]="192.168.8.200"

SSH_USER="remote"
MONSTERBOX_DIR="/home/remote/MonsterBox"

echo -e "${BLUE}🎃 MonsterBox 5.4 - Deploy to All Animatronics${NC}"
echo "==============================================="
echo ""

# Function to deploy to a single animatronic
deploy_to_animatronic() {
    local name=$1
    local ip=$2
    
    echo -e "${YELLOW}📡 Deploying to $name ($ip)...${NC}"
    
    # Pull latest code
    echo "  → Pulling latest code from GitHub..."
    if ssh "$SSH_USER@$ip" "cd $MONSTERBOX_DIR && git pull origin main" 2>&1 | grep -v "Warning: Permanently added"; then
        echo "  ✓ Code pulled successfully"
    else
        echo -e "${RED}  ✗ Failed to pull code for $name${NC}"
        return 1
    fi
    
    # Install dependencies
    echo "  → Installing dependencies..."
    ssh "$SSH_USER@$ip" "cd $MONSTERBOX_DIR && npm install --production" 2>&1 | tail -3
    
    # Restart service
    echo "  → Restarting MonsterBox service..."
    ssh "$SSH_USER@$ip" "sudo systemctl restart monsterbox" 2>&1 | grep -v "Warning: Permanently added"
    
    # Wait for service to start
    sleep 3
    
    # Check service status
    local status=$(ssh "$SSH_USER@$ip" "systemctl is-active monsterbox" 2>&1 | grep -v "Warning: Permanently added")
    
    if [ "$status" = "active" ]; then
        echo -e "${GREEN}  ✓ $name deployed successfully!${NC}"
        return 0
    else
        echo -e "${RED}  ✗ $name service failed to start (status: $status)${NC}"
        return 1
    fi
}

# Deploy to each animatronic
DEPLOYED=0
FAILED=0

for NAME in skulltalker pumpkinhead coffinbreaker groundbreaker; do
    case "$NAME" in
        "pumpkinhead") IP="192.168.8.150" ;;
        "coffinbreaker") IP="192.168.8.140" ;;
        "skulltalker") IP="192.168.8.130" ;;
        "groundbreaker") IP="192.168.8.200" ;;
    esac
    
    echo ""
    if deploy_to_animatronic "$NAME" "$IP"; then
        ((DEPLOYED++))
    else
        ((FAILED++))
    fi
    echo ""
done

# Summary
echo "==============================================="
echo -e "${BLUE}📊 Deployment Summary${NC}"
echo "==============================================="
echo -e "${GREEN}✓ Successfully deployed: $DEPLOYED${NC}"
echo -e "${RED}✗ Failed deployments: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All animatronics deployed successfully!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some deployments failed. Check logs above.${NC}"
    exit 1
fi
