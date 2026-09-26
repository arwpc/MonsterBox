#!/bin/bash
# Run stabilize-goblin.sh on every registered Goblin from a MonsterBox node, over the fleet SSH password.
# Usage (on Orlok): sudo bash scripts/goblin-os/stabilize-all.sh [--reboot]
set -u
. /etc/monsterbox/env; export SSHPASS="$MONSTERBOX_SSH_PASSWORD"
HERE=$(cd "$(dirname "$0")" && pwd)
IPS=$(python3 -c "import json;[print(g['endpoint'].split('//')[1].split(':')[0]) for g in json.load(open('$HERE/../../data/goblins.json'))]")
for ip in $IPS; do
  echo "########## $ip"
  if ! timeout 15 sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 remote@$ip true 2>/dev/null; then echo "not reachable — skipped"; continue; fi
  timeout 60 sshpass -e scp -o StrictHostKeyChecking=no "$HERE/stabilize-goblin.sh" remote@$ip:/tmp/stabilize-goblin.sh
  timeout 300 sshpass -e ssh -o StrictHostKeyChecking=no remote@$ip "sudo -n bash /tmp/stabilize-goblin.sh"
  if [ "${1:-}" = "--reboot" ]; then timeout 20 sshpass -e ssh -o StrictHostKeyChecking=no remote@$ip "sudo -n reboot" 2>/dev/null; echo "rebooting"; fi
done
