#!/bin/bash
# Auto-harden Goblins: ensure reliable service config, deploy latest core files, and start loop queue
# Retries until all targets are hardened. Logs to logs/goblin-hardening.log

set -euo pipefail

LOG_FILE="logs/goblin-hardening.log"
mkdir -p "$(dirname "$LOG_FILE")"
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Targets: ip:id
TARGETS=(
  "192.168.8.40:goblin-one"
  "192.168.8.106:goblin-two"
  "192.168.8.14:goblin-three"
)

PASS="klrklr89!"
MONSTERBOX_URL="http://192.168.8.140:3000"

# Hardened markers
STATE_DIR=".harden-state"
mkdir -p "$STATE_DIR"

build_service(){
  local gid="$1"
  cat <<SERVICE
[Unit]
Description=MonsterBox Goblin Media Player
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/goblin
Environment="GOBLIN_ID=$gid"
Environment="GOBLIN_PORT=3001"
Environment="NODE_ENV=production"
Environment="MONSTERBOX_URL=$MONSTERBOX_URL"

# Pre-start cleanup to avoid stale processes locking display
ExecStartPre=/usr/bin/pkill -f ffplay || true
ExecStartPre=/usr/bin/pkill -f 'node .*goblin/src/server.js' || true

ExecStart=/usr/bin/node /home/remote/goblin/src/server.js

Restart=always
RestartSec=5
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=control-group

LimitNOFILE=65536
LimitNPROC=4096

StandardOutput=append:/home/remote/goblin/logs/goblin.log
StandardError=append:/home/remote/goblin/logs/goblin-error.log
SyslogIdentifier=goblin

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE
}

harden_one(){
  local ip="$1"; local gid="$2"; local marker="$STATE_DIR/$ip.done"
  if [[ -f "$marker" ]]; then return 0; fi

  log "🔎 Checking $gid ($ip)"

  # Quick SSH probe (3s)
  if ! sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 -o BatchMode=no remote@$ip 'echo ok' >/dev/null 2>&1; then
    log "  ❌ SSH not ready yet"
    return 1
  fi

  # Best-effort: tell app to stop queue/stop-video to avoid mid-frame locks
  curl -sS -m 2 -X POST http://$ip:3001/queue/stop >/dev/null 2>&1 || true
  curl -sS -m 2 -X POST http://$ip:3001/stop-video >/dev/null 2>&1 || true

  log "  🔧 Stopping service and cleaning stale processes"
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no remote@$ip "\
    echo '$PASS' | sudo -S systemctl stop goblin 2>/dev/null || true; \
    pkill -f 'ffplay' 2>/dev/null || true; \
    pkill -f 'node .*goblin/src/server.js' 2>/dev/null || true; \
    mkdir -p /home/remote/goblin/logs /home/remote/goblin/src /home/remote/goblin/bin \
  "

  log "  📦 Deploying core files (server.js, videoQueue.js, mediaPlayer.js)"
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no goblin-system/src/server.js      remote@$ip:/home/remote/goblin/src/ >/dev/null
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no goblin-system/src/videoQueue.js  remote@$ip:/home/remote/goblin/src/ >/dev/null
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no goblin-system/src/mediaPlayer.js remote@$ip:/home/remote/goblin/src/ >/dev/null

  log "  🛡  Installing hardened systemd service"
  build_service "$gid" > /tmp/goblin.$ip.service
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no /tmp/goblin.$ip.service remote@$ip:/tmp/goblin.service >/dev/null
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no remote@$ip "\
    echo '$PASS' | sudo -S tee /etc/systemd/system/goblin.service >/dev/null < /tmp/goblin.service; \
    sudo systemctl daemon-reload; \
    sudo systemctl enable goblin; \
    sudo systemctl restart goblin; \
    sleep 2; \
    systemctl is-active goblin || echo inactive \
  "


  # Install auto-queue oneshot to ensure video starts after boot if no saved state
  log "  🧩 Installing goblin-autoqueue (boot-time queue starter)"
  cat > /tmp/autoqueue.$ip.sh <<'AUTOQ'
#!/bin/bash
set -euo pipefail
PORT="${GOBLIN_PORT:-3001}"
BASE="http://127.0.0.1:${PORT}"
# If queue already running, exit success
if curl -sS -m 3 "$BASE/queue" | jq -r '.queue.running' 2>/dev/null | grep -q true; then
  exit 0
fi
# Build payload from available media and start loop queue
payload=$(curl -sS -m 5 "$BASE/media" | jq -c '{videos: [.media.video[].filename], mode: "loop"}')
if [ -z "$payload" ] || ! echo "$payload" | grep -q '"videos"'; then
  echo "No media found or payload build failed" >&2
  exit 1
fi
curl -sS -m 8 -X POST "$BASE/queue/start" -H 'Content-Type: application/json' --data-binary "$payload" >/dev/null 2>&1 || true
# Verify running
if curl -sS -m 3 "$BASE/queue" | jq -r '.queue.running' 2>/dev/null | grep -q true; then
  exit 0
fi
exit 1
AUTOQ
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no /tmp/autoqueue.$ip.sh remote@$ip:/home/remote/goblin/bin/autoqueue.sh >/dev/null || true
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no remote@$ip "chmod +x /home/remote/goblin/bin/autoqueue.sh"

  cat > /tmp/goblin-autoqueue.$ip.service <<'UNIT'
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
  sshpass -p "$PASS" scp -o StrictHostKeyChecking=no /tmp/goblin-autoqueue.$ip.service remote@$ip:/tmp/goblin-autoqueue.service >/dev/null
  sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no remote@$ip "\
    echo '$PASS' | sudo -S tee /etc/systemd/system/goblin-autoqueue.service >/dev/null < /tmp/goblin-autoqueue.service; \
    sudo systemctl daemon-reload; \
    sudo systemctl enable goblin-autoqueue; \
    sudo systemctl start goblin-autoqueue || true \
  "

  # Verify health endpoint becomes responsive
  if curl -sS -m 5 http://$ip:3001/health >/dev/null 2>&1; then
    log "  ✅ Health responding"
  else
    log "  ⚠️  Health not responding yet"
  fi

  # Start loop queue of all local videos
  log "  ▶️  Starting loop queue with all local videos"
  curl -sS -m 5 http://$ip:3001/media \
    | jq -c '{videos: [.media.video[].filename], mode: "loop"}' \
    | curl -sS -m 5 -X POST http://$ip:3001/queue/start -H 'Content-Type: application/json' --data-binary @- >/dev/null 2>&1 || true

  # Final check
  if curl -sS -m 5 http://$ip:3001/queue | jq -r '.running' 2>/dev/null | grep -q true; then
    log "  ✅ Queue running in loop mode"
  else
    log "  ⚠️  Queue status not confirmed"
  fi

  touch "$marker"
  log "  🎉 Hardened: $gid ($ip)"
}

log "🚀 Auto-hardening started"
while true; do
  all_done=true
  for ent in "${TARGETS[@]}"; do
    ip="${ent%%:*}"; gid="${ent##*:}"
    if ! [[ -f "$STATE_DIR/$ip.done" ]]; then
      all_done=false
      harden_one "$ip" "$gid" || true
    fi
  done
  if $all_done; then
    log "✅ All Goblins hardened"
    exit 0
  fi
  sleep 15
done

