#!/usr/bin/env bash
set -euo pipefail

# Run emergency recovery on all animatronics via SSH (uses same creds as start-all-loops.sh)

PASSWORD='klrklr89!'
REMOTE_USER='remote'

HOSTS=(
  'coffin'
  'skulltalker'
  'groundbreaker'
  'pumpkinhead'
)

run_remote(){
  local host="$1"
  echo "=== $host ==="
  # If the script exists on remote, run it; else copy a small inline recovery helper and run it
  if sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${host} 'test -f ~/MonsterBox/scripts/emergency-recover.sh'; then
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${host} 'bash -lc "cd ~/MonsterBox && bash scripts/emergency-recover.sh"'
  else
    TMPFILE="/tmp/mb_inline_recover.sh"
    cat > /tmp/mb_inline_recover.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd ~/MonsterBox || exit 0
pkill -f "node server.js" >/dev/null 2>&1 || true
unset MB_TEST_MODE || true
export MONSTERBOX_HARDWARE_AVAILABLE=1
mkdir -p logs
nohup node server.js > logs/server.log 2>&1 &
PID=$!
echo "Server PID: $PID (logs/server.log)"
HEALTH_OK=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -sf http://localhost:3000/health >/dev/null; then HEALTH_OK=1; break; fi
  sleep 1
done
if [ "$HEALTH_OK" = 1 ]; then echo "(fallback) /health OK"; else echo "(fallback) /health FAILED"; fi
if command -v wpctl >/dev/null 2>&1; then wpctl set-volume @DEFAULT_AUDIO_SINK@ 70% || true; fi
if command -v python3 >/dev/null 2>&1; then python3 python_wrappers/servo_cli.py move_to_pca 4 90 || true; fi
echo "(fallback) recovery finished"
EOF
    chmod +x /tmp/mb_inline_recover.sh
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no /tmp/mb_inline_recover.sh ${REMOTE_USER}@${host}:${TMPFILE}
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${host} "bash ${TMPFILE} && rm -f ${TMPFILE}"
    rm -f /tmp/mb_inline_recover.sh || true
  fi
}

echo "=== Local (this box) ==="
bash -lc "cd $(pwd) && bash scripts/emergency-recover.sh"

for h in "${HOSTS[@]}"; do
  run_remote "$h" || echo "($h) recovery encountered issues"
done

echo "All recovery runs attempted. Check logs on each host: ~/MonsterBox/logs/server.log"
