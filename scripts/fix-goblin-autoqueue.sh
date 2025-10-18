#!/usr/bin/env bash
set -euo pipefail

PASS=${PASS:-"klrklr89!"}
IPS=("192.168.8.40" "192.168.8.106" "192.168.8.14")

log(){ echo "[$(date '+%H:%M:%S')] $*"; }

AUTOQ_LOCAL="/tmp/autoqueue.template.sh"
cat > "$AUTOQ_LOCAL" <<'AUTOQ'
#!/bin/bash
set -euo pipefail
PORT="${GOBLIN_PORT:-3001}"
BASE="http://127.0.0.1:${PORT}"
# Wait briefly for API
for i in {1..15}; do
  if curl -sS -m 2 "$BASE/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
# If queue already running, exit success
if curl -sS -m 3 "$BASE/queue" | jq -r '.queue.running' 2>/dev/null | grep -q true; then exit 0; fi
# Build payload and start loop
payload=$(curl -sS -m 5 "$BASE/media" | jq -c '{videos: [.media.video[].filename], mode: "loop"}')
if [ -z "$payload" ] || ! echo "$payload" | grep -q '"videos"'; then exit 1; fi
curl -sS -m 8 -X POST "$BASE/queue/start" -H 'Content-Type: application/json' --data-binary "$payload" >/dev/null 2>&1 || true
# Verify running
curl -sS -m 3 "$BASE/queue" | jq -r '.queue.running' 2>/dev/null | grep -q true
AUTOQ

for ip in "${IPS[@]}"; do
  log "=== $ip ==="
  # Ensure dirs
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=6 remote@"$ip" 'mkdir -p /home/remote/goblin/{logs,src,bin}' || { log "SSH to $ip failed"; continue; }
  # Copy autoqueue and unit
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no "$AUTOQ_LOCAL" remote@"$ip":/home/remote/goblin/bin/autoqueue.sh >/dev/null
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no remote@"$ip" 'chmod +x /home/remote/goblin/bin/autoqueue.sh'
  # Unit file
  UNIT_LOCAL="/tmp/goblin-autoqueue.$ip.service"
  cat > "$UNIT_LOCAL" <<'UNIT'
[Unit]
Description=Goblin Auto-Queue Starter
After=goblin.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=remote
WorkingDirectory=/home/remote/goblin
ExecStart=/bin/bash /home/remote/goblin/bin/autoqueue.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no "$UNIT_LOCAL" remote@"$ip":/tmp/goblin-autoqueue.service >/dev/null
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no remote@"$ip" "echo '$PASS' | sudo -S tee /etc/systemd/system/goblin-autoqueue.service >/dev/null < /tmp/goblin-autoqueue.service && sudo systemctl daemon-reload && sudo systemctl enable goblin-autoqueue && sudo systemctl start goblin-autoqueue || true"
  # Fire now regardless (idempotent)
  curl -sS --max-time 5 http://"$ip":3001/media | jq -c '{videos: [.media.video[].filename], mode: "loop"}' | curl -sS --max-time 5 -X POST http://"$ip":3001/queue/start -H 'Content-Type: application/json' --data-binary @- >/dev/null 2>&1 || true
  # Report
  curl -sS --max-time 5 http://"$ip":3001/queue | jq -c '{running:.queue.running, mode:.queue.mode, len:.queue.queueLength}' 2>/dev/null || echo '{"status":"unreachable"}'
done

