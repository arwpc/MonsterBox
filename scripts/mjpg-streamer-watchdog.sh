#!/usr/bin/env bash
# mjpg-streamer watchdog
# Periodically checks the local mjpg-streamer snapshot endpoint and restarts the
# mjpg-streamer service if multiple consecutive checks fail. Designed to be run
# by a systemd timer.
set -euo pipefail

URL=${URL:-"http://127.0.0.1:8090/?action=snapshot"}
RETRIES=${RETRIES:-3}           # attempts per run
TIMEOUT=${TIMEOUT:-3}           # curl timeout seconds per attempt
SLEEP_BETWEEN=${SLEEP_BETWEEN:-2}
FAIL_THRESHOLD=${FAIL_THRESHOLD:-3}  # consecutive failed runs before restart
SERVICE_NAME=${SERVICE_NAME:-"mjpg-streamer.service"}
STATE_DIR=${STATE_DIR:-"/run/mjpg-watchdog"}
LOG_TAG=${LOG_TAG:-"mjpg-streamer-watchdog"}

mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/failcount"
: > "$STATE_DIR/.ok" # ensure dir exists and is writable

read_failcount() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE"
  else
    echo 0
  fi
}

write_failcount() {
  echo "$1" > "$STATE_FILE"
}

log() {
  logger -t "$LOG_TAG" -- "$*" || echo "[$LOG_TAG] $*"
}

http_ok() {
  # Return 0 if endpoint returns HTTP 200 and non-empty body
  # HEAD responses on some builds omit useful info; use GET and check size
  local code body_size
  code=$(curl -sS -m "$TIMEOUT" -o /tmp/mjpg-snap.$$ -w '%{http_code}' "$URL" || echo "000")
  body_size=$(wc -c </tmp/mjpg-snap.$$ 2>/dev/null || echo 0)
  rm -f /tmp/mjpg-snap.$$
  if [[ "$code" == "200" && "$body_size" -gt 100 ]]; then
    return 0
  fi
  return 1
}

# Perform attempts in this run
attempt_ok=false
for ((i=1; i<=RETRIES; i++)); do
  if http_ok; then
    attempt_ok=true
    break
  fi
  sleep "$SLEEP_BETWEEN" || true
done

failcount=$(read_failcount)
if $attempt_ok; then
  if [[ "$failcount" -ne 0 ]]; then
    log "Snapshot OK. Resetting failcount from $failcount to 0."
  fi
  write_failcount 0
  exit 0
fi

# Attempts failed; increment failcount
failcount=$((failcount + 1))
write_failcount "$failcount"
log "Snapshot check failed (URL=$URL). Consecutive failed runs: $failcount/$FAIL_THRESHOLD"

if [[ "$failcount" -ge "$FAIL_THRESHOLD" ]]; then
  log "Restart threshold reached. Restarting $SERVICE_NAME"
  # Best-effort restart; don't fail the watchdog if restart fails
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl restart "$SERVICE_NAME" || log "Failed to restart $SERVICE_NAME"
  else
    systemctl start "$SERVICE_NAME" || log "Failed to start $SERVICE_NAME"
  fi
  write_failcount 0
fi

exit 0

