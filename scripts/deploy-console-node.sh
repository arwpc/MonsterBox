#!/bin/bash
# Deploy the current MonsterBox code to a Docker console node (Alpha) — the SAME file set the
# animatronics receive, so the console can never run code the fleet does not.
#
# Operator rule (2026-10-16, permanent): Alpha's code must not deviate from the main codebase in
# any way that would not also apply to the animatronics. It may differ only in its character,
# parts and node-local state. So this script does not build from the host's git checkout: it
# rsyncs with scripts/deploy-excludes.txt (the list scripts/deploy-to-animatronic.sh uses) into
# ~/monsterbox-console/tree on the console host, then rebuilds the container from that tree.
# data/ and config/ inside the tree are the console's live state (mounted into the container),
# protected by the same excludes that protect a Pi's state.
#
# Usage: scripts/deploy-console-node.sh <ip> [--dry-run]
# Auth: SSH key, or MONSTERBOX_SSH_PASSWORD / SSH_PASS (same as the animatronic deploy).
set -uo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <ip_address> [--dry-run]"
    exit 1
fi
IP_ADDRESS=$1
DRY_RUN=0
[ "${2:-}" = "--dry-run" ] && DRY_RUN=1

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
REMOTE_USER="remote"
STATE="/home/remote/monsterbox-console"
TREE="${STATE}/tree"
COMPOSE="docker/console-node/compose.yaml"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8"

PASS="${MONSTERBOX_SSH_PASSWORD:-${SSH_PASS:-}}"
if ssh -o BatchMode=yes ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "true" >/dev/null 2>&1; then
    SSH_RUN="ssh"; RSYNC_RSH="ssh ${SSH_OPTS}"
elif [ -n "$PASS" ]; then
    export SSHPASS="$PASS"
    SSH_RUN="sshpass -e ssh"; RSYNC_RSH="sshpass -e ssh ${SSH_OPTS}"
else
    echo "✗ Cannot authenticate to ${REMOTE_USER}@${IP_ADDRESS} — set MONSTERBOX_SSH_PASSWORD or install a key."
    exit 1
fi
remote() { ${SSH_RUN} ${SSH_OPTS} ${REMOTE_USER}@${IP_ADDRESS} "$@"; }

echo "=========================================="
echo "Deploying MonsterBox to console node ${IP_ADDRESS} (${TREE})"
[ "$DRY_RUN" = "1" ] && echo "** DRY RUN **"
echo "=========================================="

# One-time layout move: state used to live at ~/monsterbox-console/{data,config} with the code
# baked into the image from whatever checkout built it. The tree now holds code AND state, like
# /home/remote/MonsterBox on a Pi. The container is stopped for the move so nothing writes
# into a directory mid-rename.
if [ "$DRY_RUN" != "1" ]; then
    remote "set -e
        if [ -d ${STATE}/data ] && [ ! -e ${TREE}/data ]; then
            echo 'Moving console state into ${TREE} (one-time)...'
            sg docker -c 'docker stop monsterbox-console' >/dev/null 2>&1 || true
            mkdir -p ${TREE}
            mv ${STATE}/data ${TREE}/data
            mv ${STATE}/config ${TREE}/config
        fi
        mkdir -p ${TREE}" || { echo "✗ could not prepare ${TREE}"; exit 1; }
fi

# Locked characters' data directories are excluded exactly as on a Pi.
LOCK_EXCLUDES=()
while read -r LOCKED_ID; do
    [ -n "$LOCKED_ID" ] || continue
    LOCK_EXCLUDES+=(--exclude "data/character-${LOCKED_ID}/")
done < <(node -e "
  try {
    const d = require('./config/character-locks.json');
    for (const l of (d.locks || [])) if (l && l.characterId != null && l.active !== false) console.log(l.characterId);
  } catch (_) { /* no lock file: nothing locked */ }
" 2>/dev/null)

RSYNC_DRY=""
[ "$DRY_RUN" = "1" ] && RSYNC_DRY="-n"
rsync -e "${RSYNC_RSH}" -az ${RSYNC_DRY} --delete --itemize-changes \
    "${LOCK_EXCLUDES[@]}" \
    --exclude-from "${REPO_DIR}/scripts/deploy-excludes.txt" \
    ./ ${REMOTE_USER}@${IP_ADDRESS}:${TREE}/ | grep -vE '^\.[fdL] ' | tail -40
RSYNC_RC=${PIPESTATUS[0]}
if [ "$RSYNC_RC" -ne 0 ] && [ "$RSYNC_RC" -ne 23 ] && [ "$RSYNC_RC" -ne 24 ]; then
    echo "✗ rsync failed with exit ${RSYNC_RC} — not rebuilding."
    remote "sg docker -c 'docker start monsterbox-console'" >/dev/null 2>&1 || true
    exit "$RSYNC_RC"
fi
if [ "$DRY_RUN" = "1" ]; then
    echo "Dry-run complete. No rebuild."
    exit 0
fi
echo "✓ Code synced"

# Rebuild from the synced tree only (the compose file pins its build context there).
echo "Rebuilding and restarting the console container..."
remote "cd ${TREE} && sg docker -c 'docker compose -f ${COMPOSE} up -d --build' 2>&1 | tail -5" || {
    echo "✗ container rebuild failed"; exit 1; }

for _ in $(seq 1 24); do
    if curl -skf -m 4 "https://${IP_ADDRESS}:3000/health" >/dev/null 2>&1; then
        echo "✓ console node healthy at https://${IP_ADDRESS}:3000/"
        exit 0
    fi
    sleep 5
done
echo "✗ console node did not answer /health within 120 s — check: docker logs monsterbox-console"
exit 1
