#!/bin/bash
set -euo pipefail

# MonsterBox 5.2 Handoff Deploy Script
# - Installs deploy key onto devices (ssh-copy-id)
# - Deploys current main to each animatronic using scripts/deploy-to-animatronic.sh
# - Reads devices from config/animatronics.json (no hardcoded IPs)
#
# Usage:
#   ./scripts/handoff-device-deploy.sh          # print plan, dry-run
#   ./scripts/handoff-device-deploy.sh --apply  # perform ssh-copy-id and deploys
#
# Requirements: jq installed, ~/.ssh/monsterbox_deploy(.pub) present

CONFIG_FILE="$(dirname "$0")/../config/animatronics.json"
DEPLOY_KEY="${HOME}/.ssh/monsterbox_deploy"
APPLY="false"

if [[ "${1:-}" == "--apply" ]]; then
  APPLY="true"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq is required. Install with: sudo apt-get install -y jq"
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "❌ Missing config: $CONFIG_FILE"
  exit 1
fi

if [[ ! -f "${DEPLOY_KEY}.pub" ]]; then
  echo "🔑 Generating deploy key at ${DEPLOY_KEY}"
  ssh-keygen -t ed25519 -C "monsterbox-deploy" -f "$DEPLOY_KEY" -N ""
fi

# Collect devices (exclude goblin display)
mapfile -t DEVICES < <(jq -r 'to_entries | map(select(.key != "goblin")) | .[].key' "$CONFIG_FILE")

printf "\n📋 Deploy Plan (from %s)\n" "$CONFIG_FILE"
for dev in "${DEVICES[@]}"; do
  ip=$(jq -r --arg k "$dev" '.[$k].ip // .[$k].host' "$CONFIG_FILE")
  cid=$(jq -r --arg k "$dev" '.[$k].characterId // empty' "$CONFIG_FILE")
  printf " - %-13s → %-15s  characterId=%s\n" "$dev" "$ip" "${cid:-n/a}"
  COPY_CMD="ssh-copy-id -i ${DEPLOY_KEY}.pub remote@${ip}"
  DEPLOY_CMD="bash ./scripts/deploy-to-animatronic.sh ${cid:-<id>} ${ip}"
  echo "   copy:   $COPY_CMD"
  echo "   deploy: $DEPLOY_CMD"
  if [[ "$APPLY" == "true" ]]; then
    echo "   → Installing deploy key..."
    ssh-copy-id -i "${DEPLOY_KEY}.pub" "remote@${ip}" || true
    echo "   → Deploying..."
    bash ./scripts/deploy-to-animatronic.sh "${cid}" "${ip}"
  fi
  echo
done

if [[ "$APPLY" != "true" ]]; then
  echo "💡 Dry-run complete. Re-run with --apply to execute."
fi

