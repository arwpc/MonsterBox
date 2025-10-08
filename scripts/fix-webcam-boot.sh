#!/usr/bin/env bash
# Fix webcam service boot failure across all MonsterNet animatronics
# Root cause: mjpg-streamer starts before USB camera device is ready
# Solution: Update systemd service to wait for /dev/video0 device

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="${SCRIPT_DIR}/mjpg-streamer.service"

# MonsterNet animatronics
ANIMATRONICS=(
    "orlok"
    "groundbreaker"
    "pumpkinhead"
    "goblin1"
    "goblin2"
    "goblin3"
)

SSH_USER="remote"
SSH_PASS="klrklr89!"

echo "========================================="
echo "Webcam Boot Fix Deployment"
echo "========================================="
echo ""
echo "This will update mjpg-streamer.service on all animatronics"
echo "to fix the boot failure issue."
echo ""

if [[ ! -f "${SERVICE_FILE}" ]]; then
    echo "ERROR: Service file not found: ${SERVICE_FILE}"
    exit 1
fi

echo "Service file to deploy:"
echo "---"
cat "${SERVICE_FILE}"
echo "---"
echo ""

for host in "${ANIMATRONICS[@]}"; do
    echo "========================================="
    echo "Deploying to: ${host}"
    echo "========================================="
    
    # Copy service file
    echo "→ Copying service file..."
    sshpass -p "${SSH_PASS}" scp -o StrictHostKeyChecking=no \
        "${SERVICE_FILE}" \
        "${SSH_USER}@${host}:/tmp/mjpg-streamer.service" || {
        echo "✗ Failed to copy service file to ${host}"
        continue
    }
    
    # Install and reload
    echo "→ Installing service..."
    sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no \
        "${SSH_USER}@${host}" \
        'sudo mv /tmp/mjpg-streamer.service /etc/systemd/system/mjpg-streamer.service && \
         sudo chmod 644 /etc/systemd/system/mjpg-streamer.service && \
         sudo systemctl daemon-reload && \
         sudo systemctl restart mjpg-streamer.service && \
         sudo systemctl status mjpg-streamer.service --no-pager -l' || {
        echo "✗ Failed to install service on ${host}"
        continue
    }
    
    echo "✓ Successfully deployed to ${host}"
    echo ""
done

echo "========================================="
echo "Deployment Complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Test by rebooting one animatronic"
echo "2. Verify webcam starts automatically"
echo "3. Check with: systemctl status mjpg-streamer.service"
echo ""

