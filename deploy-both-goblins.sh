#!/bin/bash

# Deploy both goblins from MonsterBox main system
# This script SSHs into each goblin and deploys the production system

set -e

# Color output
print_status() { echo -e "\e[1;34m>>> $1\e[0m"; }
print_error() { echo -e "\e[1;31m>>> Error: $1\e[0m"; }
print_success() { echo -e "\e[1;32m>>> Success: $1\e[0m"; }

MONSTERBOX_HOST="192.168.8.200"
GOBLIN1_IP="192.168.8.160"
GOBLIN2_IP="192.168.8.161"
SSH_USER="remote"

print_status "🎃 Deploying Both Goblins for Production"
echo ""

# Function to deploy to a goblin
deploy_goblin() {
    local GOBLIN_IP=$1
    local GOBLIN_ID=$2
    
    print_status "Deploying to $GOBLIN_ID ($GOBLIN_IP)..."
    
    # Copy goblin-system directory to goblin
    print_status "Copying goblin-system files to $GOBLIN_ID..."
    scp -r goblin-system ${SSH_USER}@${GOBLIN_IP}:~/MonsterBox-goblin-system/
    
    # SSH and deploy
    print_status "Running deployment on $GOBLIN_ID..."
    ssh ${SSH_USER}@${GOBLIN_IP} << EOF
set -e
cd ~/MonsterBox-goblin-system/goblin-system
export GOBLIN_ID="$GOBLIN_ID"
export GOBLIN_PORT="3001"
export MONSTERBOX_HOST="$MONSTERBOX_HOST"
chmod +x deploy-production.sh
./deploy-production.sh
EOF
    
    if [ $? -eq 0 ]; then
        print_success "$GOBLIN_ID deployed successfully!"
    else
        print_error "$GOBLIN_ID deployment failed!"
        return 1
    fi
}

# Deploy goblin1
print_status "=== Deploying goblin1 ==="
deploy_goblin "$GOBLIN1_IP" "goblin1"
echo ""

# Deploy goblin2
print_status "=== Deploying goblin2 ==="
deploy_goblin "$GOBLIN2_IP" "goblin2"
echo ""

print_success "🎉 Both goblins deployed!"
echo ""
print_status "Waiting 10 seconds for goblins to register..."
sleep 10

# Test both goblins
print_status "Testing goblin1..."
if curl -s --connect-timeout 5 http://${GOBLIN1_IP}:3001/health > /dev/null 2>&1; then
    print_success "goblin1 is responding!"
else
    print_error "goblin1 is not responding"
fi

print_status "Testing goblin2..."
if curl -s --connect-timeout 5 http://${GOBLIN2_IP}:3001/health > /dev/null 2>&1; then
    print_success "goblin2 is responding!"
else
    print_error "goblin2 is not responding"
fi

echo ""
print_success "Deployment complete! Now test with:"
echo "  curl -X POST http://127.0.0.1:3000/scenes/api/7/play"

