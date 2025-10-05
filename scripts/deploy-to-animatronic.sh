#!/bin/bash
# Deploy MonsterBox to Animatronic
# Usage: ./scripts/deploy-to-animatronic.sh <character_id> <ip_address>
# Optional: --dry-run to preview rsync changes only (no remote restart)

# Example: ./scripts/deploy-to-animatronic.sh 3 192.168.8.120

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <character_id> <ip_address> [--dry-run]"
    echo "Example: $0 3 192.168.8.120 --dry-run"
    echo ""
    echo "Character IDs:"
    echo "  1 - PumpkinHead (192.168.8.150)"
    echo "  2 - Coffin Breaker (192.168.8.140)"
    echo "  3 - Orlok (192.168.8.120)"
    echo "  4 - Skulltalker (192.168.8.130)"
    exit 1
fi

CHARACTER_ID=$1
DRY_RUN=0
if [ "$3" = "--dry-run" ] || [ "$4" = "--dry-run" ]; then
    DRY_RUN=1
fi
if [ "$DRY_RUN" = "1" ]; then
    echo -e "${YELLOW}** DRY RUN ENABLED **${NC}"
fi


IP_ADDRESS=$2
REMOTE_USER="remote"
REMOTE_PATH="/home/remote/MonsterBox"

echo "=========================================="
echo "Deploying MonsterBox to Animatronic"
echo "Character ID: $CHARACTER_ID"
echo "IP Address: $IP_ADDRESS"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# SSH options for non-interactive deploys
SSH_OPTS="-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5"

# Test SSH connection
echo "Testing SSH connection..."
if ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} SSH connection successful"
else
    echo "✗ SSH connection failed"
    echo "  Make sure you can SSH to ${REMOTE_USER}@${IP_ADDRESS}"
    echo "  Tip: use ssh-copy-id to install your deploy key"
    exit 1
fi
echo ""

# Sync code (excluding node_modules, data, logs)
echo "Syncing code to ${IP_ADDRESS}..."
RSYNC_DRY=""
if [ "$DRY_RUN" = "1" ]; then RSYNC_DRY="-n"; fi
rsync -e "ssh ${SSH_OPTS}" -avz ${RSYNC_DRY} --delete \
    --exclude 'node_modules' \
    --exclude 'data/character-*/parts.json' \
    --exclude 'data/character-*/poses.json' \
    --exclude 'data/character-*/servo_calibrations.json' \
    --exclude '.git' \
    --exclude 'logs' \
    --exclude 'tmp' \
    --exclude '*.log' \
    ./ ${REMOTE_USER}@${IP_ADDRESS}:${REMOTE_PATH}/
if [ "$DRY_RUN" = "1" ]; then
    echo -e "${YELLOW}Dry-run complete. Skipping remote key/dependencies/restart steps.${NC}"
    exit 0
fi



echo -e "${GREEN}✓${NC} Code synced"
echo ""

# Ensure ElevenLabs key file exists
echo "Checking ElevenLabs API key..."
ssh ${REMOTE_USER}@${IP_ADDRESS} "
    if [ ! -f /etc/monsterbox/elevenlabs.key ]; then
        echo '⚠ ElevenLabs key file not found on remote'
        echo '  Create it with: echo \"sk_YOUR_KEY_HERE\" | sudo tee /etc/monsterbox/elevenlabs.key'
        echo '  Then: sudo chmod 600 /etc/monsterbox/elevenlabs.key'
    else
        PERMS=\$(stat -c %a /etc/monsterbox/elevenlabs.key)
        if [ \"\$PERMS\" = \"600\" ]; then
            echo '✓ ElevenLabs key file exists with correct permissions'
        else
            echo '⚠ Key file permissions are \$PERMS (should be 600)'
            echo '  Run: sudo chmod 600 /etc/monsterbox/elevenlabs.key'
        fi
    fi
"
echo ""

# Install dependencies if needed
echo "Checking dependencies..."
ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    cd ${REMOTE_PATH}
    if [ ! -d node_modules ]; then
        echo 'Installing npm dependencies...'
        npm install
    else
        echo '✓ Dependencies already installed'
    fi
"
echo ""

# Restart service
echo "Restarting MonsterBox service..."
ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    cd ${REMOTE_PATH}
    pkill -f 'node.*server.js' || true
    sleep 2
    nohup npm start > /tmp/monsterbox.out 2>&1 &
    sleep 3
    if pgrep -f 'node.*server.js' > /dev/null; then
        echo '✓ MonsterBox service started'
    else
        echo '✗ Failed to start MonsterBox service'
        echo 'Check logs: tail -f /tmp/monsterbox.out'
        exit 1
    fi
"
echo ""

# Check service status
echo "Checking service status..."
ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    sleep 2
    if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
        echo '✓ MonsterBox API is responding'
    elif curl -sf http://127.0.0.1:3000/ > /dev/null 2>&1; then
        echo '✓ MonsterBox HTTP root responding'
    else
        echo '⚠ MonsterBox API not responding yet (may still be starting)'
    fi
"
echo ""

echo "=========================================="
echo "Deployment Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. SSH to the device: ssh ${REMOTE_USER}@${IP_ADDRESS}"
echo "2. Run the test script: cd ${REMOTE_PATH} && ./scripts/orlok-bringup-test.sh"
echo "3. Check logs: tail -f /tmp/monsterbox.out"
echo "4. Test TTS: curl -X POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"text\":\"Test message\",\"characterId\":${CHARACTER_ID}}'"
echo ""

