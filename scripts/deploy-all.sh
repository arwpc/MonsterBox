#!/bin/bash
# Deploy the current MonsterBox codebase to ALL animatronics at once.
#
# Reads the node roster from config/animatronics.json (character-independent — add a
# 6th character and it deploys too, no script edit). Runs one deploy per node in
# parallel, brings each onto the current code + mDNS node discovery, then prints a
# per-node summary.
#
# Usage:
#   MONSTERBOX_SSH_PASSWORD='...' XI_API_KEY='sk_...' ./scripts/deploy-all.sh [--dry-run]
#
# Notes:
#   - The SSH password comes from MONSTERBOX_SSH_PASSWORD (or SSH_PASS) — never
#     hardcoded here. Key-based auth also works if your keys are already deployed.
#   - --dry-run previews the rsync for each node without restarting anything.
#   - After a real run, discovery makes the hand-typed IPs obsolete; they are only
#     needed to bootstrap this first deploy. See docs/development/NODE-DISCOVERY.md
#     and docs/setup/NODE-DISCOVERY-VALIDATION.md.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

# Propagate SSH creds to the single-node deploy (which reads SSH_PASS).
export SSH_PASS="${MONSTERBOX_SSH_PASSWORD:-${SSH_PASS:-}}"
if [ -z "$SSH_PASS" ]; then
  echo "⚠  No SSH password set. Export MONSTERBOX_SSH_PASSWORD (or SSH_PASS) first,"
  echo "   or ensure key-based SSH auth to each node is already configured."
fi

# Enumerate nodes from the roster — id + ip + name, no hardcoding.
mapfile -t NODES < <(node -e "
  const a = require('./config/animatronics.json').animatronics || [];
  for (const n of a) if (n.id != null && n.ip) console.log([n.id, n.ip, String(n.name||'').replace(/\s+/g,'_')].join(' '));
")

if [ "${#NODES[@]}" -eq 0 ]; then
  echo "No animatronics with an ip found in config/animatronics.json — nothing to deploy."
  exit 1
fi

echo "=========================================="
echo "Deploying MonsterBox to ${#NODES[@]} animatronic(s)"
[ -n "$DRY" ] && echo "** DRY RUN (no restarts) **"
echo "=========================================="
printf '%s\n' "${NODES[@]}" | awk '{printf "  - %s (id %s) @ %s\n", $3, $1, $2}'
echo ""

LOGDIR="$(mktemp -d)"

for entry in "${NODES[@]}"; do
  # shellcheck disable=SC2086
  set -- $entry
  ID="$1"; IP="$2"
  (
    if bash "$REPO_DIR/scripts/deploy-to-animatronic.sh" "$ID" "$IP" $DRY > "$LOGDIR/${ID}.log" 2>&1; then
      echo "OK" > "$LOGDIR/${ID}.status"
    else
      echo "FAIL" > "$LOGDIR/${ID}.status"
    fi
  ) &
done

echo "Deploying in parallel… (per-node logs in $LOGDIR)"
wait

echo ""
echo "=========================================="
echo "Deploy summary"
echo "=========================================="
FAILED=0
for entry in "${NODES[@]}"; do
  # shellcheck disable=SC2086
  set -- $entry
  ID="$1"; NAME="${3:-node-$1}"
  STATUS="$(cat "$LOGDIR/${ID}.status" 2>/dev/null || echo '???')"
  if [ "$STATUS" = "OK" ]; then
    echo "  ✓ ${NAME} (id ${ID})"
  else
    echo "  ✗ ${NAME} (id ${ID}) — see $LOGDIR/${ID}.log"
    FAILED=$((FAILED + 1))
  fi
done
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo "All nodes deployed. Verify discovery from any node:"
  echo "  curl -sk https://<any-node>:3000/api/orchestration/nodes | jq '.nodes[] | {name,ip,status,source}'"
else
  echo "$FAILED node(s) failed — inspect the logs above and re-run for those nodes."
  exit 1
fi
