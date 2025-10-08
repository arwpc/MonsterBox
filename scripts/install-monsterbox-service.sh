#!/usr/bin/env bash
set -euo pipefail

# Installs and enables a systemd service to auto-start MonsterBox on boot
# Usage: run locally to install on all animatronics via SSH or copy to device and run with sudo

SERVICE_NAME="monsterbox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
WORKDIR="/home/remote/MonsterBox"
NODE_ENV_VALUE="production"

if [[ "${1:-}" == "--local" ]]; then
  # Install on the local machine (assumes running on the Pi)
  sudo bash -c "cat > ${SERVICE_FILE}" <<EOF
[Unit]
Description=MonsterBox Service
After=network.target

[Service]
User=remote
WorkingDirectory=${WORKDIR}
Environment=NODE_ENV=${NODE_ENV_VALUE}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
StandardOutput=append:/var/log/monsterbox.log
StandardError=append:/var/log/monsterbox.err

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable ${SERVICE_NAME}
  sudo systemctl restart ${SERVICE_NAME}
  echo "✓ Installed and started ${SERVICE_NAME}"
  exit 0
fi

# Remote install helper
HOSTS=("skulltalker" "coffin" "pumpkinhead" "orlok")
PASS="klrklr89!"
SSH_OPTS="-o StrictHostKeyChecking=no"

for h in "${HOSTS[@]}"; do
  echo "=== Installing ${SERVICE_NAME} on ${h} ==="
  sshpass -p "$PASS" ssh $SSH_OPTS remote@${h} 'bash -lc '\''cat >/tmp/install-mb-service.sh <<"EOS"
#!/usr/bin/env bash
set -euo pipefail
SERVICE_NAME="monsterbox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
WORKDIR="/home/remote/MonsterBox"
NODE_ENV_VALUE="production"

sudo bash -c "cat > ${SERVICE_FILE}" <<EOF
[Unit]
Description=MonsterBox Service
After=network.target

[Service]
User=remote
WorkingDirectory=${WORKDIR}
Environment=NODE_ENV=${NODE_ENV_VALUE}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
StandardOutput=append:/var/log/monsterbox.log
StandardError=append:/var/log/monsterbox.err

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}
systemctl status ${SERVICE_NAME} --no-pager -l | sed -n "1,12p"
echo "OK"
EOS
chmod +x /tmp/install-mb-service.sh
bash /tmp/install-mb-service.sh' || echo "Failed on ${h}" 
  echo
done

echo "Done."
