#!/usr/bin/env bash
set -euo pipefail

# MonsterBox Pi4B performance hardening (safe defaults)
# - Requires sudo
# - Idempotent; backs up files before changes

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must run as root; re-exec with sudo..."
  exec sudo -E bash "$0" "$@"
fi

log() { echo "[optimize] $*"; }
backup_file() { local f="$1"; [[ -f "$f" ]] && cp -a "$f" "$f.bak.$(date +%Y%m%d-%H%M%S)" || true; }

log "Starting MonsterBox optimization on $(hostname)"

# 1) CPU governor to performance (all cores)
for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
  [[ -e "$gov" ]] || continue
  cur=$(cat "$gov" 2>/dev/null || echo "")
  if [[ "$cur" != "performance" ]]; then
    echo performance > "$gov" || true
  fi
done
log "CPU governors set to performance (where supported)."

# 2) sysctl tuning (safe minimal)
mkdir -p /etc/sysctl.d
SYSCTL_FILE="/etc/sysctl.d/99-monsterbox-tuning.conf"
backup_file "$SYSCTL_FILE"
cat > "$SYSCTL_FILE" <<'EOF'
# MonsterBox tuning (safe minimal)
vm.swappiness = 10
vm.dirty_background_ratio = 5
vm.dirty_ratio = 20
fs.inotify.max_user_watches = 524288
EOF
/sbin/sysctl --system >/dev/null 2>&1 || sysctl --system >/dev/null 2>&1 || true
log "Applied sysctl tuning."

# 3) Prioritize services: monsterbox and mjpg-streamer
prioritize_service() {
  local svc="$1"
  local dir="/etc/systemd/system/${svc}.service.d"
  mkdir -p "$dir"
  local drop="$dir/10-priority.conf"
  backup_file "$drop"
  cat > "$drop" <<EOF
[Service]
Nice=-5
CPUWeight=90
IOWeight=90
# Avoid aggressive restart loops; but restart on failure
Restart=on-failure
RestartSec=2
EOF
}

prioritize_service "monsterbox"
prioritize_service "mjpg-streamer"

systemctl daemon-reload || true
systemctl restart mjpg-streamer 2>/dev/null || true
systemctl restart monsterbox 2>/dev/null || true
log "Applied priority overrides (Nice/CPUWeight/IOWeight)."

# 4) Disable unused services if present (safe subset)
disable_if_present() {
  local svc="$1"
  if systemctl list-unit-files | grep -q "^${svc}\.service"; then
    systemctl disable --now "$svc" || true
    log "Disabled $svc"
  fi
}

disable_if_present "bluetooth"
disable_if_present "avahi-daemon"
# Uncomment if clearly unused in your setup
# disable_if_present "cups"

# 5) GPU memory hint (only logs guidance)
if command -v vcgencmd >/dev/null 2>&1; then
  gm=$(vcgencmd get_mem gpu 2>/dev/null || true)
  log "Current GPU mem: ${gm:-unknown}. If headless, 64M is often ok; with compositing, 128M+."
fi

# 6) mjpg-streamer flag guidance (do not override here; handled via API)
log "mjpg-streamer tuning happens via API (apply-device). Keep 640x480@24-30fps, quality ~80-85 for low latency."

# 7) Print service statuses
systemctl is-active mjpg-streamer >/dev/null 2>&1 && systemctl status mjpg-streamer --no-pager | sed -n '1,12p' || true
systemctl is-active monsterbox >/dev/null 2>&1 && systemctl status monsterbox --no-pager | sed -n '1,12p' || true

log "Optimization complete."
