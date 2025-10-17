#!/usr/bin/env bash
set -euo pipefail
PASS='klrklr89!'
SSH_OPTS='-o StrictHostKeyChecking=no'
SERVICE_CONTENT='[Unit]\nDescription=MonsterBox Service\nAfter=network.target\n\n[Service]\nUser=remote\nWorkingDirectory=/home/remote/MonsterBox\nEnvironment=NODE_ENV=production\n# Lower default mic gain; can be overridden by env or UI later\nEnvironment=GAIN=130\n# CRITICAL: Required for TTS audio to work (mpg123 needs PulseAudio access)\nEnvironment=XDG_RUNTIME_DIR=/run/user/1000\nExecStart=/usr/bin/npm start\nRestart=always\nRestartSec=3\nStandardOutput=append:/var/log/monsterbox.log\nStandardError=append:/var/log/monsterbox.err\n\n[Install]\nWantedBy=multi-user.target\n'

for HOST in skulltalker coffin pumpkinhead orlok groundbreaker; do
  echo "=== ${HOST} ==="
  sshpass -p "$PASS" ssh $SSH_OPTS remote@${HOST} 'bash -lc "echo OK"' >/dev/null || { echo "Cannot reach ${HOST}"; continue; }
  sshpass -p "$PASS" ssh $SSH_OPTS remote@${HOST} "printf '%b' \"$SERVICE_CONTENT\" | sudo tee /etc/systemd/system/monsterbox.service >/dev/null && sudo systemctl unmask monsterbox || true && sudo systemctl daemon-reload && sudo systemctl enable monsterbox && sudo systemctl restart monsterbox && systemctl is-active monsterbox && systemctl status monsterbox --no-pager -l | sed -n '1,8p'" || echo "Failed to configure ${HOST}"
  echo
done

echo "Done."
