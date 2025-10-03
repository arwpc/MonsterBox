#!/usr/bin/env bash
# MonsterBox 5.1 (Gold 5.1) Multi-Device Deployment Helper
# - Deploys to Coffin, Orlok, Skulltalker, Pumpkinhead (adjust list as needed)
# - Updates repo to origin/main (v5.1.0), installs dependencies, ensures service
# - Runs webcam setup, restarts service, verifies HTTP endpoints
# - Registers Goblin 1 & 2 with each device's MonsterBox server
# Usage:
#   export MB_REMOTE_PASSWORD='klrklr89!'   # or pass as argument 2
#   bash scripts/deploy-animatronics-5.1.sh [username] [password]
#
# Safe to re-run; operations are idempotent.

set -euo pipefail

USER_NAME="${1:-remote}"
PASS_WORD="${2:-${MB_REMOTE_PASSWORD:-klrklr89!}}"

# Known devices (edit as needed)
HOSTS=(
  "192.168.8.140:coffin"
  "192.168.8.120:orlok"
  "192.168.8.130:skulltalker"
  "192.168.8.150:pumpkinhead"
)

# Optional: override HOSTS list with space-separated "ip:label" pairs via ONLY env
# Example: ONLY="192.168.8.130:skulltalker 192.168.8.150:pumpkinhead"
if [ -n "${ONLY:-}" ]; then
  HOSTS=( ${ONLY} )
fi


# Goblins
GOBLIN1_ENDPOINT="http://192.168.8.160:3001"
GOBLIN2_ENDPOINT="http://192.168.8.161:3001"

REMOTE_SCRIPT='set -e
if [ -d ~/MonsterBox/.git ]; then
  cd ~/MonsterBox
  git fetch --all --prune || true
  git reset --hard origin/main || true
else
  rm -rf ~/MonsterBox
  git clone --depth 1 https://github.com/arwpc/MonsterBox.git ~/MonsterBox
  cd ~/MonsterBox
fi
# Install Node deps (prefer CI; fallback install)
npm ci --omit=dev || npm install --omit=dev || true
# Ensure python wrappers are executable
chmod +x python_wrappers/*.py || true
# If monsterbox service not installed, run setup-monsterbox to create it
if ! systemctl cat monsterbox >/dev/null 2>&1; then
  echo "MonsterBox service missing; running setup-monsterbox.sh to create it"
  bash setup-monsterbox.sh || true
fi
# Fallback: create service file with sudo if still missing (password provided)
if ! systemctl cat monsterbox >/dev/null 2>&1; then
  echo "Creating monsterbox.service via fallback"
  echo "__PASS__" | sudo -S tee /etc/systemd/system/monsterbox.service > /dev/null << EOFUNIT
[Unit]
Description=MonsterBox 4.0 Animatronic Control System
After=network.target mjpg-streamer.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/MonsterBox
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOFUNIT
fi

# Webcam setup (idempotent)
bash scripts/setup-webcam.sh || true
# Ensure and restart MonsterBox service
sudo systemctl daemon-reload || true
sudo systemctl enable monsterbox || true
sudo systemctl restart monsterbox || true
sleep 10
# Basic HTTP checks
echo -n "HOME:"; curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || echo 000; echo
echo -n "WEBCAM_PAGE:"; curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/setup/webcam || echo 000; echo
echo -n "DEVICES:"; curl -sS http://127.0.0.1:3000/setup/webcam/api/video-devices | head -c 300 || true; echo
echo -n "PARTS:"; curl -sS http://127.0.0.1:3000/setup/calibration/api/parts     | head -c 300 || true; echo
if sudo systemctl is-active --quiet mjpg-streamer; then echo "MJPG:active"; else echo "MJPG:inactive"; fi
echo -n "MJPG_HTTP:"; curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8090 || echo 000; echo
# Register goblins on this MonsterBox
curl -sS -X POST http://127.0.0.1:3000/goblin-management/api/register -H "Content-Type: application/json" -d "{\"goblinId\":\"goblin1\",\"name\":\"Goblin 1\",\"endpoint\":\"__GOBLIN1__\",\"platform\":\"raspberry-pi\",\"version\":\"1.0.0\",\"capabilities\":[\"video\",\"audio\"]}" >/dev/null 2>&1 || true
curl -sS -X POST http://127.0.0.1:3000/goblin-management/api/register -H "Content-Type: application/json" -d "{\"goblinId\":\"goblin2\",\"name\":\"Goblin 2\",\"endpoint\":\"__GOBLIN2__\",\"platform\":\"raspberry-pi\",\"version\":\"1.0.0\",\"capabilities\":[\"video\",\"audio\"]}" >/dev/null 2>&1 || true
echo -n "GOBLINS:"; curl -sS http://127.0.0.1:3000/goblin-management/api/goblins | head -c 500 || true; echo
# Conversation WS listener (port 8795)
(ss -tulpn 2>/dev/null | grep 8795 >/dev/null && echo "WS:LISTENING") || echo "WS:UNKNOWN"'

# Use sshpass env mode to avoid password in args list
export SSHPASS="$PASS_WORD"

for entry in "${HOSTS[@]}"; do
  IFS=":" read -r HOST LABEL <<<"$entry"
  echo "==== Deploying to $LABEL ($HOST) ===="
  # Replace goblin endpoints in the script for this run
  RSCRIPT="${REMOTE_SCRIPT/__GOBLIN1__/${GOBLIN1_ENDPOINT}}"
  RSCRIPT="${RSCRIPT/__GOBLIN2__/${GOBLIN2_ENDPOINT}}"
  RSCRIPT="${RSCRIPT/__PASS__/${PASS_WORD}}"

  if ! sshpass -e ssh -o StrictHostKeyChecking=no "${USER_NAME}@${HOST}" "bash -lc '$RSCRIPT'"; then
    echo "WARN: deployment failed on $LABEL ($HOST)" >&2
  fi
  echo "==== Done $LABEL ($HOST) ===="
  echo
done

echo "All deployments attempted. Review the HOME/WEBCAM/MJPG/GOBLINS/WS lines above for each host."

