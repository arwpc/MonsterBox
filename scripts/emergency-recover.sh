#!/usr/bin/env bash
set -euo pipefail

# Emergency recovery: start server in background with real hardware, verify health,
# set audio volume, and test one PCA9685 servo channel.

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok(){ echo -e "${GREEN}✅ $*${NC}"; }
warn(){ echo -e "${YELLOW}⚠️  $*${NC}"; }
err(){ echo -e "${RED}❌ $*${NC}"; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

mkdir -p logs

echo "--- Killing any existing server ---"
pkill -f "node server.js" >/dev/null 2>&1 || true
sleep 0.3

echo "--- Ensuring env (real hardware) ---"
unset MB_TEST_MODE || true
export MONSTERBOX_HARDWARE_AVAILABLE=1

if [ ! -d node_modules ]; then
  warn "node_modules missing; running npm ci (first run)"
  npm ci
fi

echo "--- Starting server (daemon) ---"
"$ROOT_DIR/scripts/start-monsterbox-daemon.sh"

echo "--- Waiting for /health ---"
HEALTH_OK=0
for i in {1..15}; do
  if curl -sf http://localhost:3000/health >/dev/null; then HEALTH_OK=1; break; fi
  sleep 1
done
if [ "$HEALTH_OK" = 1 ]; then ok "/health OK"; else err "Server health check failed"; fi

echo "--- Audio: set default sink volume (70%) ---"
if command -v wpctl >/dev/null 2>&1; then
  wpctl set-volume @DEFAULT_AUDIO_SINK@ 70% || warn "Failed to set sink volume"
  ok "Audio volume set"
else
  warn "wpctl not found; skipping audio volume"
fi

echo "--- Finding a PCA9685 servo channel ---"
SERVO_EXPORTS=$(node "$ROOT_DIR/scripts/find-test-servo.js" 2>/dev/null || true)
if [ -n "$SERVO_EXPORTS" ]; then
  eval "$SERVO_EXPORTS"
else
  TEST_SERVO_CHANNEL=0
fi
echo "Using channel: ${TEST_SERVO_CHANNEL:-0} ${TEST_PCA_ADDRESS:+address=$TEST_PCA_ADDRESS}"

echo "--- Testing servo movement (90°) ---"
if [ -x /usr/bin/python3 ] || command -v python3 >/dev/null 2>&1; then
  set +e
  if [ -n "${TEST_PCA_ADDRESS:-}" ]; then
    python3 "$ROOT_DIR/python_wrappers/servo_cli.py" move_to_pca "$TEST_SERVO_CHANNEL" 90 "$TEST_PCA_ADDRESS"
  else
    python3 "$ROOT_DIR/python_wrappers/servo_cli.py" move_to_pca "$TEST_SERVO_CHANNEL" 90
  fi
  PYRC=$?
  set -e
  if [ $PYRC -eq 0 ]; then ok "Servo command dispatched (watch for physical movement)"; else warn "Servo CLI returned non-zero ($PYRC)"; fi
else
  warn "python3 not found; skipping servo test"
fi

echo "--- Optional: test audio playback ---"
if [ -f "$ROOT_DIR/data/audio-library/character-templates/hello.wav" ]; then
  set +e
  python3 "$ROOT_DIR/python_wrappers/speaker_cli.py" play "$ROOT_DIR/data/audio-library/character-templates/hello.wav" 70
  AURC=$?
  set -e
  if [ $AURC -eq 0 ]; then ok "Audio test dispatched (listen for playback)"; else warn "Audio test failed ($AURC)"; fi
else
  warn "hello.wav not found; skipping audio test"
fi

echo "--- Summary ---"
if [ "$HEALTH_OK" = 1 ]; then ok "Server healthy"; else err "Server health NOT OK"; fi
ok "Env: MONSTERBOX_HARDWARE_AVAILABLE=${MONSTERBOX_HARDWARE_AVAILABLE:-} MB_TEST_MODE=${MB_TEST_MODE:-}"
ok "Logs: $ROOT_DIR/logs/server.log"

exit 0
