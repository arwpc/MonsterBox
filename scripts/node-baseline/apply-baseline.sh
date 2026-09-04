#!/usr/bin/env bash
# Node OS baseline — the settings every animatronic needs and no deploy carries.
#
# A fleet deploy rsyncs the repo; it cannot touch /etc. So a node that was hand-built,
# reimaged, or installed before a baseline item existed drifts silently: the 2026-09-04
# audit found PumpkinHead with a 2.3 GB journal on its SD card, no log rotation, no
# service drop-ins, and an avahi file owned by root that the app could not rewrite, and
# Wi-Fi power-save ON on five of six nodes (10-100 ms of radio doze on every first packet).
# Each item below is the fix for a real outage or a real slowdown; comments say which.
#
# Idempotent: every item reports [changed] or [ok] and converges to one known state.
# The service drop-ins are the exception — they are written only when MISSING, because
# operators have tuned Restart= in 10-priority.conf by hand on several nodes.
#
# Usage (as root, on the node):
#   sudo bash scripts/node-baseline/apply-baseline.sh [service-user]   # default: remote
# Fleet-wide from the node holding SSH trust (the script is self-contained on purpose —
# piped over ssh it has no repo beside it):
#   for ip in 192.168.8.150 192.168.8.140 192.168.8.130 192.168.8.200 192.168.8.224; do
#     ssh remote@$ip 'sudo bash -s' < scripts/node-baseline/apply-baseline.sh; done
#
# install.sh runs this as Step 19b; keep the two in step by editing only this file.
set -uo pipefail

# Test hook: with MB_BASELINE_PREFIX=/some/dir every /etc and /var path is written
# under that directory, the root check is skipped, and nothing is restarted or
# reloaded — tests/unit/node-baseline-script.test.js proves the file contents and
# the idempotence without root. Unset in real use.
P="${MB_BASELINE_PREFIX:-}"

if [ -z "$P" ] && [ "$(id -u)" -ne 0 ]; then
  echo "run as root: sudo bash $0 [service-user]" >&2
  exit 1
fi

SVC_USER="${1:-${SUDO_USER:-remote}}"
[ "$SVC_USER" = "root" ] && SVC_USER="remote"
[ -n "$P" ] && SVC_USER="$(id -un)"
REPO_DIR="${MB_REPO_DIR:-/home/$SVC_USER/MonsterBox}"
HOST="$(hostname)"
CHANGES=0
NEEDS_SERVICE_RESTART=0

changed() { CHANGES=$((CHANGES + 1)); printf '  [changed] %s\n' "$*"; }
ok()      { printf '  [ok]      %s\n' "$*"; }
# System side effects (restarts, reloads, radio) — skipped under the test prefix.
sys()     { if [ -z "$P" ]; then "$@"; fi; }

# Write $2 to file $1 only when the content differs. Returns 0 when it wrote.
write_if_different() {
  local file="$1" content="$2"
  if [ -f "$file" ] && [ "$(cat "$file")" = "$content" ]; then
    return 1
  fi
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$content" > "$file"
  return 0
}

echo "== node baseline on $HOST (service user: $SVC_USER)"

# 1. avahi service file writable by the app. The server rewrites its own
#    _monsterbox._tcp advertisement at startup; root-owned, that write fails with
#    EACCES and the node is discoverable only through the static roster.
mkdir -p "$P/etc/avahi/services"
touch "$P/etc/avahi/services/monsterbox.service"
if [ "$(stat -c %U "$P/etc/avahi/services/monsterbox.service")" != "$SVC_USER" ]; then
  chown "$SVC_USER:$SVC_USER" "$P/etc/avahi/services/monsterbox.service"
  changed "avahi: /etc/avahi/services/monsterbox.service now owned by $SVC_USER"
  # Advertise right away instead of waiting for the next service restart.
  if [ -z "$P" ] && [ -f "$REPO_DIR/scripts/advertise-node.mjs" ] && command -v node >/dev/null 2>&1; then
    (cd "$REPO_DIR" && sudo -u "$SVC_USER" node scripts/advertise-node.mjs >/dev/null 2>&1) \
      && ok "avahi: re-advertised from $REPO_DIR" \
      || echo "  [note]    avahi: re-advertise failed (the app will on its next start)"
  fi
else
  ok "avahi: service file owned by $SVC_USER"
fi

# 2. journald: persistent (post-mortem after a power cut) but capped (SD wear).
#    SystemMaxUse alone does NOT hold — the cap is enforced per file, so without a
#    SystemMaxFileSize well under it the journal grows past the cap anyway.
JOURNAL_CONF='[Journal]
Storage=persistent
SystemMaxUse=64M
SystemMaxFileSize=16M
MaxRetentionSec=30day'
mkdir -p "$P/var/log/journal"
if write_if_different "$P/etc/systemd/journald.conf.d/monsterbox.conf" "$JOURNAL_CONF"; then
  sys systemctl restart systemd-journald 2>/dev/null || true
  changed "journald: capped at 64M (16M files, 30 days) and restarted"
else
  ok "journald: cap in place"
fi
# Reclaim now rather than at the next rotation — a 2.3 GB journal was found on one node.
USAGE_BYTES="$(du -sb "$P/var/log/journal" 2>/dev/null | cut -f1)"
if [ -n "${USAGE_BYTES:-}" ] && [ "$USAGE_BYTES" -gt $((80 * 1024 * 1024)) ]; then
  sys journalctl --vacuum-size=64M >/dev/null 2>&1 || true
  changed "journald: vacuumed $((USAGE_BYTES / 1024 / 1024)) MB down to the cap"
fi

# 3. App log rotation. /var/log/monsterbox.log and .err are appended by systemd and
#    grow without bound otherwise (28 MB found on one node, 8.5 MB in one night on another).
LOGROTATE_CONF='/var/log/monsterbox.log /var/log/monsterbox.err {
    size 10M
    rotate 5
    compress
    missingok
    notifempty
    copytruncate
}'
if write_if_different "$P/etc/logrotate.d/monsterbox" "$LOGROTATE_CONF"; then
  changed "logrotate: /etc/logrotate.d/monsterbox written (10M, keep 5, compressed)"
else
  ok "logrotate: in place"
fi

# 4. Log files owned by the service user — a root-owned log killed the boot readiness
#    check at its first `tee` under set -e, every boot, on one node.
for lf in "$P/var/log/monsterbox.log" "$P/var/log/monsterbox.err" "$P/var/log/monsterbox-boot.log"; do
  mkdir -p "$(dirname "$lf")"
  touch "$lf"
  if [ "$(stat -c %U "$lf")" != "$SVC_USER" ]; then
    chown "$SVC_USER:$SVC_USER" "$lf"
    changed "logs: $lf now owned by $SVC_USER"
  fi
done
ok "logs: /var/log/monsterbox.* owned by $SVC_USER"

# 5. Wi-Fi power-save OFF — persistent via NetworkManager, immediate via iw (a
#    `nmcli c up` would drop the link and cut every SSH/HTTPS session on the node).
#    Same content as scripts/node-baseline/wifi-powersave-off.sh.
WIFI_CONF='# MonsterBox: Wi-Fi power-save adds 10-100 ms of doze latency to every LAN packet.
# 2 = disable. Installed by install.sh / scripts/node-baseline/wifi-powersave-off.sh
[connection]
wifi.powersave = 2'
if write_if_different "$P/etc/NetworkManager/conf.d/10-monsterbox-wifi-powersave.conf" "$WIFI_CONF"; then
  sys nmcli general reload conf 2>/dev/null || true
  changed "wifi: NetworkManager pinned wifi.powersave=2 (off)"
else
  ok "wifi: NetworkManager pin in place"
fi
IW="$(command -v iw || echo /usr/sbin/iw)"
if [ -z "$P" ] && ip link show wlan0 >/dev/null 2>&1 && [ -x "$IW" ]; then
  if "$IW" dev wlan0 get power_save 2>/dev/null | grep -q ' on$'; then
    "$IW" dev wlan0 set power_save off 2>/dev/null && changed "wifi: wlan0 power-save switched off now"
  else
    ok "wifi: wlan0 $("$IW" dev wlan0 get power_save 2>/dev/null)"
  fi
fi

# 6. monsterbox.service drop-ins — written only when missing (see header).
#    10-priority: the app ahead of everything else on the box.
#    20-secrets:  /etc/monsterbox/env is the ONLY place secrets load from (no dotenv);
#                 the leading dash keeps a node without the file bootable.
#    30-crontab:  /usr/bin/crontab is setgid crontab and NoNewPrivileges blocks setgid,
#                 so the Scheduled Events page needs the group granted directly.
DROPIN_DIR="$P/etc/systemd/system/monsterbox.service.d"
mkdir -p "$DROPIN_DIR"
chmod 755 "$DROPIN_DIR"
write_dropin_if_missing() {
  local name="$1" content="$2"
  if [ -f "$DROPIN_DIR/$name" ]; then
    ok "drop-in: $name present (left as tuned)"
  else
    printf '%s\n' "$content" > "$DROPIN_DIR/$name"
    chmod 644 "$DROPIN_DIR/$name"
    NEEDS_SERVICE_RESTART=1
    changed "drop-in: $name written"
  fi
}
write_dropin_if_missing 10-priority.conf '[Service]
Nice=-5
CPUWeight=90
IOWeight=90'
write_dropin_if_missing 20-secrets.conf '[Service]
# Secrets live in /etc/monsterbox/env — the app does NOT read .env.
EnvironmentFile=-/etc/monsterbox/env'
write_dropin_if_missing 30-crontab.conf '[Service]
SupplementaryGroups=crontab'

# 7. Secrets scaffold (600) — placeholders stay commented until the operator fills them.
if [ ! -f "$P/etc/monsterbox/env" ]; then
  mkdir -p "$P/etc/monsterbox"
  cat > "$P/etc/monsterbox/env" <<'ENVEOF'
# MonsterBox secrets. Read by monsterbox.service via EnvironmentFile.
# The app does NOT read .env — nothing loads dotenv — so this is the only place
# these take effect. Restart the service after editing:
#   sudo systemctl restart monsterbox.service
#MONSTERBOX_SSH_PASSWORD=change-me
#MB_ADMIN_TOKEN=change-me
ENVEOF
  chmod 600 "$P/etc/monsterbox/env"
  changed "secrets: /etc/monsterbox/env scaffolded (commented placeholders — fill them in)"
else
  ok "secrets: /etc/monsterbox/env present"
fi

sys systemctl daemon-reload 2>/dev/null || true

echo "== $HOST: $CHANGES change(s)"
if [ "$NEEDS_SERVICE_RESTART" -eq 1 ]; then
  echo "   new drop-ins apply on the next service start: sudo systemctl restart monsterbox.service"
fi
