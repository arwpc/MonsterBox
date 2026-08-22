#!/bin/bash
#
# MonsterBox liveness watchdog (UP-5).
#
# server.js swallows every uncaughtException/unhandledRejection by design, and
# the 10-priority.conf drop-in downgrades Restart= to on-failure — so a process
# that is wedged (event loop blocked, state corrupted) stays "active (running)"
# forever while every health endpoint times out, and nothing recovers the show
# until a human SSHes in. systemd's own WatchdogSec+sd_notify cannot be used
# here: MainPID is the npm wrapper, not node, and sd_notify would need a new
# dependency (CLAUDE.md forbids one).
#
# Instead a systemd timer runs this script every minute (as root — it must be
# able to restart the service). It curls /health and restarts
# monsterbox.service only after MB_WATCHDOG_THRESHOLD consecutive failures, so
# a single slow request or one dropped check never bounces a live show.
#
# The failure counter lives under /run (tmpfs): no SD-card writes, and the
# counter naturally resets on boot. A deliberate `systemctl stop monsterbox`
# also resets it and is never overridden — the watchdog only ever restarts a
# service that is supposed to be running.
#
# Startup grace comes from the timer (OnBootSec) plus the threshold itself:
# after a restart the counter starts at 0, so the app has
# THRESHOLD × timer-interval (default 3 minutes) to begin serving before the
# watchdog would act again.

set -u

SERVICE="${MB_WATCHDOG_SERVICE:-monsterbox.service}"
STATE_FILE="${MB_WATCHDOG_STATE_FILE:-/run/monsterbox-watchdog/failures}"
THRESHOLD="${MB_WATCHDOG_THRESHOLD:-3}"
CURL_TIMEOUT="${MB_WATCHDOG_CURL_TIMEOUT:-10}"
# Production serves HTTPS on 3000 (self-signed, hence -k); a dev/HTTP node
# answers the same path over plain HTTP. Probing the SHOW port is the point:
# the loopback test listener on 3100 shares the same event loop, but 3000 is
# what the operator and the fleet actually depend on.
HEALTH_URLS="${MB_WATCHDOG_URLS:-https://127.0.0.1:3000/health http://127.0.0.1:3000/health}"

log() {
    # Runs as a systemd oneshot: stdout/stderr land in the journal.
    echo "[monsterbox-watchdog] $1"
}

read_failures() {
    local n
    n="$(cat "$STATE_FILE" 2>/dev/null || echo 0)"
    case "$n" in
        ''|*[!0-9]*) n=0 ;;
    esac
    echo "$n"
}

write_failures() {
    mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null
    echo "$1" > "$STATE_FILE" 2>/dev/null
}

# Never resurrect a service the operator stopped (or that is mid-start):
# only an "active" service is watched.
if ! systemctl is-active --quiet "$SERVICE"; then
    write_failures 0
    exit 0
fi

healthy=0
for url in $HEALTH_URLS; do
    if curl -skf --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null | grep -q '"status"'; then
        healthy=1
        break
    fi
done

if [ "$healthy" = "1" ]; then
    write_failures 0
    exit 0
fi

failures=$(( $(read_failures) + 1 ))

if [ "$failures" -ge "$THRESHOLD" ]; then
    log "/health unreachable ${failures} consecutive times (service still active) — restarting ${SERVICE}"
    write_failures 0
    systemctl restart "$SERVICE"
    log "restart of ${SERVICE} issued"
else
    log "/health check failed (${failures}/${THRESHOLD}) — will restart ${SERVICE} at ${THRESHOLD}"
    write_failures "$failures"
fi

exit 0
