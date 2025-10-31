#!/usr/bin/env bash
set -euo pipefail

# Daemonized MonsterBox start with real hardware enabled
# - Unsets MB_TEST_MODE to avoid simulated hardware
# - Exports MONSTERBOX_HARDWARE_AVAILABLE=1 so servos/actuators run for real
# - Starts node server.js in background and logs to logs/server.log

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

mkdir -p logs

# Kill any existing server
if pgrep -f "node server.js" >/dev/null 2>&1; then
  echo "Killing existing MonsterBox server..."
  pkill -f "node server.js" || true
  sleep 0.5
fi

# Ensure env
unset MB_TEST_MODE || true
export MONSTERBOX_HARDWARE_AVAILABLE=1

echo "Starting MonsterBox server (daemonized) with real hardware enabled..."
nohup node server.js > logs/server.log 2>&1 &
PID=$!
echo "$PID" > logs/server.pid
echo "Server PID: $PID (logs: logs/server.log)"

exit 0
