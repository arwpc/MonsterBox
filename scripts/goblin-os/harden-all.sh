#!/bin/bash
# Run harden-goblin.sh on every registered Goblin from a MonsterBox node, and ship the current
# player code (queueManager.js, mpvController.js) with it. Goblins come from data/goblins.json.
# Usage: bash scripts/goblin-os/harden-all.sh [ip ...]     (no ips = every registered Goblin)
# Needs /etc/monsterbox/env (MONSTERBOX_SSH_PASSWORD) readable and sshpass. Sudo on the Goblin uses
# the same password when the unit has no NOPASSWD rule.
set -u
. /etc/monsterbox/env; export SSHPASS="$MONSTERBOX_SSH_PASSWORD"
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
SSHO=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=8)
if [ $# -gt 0 ]; then IPS="$*"; else
  IPS=$(python3 -c "import json;[print(g['endpoint'].split('//')[1].split(':')[0]) for g in json.load(open('$REPO/data/goblins.json'))]")
fi
rc=0
for ip in $IPS; do
  echo "########## $ip"
  if ! timeout 15 sshpass -e ssh "${SSHO[@]}" remote@"$ip" true 2>/dev/null; then echo "not reachable; skipped"; rc=1; continue; fi
  timeout 60 sshpass -e ssh "${SSHO[@]}" remote@"$ip" "mkdir -p /tmp/goblin-os" &&
  timeout 60 sshpass -e scp "${SSHO[@]}" -q "$HERE/harden-goblin.sh" "$HERE/goblin-wifi-guard.sh" "$REPO/goblin/goblin-setup.sh" remote@"$ip":/tmp/goblin-os/ &&
  timeout 60 sshpass -e scp "${SSHO[@]}" -q "$REPO/goblin/src/queueManager.js" remote@"$ip":/home/remote/goblin/src/queueManager.new.js &&
  timeout 60 sshpass -e scp "${SSHO[@]}" -q "$REPO/goblin/src/mpvController.js" remote@"$ip":/home/remote/goblin/src/mpvController.new.js &&
  timeout 30 sshpass -e ssh "${SSHO[@]}" remote@"$ip" "cd /home/remote/goblin/src && node --check queueManager.new.js && node --check mpvController.new.js && for f in queueManager mpvController; do cp -p \$f.js \$f.js.bak && mv \$f.new.js \$f.js; done && sync" ||
    { echo "copy failed"; rc=1; continue; }
  printf '%s\n' "$SSHPASS" | timeout 300 sshpass -e ssh "${SSHO[@]}" remote@"$ip" "sudo -S -p '' bash /tmp/goblin-os/harden-goblin.sh" || rc=1
done
exit $rc
