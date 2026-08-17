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
# Deploy credential. No in-repo fallback: the old committed default is compromised.
# MONSTERBOX_SSH_PASSWORD is canonical; SSH_PASS is kept for the existing callers that
# already set it. Exported as SSHPASS so sshpass reads it with -e (env) instead of
# -p (argv), keeping it out of the local process table.
PASS="${MONSTERBOX_SSH_PASSWORD:-${SSH_PASS:-}}"

# Prefer SSH KEYS when they already work. A fleet configured with authorized_keys
# is the more secure setup, and the previous behaviour — refusing to deploy unless
# a PASSWORD was exported — punished exactly that configuration and pushed
# operators back toward passwords. Keys first, password only as a fallback.
SSH_AUTH_MODE="key"
if ssh -o BatchMode=yes ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "echo ok" >/dev/null 2>&1; then
    SSH_AUTH_MODE="key"
elif [ -n "$PASS" ]; then
    SSH_AUTH_MODE="password"
else
    echo "✗ Cannot authenticate to ${REMOTE_USER}@${IP_ADDRESS} — refusing to deploy."
    echo "  Either install an SSH key for passwordless access (preferred):"
    echo "    ssh-copy-id ${REMOTE_USER}@${IP_ADDRESS}"
    echo "  or export a deploy password:"
    echo "    export MONSTERBOX_SSH_PASSWORD='<deploy password>'"
    exit 1
fi

# One indirection so every call site below works under either auth mode.
if [ "$SSH_AUTH_MODE" = "password" ]; then
    export SSHPASS="$PASS"
    SSH_RUN="sshpass -e ssh"
    RSYNC_RUN="sshpass -e rsync"
else
    SSH_RUN="ssh"
    RSYNC_RUN="rsync"
fi

echo "Testing SSH connection (${SSH_AUTH_MODE} auth)..."
if ${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "echo 'Connected'" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} SSH connection successful"
else
    echo "✗ SSH connection failed"
    echo "  Ensure ${REMOTE_USER}@${IP_ADDRESS} is reachable and the ${SSH_AUTH_MODE} is valid"
    exit 1
fi
echo ""

# Sync code (excluding node_modules, data, logs)
# Pre-clean heavy artifacts on remote to free space
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "rm -rf ${REMOTE_PATH}/playwright-report ${REMOTE_PATH}/test-results ${REMOTE_PATH}/playwright-diagnostics || true"

echo "Syncing code to ${IP_ADDRESS}..."
RSYNC_DRY=""
if [ "$DRY_RUN" = "1" ]; then RSYNC_DRY="-n"; fi

# Stop the service BEFORE the sync (real runs only). A node that keeps running
# during rsync lazily imports modules out of a half-replaced tree — one node
# crash-looped with ERR_MODULE_NOT_FOUND on files that were mid-transfer, and
# systemd's Restart=always then piled EADDRINUSE double-starts on top. A short
# planned outage beats an unplanned crash loop; the restart at the end of this
# script brings it back on the complete new tree either way.
if [ "$DRY_RUN" != "1" ]; then
    echo "Stopping monsterbox.service on ${IP_ADDRESS} for the sync window..."
    ${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "sudo systemctl stop monsterbox || true"
fi
# rsync's exit status is checked explicitly rather than left to `set -e`.
#
# Nodes accumulate a few root-owned paths the deploy user cannot replace —
# certs/, and a stray root-owned data/ai-config/ left by an old context-fallback
# bug. rsync reports those as exit 23 ("partial transfer due to error") even
# though every file that matters synced fine. Under `set -e` that aborted the
# script BEFORE the service restart, so the new code landed but the node kept
# running the old build and the deploy looked like it had done nothing at all.
# That is exactly how a fleet ends up silently running mixed versions.
set +e
# The excludes below split into two families:
#  - build artifacts (node_modules, logs, test output), and
#  - NODE-LOCAL OPERATIONAL STATE. Each node owns its own calibration
#    (calibration_profiles.json is gitignored precisely because a profile is a
#    measurement of ONE node's hardware), actuator positions, superpower
#    toggles, and selected character. Deploying used to overwrite a node's
#    live calibration with the deploying node's stale copy of it — a deploy
#    must bring code, never another machine's measurements.
${RSYNC_RUN} -e "ssh ${SSH_OPTS}" -avz ${RSYNC_DRY} --delete \
    --exclude 'node_modules' \
    --exclude 'data/character-*/parts.json' \
    --exclude 'data/character-*/poses.json' \
    --exclude 'data/character-*/servo_calibrations.json' \
    --exclude 'data/character-*/super-powers.json' \
    --exclude 'data/character-*/lurk-mode-state.json' \
    --exclude 'data/character-*/ai_agent_state.json' \
    --exclude 'data/character-*/movement-config.json' \
    --exclude 'data/calibration_profiles.json' \
    --exclude 'data/actuator-positions.json' \
    --exclude 'data/monsterbox.pid' \
    --exclude 'config/app-config.json' \
    --exclude 'scripts/fleet-audio/results' \
    --exclude 'scripts/halloween-judges/results' \
    --exclude '.git' \
    --exclude 'logs' \
    --exclude 'tmp' \
    --exclude '*.log' \
    --exclude 'playwright-report' \
    --exclude 'test-results' \
    --exclude 'playwright-diagnostics' \
    --exclude 'ARCHIVE' \
    ./ ${REMOTE_USER}@${IP_ADDRESS}:${REMOTE_PATH}/
RSYNC_RC=$?
set -e
# 0 = clean. 23/24 = some files skipped (permissions, or vanished mid-copy):
# warn loudly and carry on to the restart. Anything else is a real failure.
if [ "$RSYNC_RC" -eq 23 ] || [ "$RSYNC_RC" -eq 24 ]; then
    echo -e "${YELLOW}⚠ rsync exit ${RSYNC_RC}: some files were skipped (usually root-owned certs/ or a stray root-owned data/ai-config/).${NC}"
    echo -e "${YELLOW}  Continuing to the restart — but if this node keeps behaving like an old build, check what was skipped above.${NC}"
    echo -e "${YELLOW}  To clear the common cause: sudo rm -rf ${REMOTE_PATH}/data/ai-config${NC}"
elif [ "$RSYNC_RC" -ne 0 ]; then
    echo "✗ rsync failed with exit ${RSYNC_RC} — not proceeding with a partial deploy."
    # The service was stopped for the sync window; a failed sync must not leave
    # the node dark. Bring it back up on whatever tree it has (worst case the
    # old build — a known state) and bail.
    ${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "sudo systemctl start monsterbox || true"
    exit "$RSYNC_RC"
fi
if [ "$DRY_RUN" = "1" ]; then
    echo -e "${YELLOW}Dry-run complete. Skipping remote key/dependencies/restart steps.${NC}"
    exit 0
fi



echo -e "${GREEN}✓${NC} Code synced"
echo ""

# Ensure ElevenLabs key file exists or set from env
if [ -n "${XI_API_KEY:-}" ]; then
  echo "Installing ElevenLabs key from XI_API_KEY..."
  ${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "sudo mkdir -p /etc/monsterbox && echo '${XI_API_KEY}' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null && sudo chmod 600 /etc/monsterbox/elevenlabs.key && echo '✓ Key installed'" || true
fi

echo "Checking ElevenLabs API key..."
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
    command -v avahi-browse >/dev/null 2>&1 || sudo apt-get install -y avahi-daemon avahi-utils >/dev/null 2>&1 || true
    sudo systemctl enable --now avahi-daemon >/dev/null 2>&1 || true
    cd ${REMOTE_PATH} && sudo MB_ADVERTISE_ID=${CHARACTER_ID} MB_SERVICE_FILE=/etc/avahi/services/monsterbox.service node scripts/advertise-node.mjs 2>/dev/null || echo '  (mDNS advertise skipped — check avahi is installed)'
"
echo ""

# Check service status and select character
echo "Checking service status..."
${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "
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

