#!/bin/bash
# Bring up a single animatronic (Skulltalker, Coffin, PumpkinHead) end-to-end
# Ensures: code deployed, ElevenLabs key set (if provided), WirePlumber configured,
# PipeWire user services enabled, mjpg-streamer installed+enabled, MonsterBox running.
#
# Usage:
#   ./scripts/bringup-animatronic.sh <host_or_ip> <character_id> [--dry-run]
# Examples:
#   ./scripts/bringup-animatronic.sh skulltalker 4
#   XI_API_KEY="sk_..." ./scripts/bringup-animatronic.sh coffin 2
#
# Notes:
# - Requires sshpass locally; remote credentials are remote/klrklr89!
# - Non-destructive to data/character-*; rsync excludes those files by default

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <host_or_ip> <character_id> [--dry-run]"
  exit 1
fi

HOST="$1"
CHAR_ID="$2"
DRY_RUN=0
if [ "$3" = "--dry-run" ] || [ "$4" = "--dry-run" ]; then DRY_RUN=1; fi

PASS="klrklr89!"
USER="remote"
REMOTE="${USER}@${HOST}"
REMOTE_DIR="/home/${USER}/MonsterBox"
SSH_BASE_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=6"
SSH="sshpass -p ${PASS} ssh ${SSH_BASE_OPTS}"
SCP="sshpass -p ${PASS} scp ${SSH_BASE_OPTS}"
RSYNC="rsync"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log(){ echo -e "${BLUE}>>>${NC} $*"; }
ok(){ echo -e "${GREEN}✓${NC} $*"; }
warn(){ echo -e "${YELLOW}⚠${NC} $*"; }
err(){ echo -e "${RED}✗${NC} $*"; }

log "Bring-up: ${HOST} (character ${CHAR_ID})"

# 0) Connectivity
log "Checking SSH connectivity to ${REMOTE}..."
if ${SSH} ${REMOTE} "echo connected" >/dev/null 2>&1; then ok "SSH ok"; else err "SSH failed"; exit 1; fi

# 1) Ensure target directory
log "Ensuring ${REMOTE_DIR} exists"
${SSH} ${REMOTE} "mkdir -p ${REMOTE_DIR}" || true

# 2) Sync code
log "Syncing code (excluding node_modules and character data)"
DRY_FLAG=""; [ "$DRY_RUN" = "1" ] && DRY_FLAG="-n"
RSYNC_RSH="sshpass -p ${PASS} ssh ${SSH_BASE_OPTS}" ${RSYNC} -avz ${DRY_FLAG} --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'logs' \
  --exclude 'tmp' \
  --exclude '*.log' \
  --exclude 'data/character-*/parts.json' \
  --exclude 'data/character-*/poses.json' \
  --exclude 'data/character-*/servo_calibrations.json' \
  ./ ${REMOTE}:${REMOTE_DIR}/
[ "$DRY_RUN" = "1" ] && { warn "Dry-run: stopping after rsync"; exit 0; }

ok "Code synced"

# 3) ElevenLabs API key
if [ -n "${XI_API_KEY}" ]; then
  log "Installing ElevenLabs API key on remote (secure permissions)"
  ${SSH} ${REMOTE} "sudo mkdir -p /etc/monsterbox && echo -n '${XI_API_KEY}' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null && sudo chmod 600 /etc/monsterbox/elevenlabs.key && sudo chown ${USER}:${USER} /etc/monsterbox/elevenlabs.key || true"
  ok "Key installed"
else
  warn "XI_API_KEY not provided. Skipping key install."
fi

# 4) Install/enable mjpg-streamer service
log "Installing/Enabling mjpg-streamer systemd service"
${SSH} ${REMOTE} "cd ${REMOTE_DIR} && sudo bash scripts/install-mjpg-streamer-integration.sh" || warn "mjpg-streamer install script reported non-fatal issues"

# 5) Install/enable mjpg-streamer watchdog
log "Installing/Enabling mjpg-streamer watchdog timer"
${SSH} ${REMOTE} "cd ${REMOTE_DIR} && sudo bash scripts/install-mjpg-streamer-watchdog.sh" || warn "watchdog install reported non-fatal issues"

# 6) Configure WirePlumber/PipeWire reliability
log "Configuring WirePlumber/PipeWire (user services, linger, restart policies)"
${SSH} ${REMOTE} "cd ${REMOTE_DIR} && sudo bash scripts/configure-wireplumber.sh ${USER}"

# 7) Dependencies and start
log "Ensuring npm dependencies, starting MonsterBox"
${SSH} ${REMOTE} "cd ${REMOTE_DIR} && ( [ -d node_modules ] || npm ci ) && pkill -f 'node.*server.js' || true && nohup npm start > /tmp/monsterbox.out 2>&1 & sleep 3"

# 7) Health checks
log "Verifying services"
${SSH} ${REMOTE} "systemctl is-active --quiet mjpg-streamer && echo 'mjpg:ok' || echo 'mjpg:fail'; systemctl --user is-active --quiet wireplumber && echo 'wp:ok' || echo 'wp:fail'" | sed 's/^/  /'

log "Checking HTTP endpoints"
${SSH} ${REMOTE} "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/" | awk '{print "  MonsterBox / => HTTP "$1}'
${SSH} ${REMOTE} "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/?action=stream" | awk '{print "  mjpg-streamer => HTTP "$1}'

# 8) Optional: quick TTS smoke (requires valid key)
if [ -n "${XI_API_KEY}" ]; then
  log "TTS quick smoke"
  READINESS=$(${SSH} ${REMOTE} "curl -s -X POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play -H 'Content-Type: application/json' -d '{"text":"Skull check","characterId":${CHAR_ID}}' | jq -r '.success // false'" || echo false)
  if [ "${READINESS}" = "true" ]; then ok "TTS playback endpoint returned success"; else warn "TTS playback endpoint did not return success"; fi
else
  warn "Skipping TTS smoke (no XI_API_KEY)"
fi

ok "Bring-up completed for ${HOST} (character ${CHAR_ID})"

