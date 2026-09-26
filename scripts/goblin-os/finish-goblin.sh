#!/bin/bash
# When a Goblin answers, put tonight's player files on it, restart its player, set the green skull loop, verify.
# Usage: finish-goblin.sh <ip> <goblinId>   (exits 0 when done, 3 if not reachable within the window)
IP=$1; GID=$2; DEADLINE=$((SECONDS+560))
. /etc/monsterbox/env; export SSHPASS="$MONSTERBOX_SSH_PASSWORD"
SSHO="-o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=no"
while [ $SECONDS -lt $DEADLINE ]; do
  if curl -s -m 3 -o /dev/null -w "%{http_code}" http://$IP:3001/health | grep -q 200 && timeout 20 sshpass -e ssh $SSHO remote@$IP true 2>/dev/null; then
    echo "$(date +%H:%M:%S) $IP reachable — deploying"
    timeout 60 sshpass -e scp $SSHO /home/remote/MonsterBox/goblin/src/mpvController.js /home/remote/MonsterBox/goblin/src/queueManager.js remote@$IP:/home/remote/goblin/src/ || { echo "scp failed"; sleep 20; continue; }
    timeout 90 sshpass -e ssh $SSHO remote@$IP "cd /home/remote/goblin && node --check src/mpvController.js && node --check src/queueManager.js && sudo -n systemctl restart goblin.service && sleep 12 && curl -s -m 5 http://127.0.0.1:3001/health | head -c 20" || { echo "restart failed"; sleep 20; continue; }
    echo; echo "$(date +%H:%M:%S) setting Greenskull loop"
    curl -s -m 60 -X POST http://localhost:3100/video-library/api/goblins/control -H 'Content-Type: application/json' -d "{\"action\":\"loop\",\"filename\":\"Greenskull.mp4\",\"goblinIds\":[\"$GID\"]}" | head -c 300; echo
    sleep 4
    timeout 40 sshpass -e ssh $SSHO remote@$IP "echo \"mpv: \$(ps -o args= -C mpv | grep -oE -- '--loop|--no-audio|[^/]+\\.mp4\$' | tr '\n' ' ')\"; echo \"queue: \$(tr -d '\n ' < /home/remote/goblin/queue.json | cut -c1-140)\"; echo \"throttled: \$(vcgencmd get_throttled) uptime: \$(cut -d. -f1 /proc/uptime)s\""
    exit 0
  fi
  sleep 20
done
echo "$(date +%H:%M:%S) $IP not reachable within the window"; exit 3
