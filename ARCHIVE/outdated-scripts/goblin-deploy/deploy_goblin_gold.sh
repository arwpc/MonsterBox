#!/bin/bash
# Deploy Goblin Gold to a target Goblin host.
# Supports SSH keys by default; add --password to use sshpass.
set -euo pipefail

usage() {
  echo "Usage: $0 <goblin-ip> [goblin-name] [--password <pass>]" >&2
}

if [ $# -lt 1 ]; then
  usage; exit 1
fi

GOBLIN_IP="$1"; shift || true
GOBLIN_NAME="${1:-goblin}"; [ $# -ge 1 ] && shift || true
SSH_PASS=""

# Parse optional --password
while [ $# -gt 0 ]; do
  case "$1" in
    --password)
      SSH_PASS="$2"; shift 2;;
    *) shift;;
  esac
done

LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$LOCAL_ROOT/goblin"
TMP_TAR="/tmp/goblin.tar.gz"

if [ ! -d "$PKG_DIR" ]; then
  echo "Missing $PKG_DIR" >&2
  exit 1
fi

# Build package tarball
rm -f "$TMP_TAR"
(
  cd "$PKG_DIR"
  tar czf "$TMP_TAR" \
    server.js \
    package.json \
    goblin-setup.sh \
    goblin-autostart.sh \
    systemd/goblin.service \
    src
)

# Upload
if [ -n "$SSH_PASS" ]; then
  command -v sshpass >/dev/null 2>&1 || { echo "sshpass is required for password auth" >&2; exit 1; }
  echo "Uploading package (password auth) to $GOBLIN_IP..."
  sshpass -p "$SSH_PASS" scp -q "$TMP_TAR" remote@"$GOBLIN_IP":/home/remote/goblin.tar.gz
else
  echo "Uploading package (key auth) to $GOBLIN_IP..."
  scp -q "$TMP_TAR" remote@"$GOBLIN_IP":/home/remote/goblin.tar.gz
fi

# Remote install script
read -r -d '' REMOTE_SCRIPT <<'EOSH'
set -euo pipefail

# Stop old services/processes
sudo systemctl stop goblin 2>/dev/null || true
sudo systemctl stop monsterbox-goblin 2>/dev/null || true
sudo pkill -9 node 2>/dev/null || true
sudo pkill -9 mpv 2>/dev/null || true

# Ensure base dirs
rm -rf /home/remote/goblin
mkdir -p /home/remote/goblin
cd /home/remote/goblin

tar xzf ../goblin.tar.gz
mkdir -p media/video logs

# Ensure dependencies via apt (mpv, nodejs, npm, jq, lsof)
sudo apt-get update -y
sudo apt-get install -y mpv nodejs npm jq lsof ffmpeg

# Install Node dependencies (Express only)
npm install --production express

# Generate a 5s test video if none exist yet
if [ -z "$(ls -A media/video 2>/dev/null)" ]; then
  echo "Generating test video..."
  ffmpeg -y -f lavfi -i testsrc2=size=1920x1080:rate=30 -t 5 -pix_fmt yuv420p media/video/test.mp4 < /dev/null
fi

# Install setup and autostart scripts
sudo cp goblin-setup.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/goblin-setup.sh
sudo cp goblin-autostart.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/goblin-autostart.sh

# Install and enable systemd unit
sudo cp systemd/goblin.service /etc/systemd/system/goblin.service
sudo systemctl daemon-reload
sudo systemctl enable goblin
sudo systemctl restart goblin

# Health check
sleep 1
curl -sS http://127.0.0.1:3001/health || true
EOSH

# Execute remote script
if [ -n "$SSH_PASS" ]; then
  sshpass -p "$SSH_PASS" ssh -tt remote@"$GOBLIN_IP" bash -lc "$REMOTE_SCRIPT"
else
  ssh -tt remote@"$GOBLIN_IP" bash -lc "$REMOTE_SCRIPT"
fi

echo "Deployment to $GOBLIN_NAME ($GOBLIN_IP) complete."

