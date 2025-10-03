#!/usr/bin/env bash
set -euo pipefail

# Auto-enable services on boot, reboot devices, and validate availability
# Animatronics: use hostnames (no .lan)
# Goblins: ALWAYS use the fixed IPs per ops policy
#
# Usage:
#   export MB_REMOTE_PASSWORD='klrklr89!'
#   bash scripts/auto-boot-verify.sh
#
# Optional env:
#   HOSTS="coffin orlok skulltalker pumpkinhead"   # space-separated animatronic hostnames
#   GOBLIN_IPS="192.168.8.160 192.168.8.161"      # space-separated goblin IPs

PASS="${MB_REMOTE_PASSWORD:-klrklr89!}"
ANIM_HOSTS=( ${HOSTS:-coffin orlok skulltalker pumpkinhead} )
GOBLIN_IPS=( ${GOBLIN_IPS:-192.168.8.160 192.168.8.161} )

ssh_base=(sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=6)

banner(){ echo; echo "==================== $* ===================="; }

wait_for_ssh(){
  local host="$1"; local tries=60
  for ((i=1;i<=tries;i++)); do
    if "${ssh_base[@]}" -o BatchMode=yes remote@"$host" 'echo ok' >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

http_200(){
  local url="$1"
  curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$url" || true
}

verify_monsterbox(){
  local host="$1"
  local st="inactive"
  st=$("${ssh_base[@]}" remote@"$host" 'systemctl is-active monsterbox || true' 2>/dev/null || true)
  local http=$(http_200 "http://$host:3000/")
  local mjpg=$(http_200 "http://$host:8090/?action=stream")
  local ws=$("${ssh_base[@]}" remote@"$host" "ss -tulpn 2>/dev/null | grep ':8795 ' >/dev/null && echo LISTENING || echo UNKNOWN" || true)
  echo "HOST=$host SERVICE=$st HTTP=$http MJPG_HTTP=$mjpg WS=$ws"
}

verify_goblin(){
  local ip="$1"
  local st=$("${ssh_base[@]}" remote@"$ip" 'systemctl is-active goblin || true' 2>/dev/null || true)
  local h=$(http_200 "http://$ip:3001/health")
  echo "GOBLIN=$ip SERVICE=$st HEALTH_HTTP=$h"
}

reboot_anim(){
  local host="$1"
  banner "Animatronic $host: enable+reboot"
  "${ssh_base[@]}" -tt remote@"$host" "bash -lc 'set -e; echo $PASS | sudo -S systemctl enable monsterbox >/dev/null 2>&1 || true; echo $PASS | sudo -S systemctl restart monsterbox || true; echo $PASS | sudo -S reboot'" || true
  echo "Waiting for $host to come back..."
  sleep 8
  wait_for_ssh "$host" || echo "WARN: $host did not come back to SSH in time"
  verify_monsterbox "$host"
}

reboot_goblin(){
  local ip="$1"
  banner "Goblin $ip: enable+reboot"
  "${ssh_base[@]}" -tt remote@"$ip" "bash -lc 'set -e; cd ~/MonsterBox/goblin-system || true; if [ -f install-service.sh ]; then echo $PASS | sudo -S bash install-service.sh || true; fi; echo $PASS | sudo -S systemctl enable goblin || true; echo $PASS | sudo -S systemctl restart goblin || true; echo $PASS | sudo -S reboot'" || true
  echo "Waiting for $ip to come back..."
  sleep 8
  wait_for_ssh "$ip" || echo "WARN: goblin $ip did not come back to SSH in time"
  verify_goblin "$ip"
}

main(){
  banner "Rebooting Animatronics"
  for h in "${ANIM_HOSTS[@]}"; do reboot_anim "$h"; done
  banner "Rebooting Goblins"
  for g in "${GOBLIN_IPS[@]}"; do reboot_goblin "$g"; done
  banner "Final verification"
  for h in "${ANIM_HOSTS[@]}"; do verify_monsterbox "$h"; done
  for g in "${GOBLIN_IPS[@]}"; do verify_goblin "$g"; done
  echo "Done."
}

main "$@"

