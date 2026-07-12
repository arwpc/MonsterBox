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
    echo "  2 - Mina (192.168.8.140)"
    echo "  3 - Orlok (192.168.8.120)"
    echo "  4 - Sir Dragomir (192.168.8.130)"
    echo "  5 - Groundbreaker (192.168.8.200)"
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
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8"
PASS="${SSH_PASS:-klrklr89!}"

# Test SSH connection (password auth by default)
echo "Testing SSH connection..."
if sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} SSH connection successful"
else
    echo "✗ SSH connection failed"
    echo "  Ensure ${REMOTE_USER}@${IP_ADDRESS} is reachable and password is correct"
    exit 1
fi
echo ""

# Sync code (excluding node_modules, data, logs)
# Pre-clean heavy artifacts on remote to free space
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "rm -rf ${REMOTE_PATH}/playwright-report ${REMOTE_PATH}/test-results ${REMOTE_PATH}/playwright-diagnostics || true"

echo "Syncing code to ${IP_ADDRESS}..."
RSYNC_DRY=""
if [ "$DRY_RUN" = "1" ]; then RSYNC_DRY="-n"; fi
sshpass -p "$PASS" rsync -e "ssh ${SSH_OPTS}" -avz ${RSYNC_DRY} --delete \
    --exclude 'node_modules' \
    --exclude 'data/character-*/parts.json' \
    --exclude 'data/character-*/poses.json' \
    --exclude 'data/character-*/servo_calibrations.json' \
    --exclude '.git' \
    --exclude 'logs' \
    --exclude 'tmp' \
    --exclude '*.log' \
    --exclude 'playwright-report' \
    --exclude 'test-results' \
    --exclude 'playwright-diagnostics' \
    --exclude 'ARCHIVE' \
    ./ ${REMOTE_USER}@${IP_ADDRESS}:${REMOTE_PATH}/
if [ "$DRY_RUN" = "1" ]; then
    echo -e "${YELLOW}Dry-run complete. Skipping remote key/dependencies/restart steps.${NC}"
    exit 0
fi



echo -e "${GREEN}✓${NC} Code synced"
echo ""

# Ensure ElevenLabs key file exists or set from env
if [ -n "${XI_API_KEY:-}" ]; then
  echo "Installing ElevenLabs key from XI_API_KEY..."
  sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "sudo mkdir -p /etc/monsterbox && echo '${XI_API_KEY}' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null && sudo chmod 600 /etc/monsterbox/elevenlabs.key && echo '✓ Key installed'" || true
fi

echo "Checking ElevenLabs API key..."
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    cd ${REMOTE_PATH}
    if [ ! -d node_modules ]; then
        echo 'Installing npm dependencies (ci)...'
        npm ci || npm install
    else
        echo '✓ Dependencies already installed'
    fi
"
echo ""

# Ensure systemd service is installed and running
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    SERVICE_FILE=/etc/systemd/system/monsterbox.service
    if [ ! -f \"$SERVICE_FILE\" ]; then
      echo 'Installing systemd service...'
      sudo bash -c 'cat > /etc/systemd/system/monsterbox.service' <<'EOF'
[Unit]
Description=MonsterBox Service
After=network-online.target
Wants=network-online.target

[Service]
User=remote
WorkingDirectory=/home/remote/MonsterBox
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=GAIN=130
Environment=XDG_RUNTIME_DIR=/run/user/1000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
StandardOutput=append:/var/log/monsterbox.log
StandardError=append:/var/log/monsterbox.err

[Install]
WantedBy=multi-user.target
EOF
      sudo systemctl daemon-reload
      sudo systemctl enable monsterbox || true
    fi
    echo 'Restarting monsterbox.service...'
    sudo systemctl restart monsterbox || true
    sleep 3
    systemctl is-active monsterbox && echo '✓ MonsterBox service active' || echo '⚠ MonsterBox service not active yet'
"

# Install/enable boot-init service to set random poses on boot (best-effort)
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    mkdir -p ${REMOTE_PATH}/scripts
    cp ${REMOTE_PATH}/scripts/boot-init.sh ${REMOTE_PATH}/scripts/boot-init.sh 2>/dev/null || true
    sudo bash -c 'cat > /etc/systemd/system/monsterbox-init.service' <<'EOF'
[Unit]
Description=MonsterBox Post-Boot Initializer
After=network-online.target monsterbox.service
Wants=network-online.target

[Service]
Type=oneshot
User=remote
WorkingDirectory=/home/remote/MonsterBox
ExecStart=/usr/bin/bash /home/remote/MonsterBox/scripts/boot-init.sh
RemainAfterExit=true

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable monsterbox-init || true
    sudo systemctl restart monsterbox-init || true
"
echo ""

# Optional: ensure mjpg-streamer is present and running
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    if ! systemctl list-unit-files | grep -q '^mjpg-streamer'; then
      echo 'Installing mjpg-streamer integration (best-effort)...'
      sudo bash /home/remote/MonsterBox/scripts/install-mjpg-streamer-integration.sh || true
    fi
    sudo systemctl enable mjpg-streamer 2>/dev/null || true
    sudo systemctl restart mjpg-streamer 2>/dev/null || true
"

# Zero-config node discovery (mDNS): ensure avahi is present and write the advertise
# service file with sudo. The monsterbox service runs as an unprivileged user and
# can't write /etc/avahi/services itself, so we place the file here at deploy time.
# See docs/development/NODE-DISCOVERY.md.
echo "Setting up mDNS node discovery..."
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    command -v avahi-browse >/dev/null 2>&1 || sudo apt-get install -y avahi-daemon avahi-utils >/dev/null 2>&1 || true
    sudo systemctl enable --now avahi-daemon >/dev/null 2>&1 || true
    cd ${REMOTE_PATH} && sudo MB_ADVERTISE_ID=${CHARACTER_ID} MB_SERVICE_FILE=/etc/avahi/services/monsterbox.service node scripts/advertise-node.mjs 2>/dev/null || echo '  (mDNS advertise skipped — check avahi is installed)'
"
echo ""

# Check service status and select character
echo "Checking service status..."
sshpass -p "$PASS" ssh ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    for i in 1 2 3 4 5 6 7 8 9 10; do
      if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
        echo '✓ MonsterBox API is responding'
        break
      fi
      sleep 1
    done
    # Select the target character id as active
    curl -s -X POST -H 'Content-Type: application/json' -d '{"id":'${CHARACTER_ID}'}' http://127.0.0.1:3000/setup/characters/api/select >/dev/null 2>&1 || true
    echo 'Selected character: ${CHARACTER_ID}'
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

