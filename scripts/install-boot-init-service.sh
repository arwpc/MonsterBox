#!/usr/bin/env bash
set -euo pipefail
PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no'

SERVICE_PATH='/etc/systemd/system/monsterbox-init.service'

for HOST in skulltalker coffin pumpkinhead orlok groundbreaker; do
  echo "=== ${HOST} ==="
  sshpass -p "$PASS" ssh $SSH_OPTS remote@${HOST} 'bash -lc "echo OK"' >/dev/null || { echo "Cannot reach ${HOST}"; continue; }
  # Ensure script is present
  sshpass -p "$PASS" scp $SSH_OPTS scripts/boot-init.sh remote@${HOST}:/home/remote/MonsterBox/scripts/boot-init.sh >/dev/null || true
  sshpass -p "$PASS" ssh $SSH_OPTS remote@${HOST} 'chmod +x /home/remote/MonsterBox/scripts/boot-init.sh'
  # Install systemd unit directly via remote heredoc
  sshpass -p "$PASS" ssh $SSH_OPTS remote@${HOST} "cat > /tmp/monsterbox-init.service <<'EOF'
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
sudo mv /tmp/monsterbox-init.service ${SERVICE_PATH} && sudo systemctl daemon-reload && sudo systemctl enable monsterbox-init && sudo systemctl restart monsterbox-init && systemctl status monsterbox-init --no-pager -l | sed -n '1,12p'"
  echo
done

echo "boot-init service installed on all hosts."
