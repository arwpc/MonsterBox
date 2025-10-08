#!/usr/bin/env bash
# Install/enable a systemd service+timer watchdog for mjpg-streamer
# - Copies scripts/mjpg-streamer-watchdog.sh to /usr/local/bin
# - Creates mjpg-streamer-watchdog.service and .timer
# - Enables and starts the timer
set -euo pipefail

BIN_DEST=/usr/local/bin/mjpg-streamer-watchdog.sh
SERVICE_PATH=/etc/systemd/system/mjpg-streamer-watchdog.service
TIMER_PATH=/etc/systemd/system/mjpg-streamer-watchdog.timer
REPO_DIR=${REPO_DIR:-"$(pwd)"}

copy_script() {
  local src="$REPO_DIR/scripts/mjpg-streamer-watchdog.sh"
  if [[ ! -f "$src" ]]; then
    echo "Watchdog script not found: $src" >&2
    exit 1
  fi
  install -m 0755 "$src" "$BIN_DEST"
}

write_service() {
  cat <<'UNIT' > "$SERVICE_PATH"
[Unit]
Description=mjpg-streamer HTTP watchdog (snapshot check -> restart)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mjpg-streamer-watchdog.sh
# Sandboxing (keep minimal; watchdog needs curl and systemctl)
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false

[Install]
WantedBy=multi-user.target
UNIT
}

write_timer() {
  cat <<'UNIT' > "$TIMER_PATH"
[Unit]
Description=Run mjpg-streamer watchdog periodically

[Timer]
OnBootSec=20s
OnUnitActiveSec=30s
AccuracySec=5s
Unit=mjpg-streamer-watchdog.service

[Install]
WantedBy=timers.target
UNIT
}

main() {
  copy_script
  write_service
  write_timer
  systemctl daemon-reload
  systemctl enable --now mjpg-streamer-watchdog.timer
  systemctl status --no-pager mjpg-streamer-watchdog.timer | sed -n '1,12p' || true
}

main "$@"

