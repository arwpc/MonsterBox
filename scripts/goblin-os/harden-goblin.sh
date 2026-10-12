#!/bin/bash
# Make a Goblin boot straight into its show and stay on MonsterNet with nobody touching it.
# Run ON the Goblin as root, with goblin-wifi-guard.sh beside it:
#   sudo bash harden-goblin.sh
# From a MonsterBox node, for every Goblin: bash scripts/goblin-os/harden-all.sh
# Idempotent; everything it replaces is copied to /var/backups/harden-goblin-<stamp>/ first.
#
# Root causes it closes (2026-10-12; see docs/troubleshooting/KNOWN-BUGS.md → Goblins):
#   * Goblins are switched off at the wall. On the re-imaged units (Goblins 1 and 4) the Wi-Fi
#     profile lived in /etc/netplan/90-NM-<uuid>.yaml and a power cut left it 0 bytes, so the
#     radio came up with no profile and never joined. -> keyfile profile, a root-only copy, and
#     goblin-wifi-guard puts it back and walks a reconnect ladder.
#   * A one-time SD-card "fixup" turned Goblins 1 and 4 into desktops: graphical.target, lightdm
#     autologin, goblin.service disabled, Goblin 4's 720p drop-in renamed away, and a timer that
#     wrote to the FAT boot partition every 10 minutes (a FAT write cut by a power loss can stop
#     the Pi booting). -> undone.
#   * goblin.service ran at real-time priority, so a crash-looping mpv starved sshd and HTTP and
#     the unit looked off the network while still answering ping. -> normal scheduling (and the
#     player now backs off a crash loop).
#   * goblin.service waited for network-online.target, so a unit without Wi-Fi also sat dark for
#     the wait-online timeout. -> the player starts on local disk alone.
# It does NOT touch the videos or the player code (harden-all.sh copies the player files).
set -u
[ "$(id -u)" = 0 ] || { echo "run as root: sudo bash $0"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
STAMP=$(date +%Y%m%d-%H%M%S)
BK=/var/backups/harden-goblin-$STAMP
mkdir -p "$BK"
say() { echo "== $*"; }
backup() { [ -e "$1" ] && cp -a --parents "$1" "$BK/" 2>/dev/null; return 0; }
SSID=${GOBLIN_SSID:-MonsterNet}
PD=/etc/NetworkManager/system-connections

say "1. Wi-Fi profile as a keyfile"
ACTIVE=$(nmcli -g GENERAL.CONNECTION device show wlan0 2>/dev/null)
ACTIVE_FILE=$(nmcli -g NAME,FILENAME connection show 2>/dev/null | awk -F: -v n="$ACTIVE" '$1==n {print $2}')
if [ -z "$ACTIVE" ]; then
  # Not connected: fall back to any saved profile for the SSID.
  ACTIVE=$(nmcli -t -f NAME,TYPE connection show | awk -F: '$2=="802-11-wireless" {print $1; exit}')
  ACTIVE_FILE=$(nmcli -g NAME,FILENAME connection show 2>/dev/null | awk -F: -v n="$ACTIVE" '$1==n {print $2}')
fi
if [ -n "$ACTIVE" ] && [[ "$ACTIVE_FILE" == $PD/* ]]; then
  echo "   '$ACTIVE' is already a keyfile ($ACTIVE_FILE)"
elif [ -n "$ACTIVE" ]; then
  # netplan- or runtime-backed: rebuild it as a keyfile with the same SSID and key.
  PSK=$(nmcli -s -g 802-11-wireless-security.psk connection show "$ACTIVE")
  [ -n "$PSK" ] || { echo "   cannot read the key of '$ACTIVE'; leaving it alone"; exit 1; }
  nmcli connection add type wifi ifname wlan0 con-name "$SSID" ssid "$SSID" \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK" >/dev/null && echo "   created keyfile profile '$SSID' from '$ACTIVE'"
  nmcli connection modify "$ACTIVE" connection.autoconnect no 2>/dev/null
  ACTIVE=$SSID
else
  # No profile at all: take the SSID and key the imager left on the boot partition.
  NC=/boot/firmware/network-config
  PSK=$(sed -n '/access-points:/,$ s/^[[:space:]]*password:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' "$NC" 2>/dev/null | head -1)
  [ -n "$PSK" ] || { echo "   no Wi-Fi profile and no key in $NC; configure Wi-Fi once by hand, then rerun"; exit 1; }
  nmcli connection add type wifi ifname wlan0 con-name "$SSID" ssid "$SSID" \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PSK" >/dev/null && echo "   created keyfile profile '$SSID' from $NC"
  ACTIVE=$SSID
fi
# Reconnect forever, no power-save (brcmfmac drops with it on), probe even if the SSID is hidden,
# and prefer this profile over anything else.
nmcli connection modify "$ACTIVE" connection.autoconnect yes connection.autoconnect-priority 100 \
  connection.autoconnect-retries 0 802-11-wireless.powersave 2 802-11-wireless.hidden yes \
  && echo "   '$ACTIVE': autoconnect forever, power-save off, hidden-SSID probe"
mkdir -p /etc/NetworkManager/conf.d
cat > /etc/NetworkManager/conf.d/90-goblin-wifi.conf <<'C'
# harden-goblin.sh: no Wi-Fi power-save on any profile (brcmfmac drops the link with it on)
[connection]
wifi.powersave=2
C
for f in /etc/NetworkManager/conf.d/99-claude-wifi-powersave-off.conf; do [ -f "$f" ] && { backup "$f"; rm -f "$f"; echo "   replaced $(basename "$f")"; }; done
KF=$(nmcli -g NAME,FILENAME connection show | awk -F: -v n="$ACTIVE" '$1==n {print $2}')
mkdir -p /etc/goblin/wifi && chmod 700 /etc/goblin /etc/goblin/wifi
rm -f /etc/goblin/wifi/*.nmconnection
install -m 600 "$KF" /etc/goblin/wifi/ && echo "   copy kept at /etc/goblin/wifi/$(basename "$KF")"
for f in /etc/netplan/90-NM-*.yaml; do
  [ -f "$f" ] && [ ! -s "$f" ] && { backup "$f"; rm -f "$f"; echo "   removed empty $(basename "$f") (a profile lost to a power cut)"; }
done
# Other Wi-Fi profiles must not compete for wlan0.
nmcli -t -f NAME,TYPE connection show | awk -F: -v keep="$ACTIVE" '$2=="802-11-wireless" && $1!=keep {print $1}' | while read -r other; do
  nmcli connection modify "$other" connection.autoconnect no && echo "   '$other': autoconnect off"
done
sync

say "2. Wi-Fi guard"
install -m 755 "$HERE/goblin-wifi-guard.sh" /usr/local/sbin/goblin-wifi-guard.sh
cat > /etc/systemd/system/goblin-wifi-guard.service <<'U'
[Unit]
Description=Goblin Wi-Fi guard (restore the profile, reconnect, last-resort reboot)
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=simple
ExecStart=/usr/local/sbin/goblin-wifi-guard.sh
Restart=always
RestartSec=10
Nice=5

[Install]
WantedBy=multi-user.target
U
systemctl daemon-reload
systemctl enable --now goblin-wifi-guard.service >/dev/null 2>&1
systemctl restart goblin-wifi-guard.service
echo "   goblin-wifi-guard: $(systemctl is-enabled goblin-wifi-guard.service) / $(systemctl is-active goblin-wifi-guard.service)"
# The earlier diagnostic timer writes to the FAT boot partition; stop it.
if systemctl list-unit-files --no-legend claude-wifi-log.timer 2>/dev/null | grep -q claude-wifi-log; then
  systemctl disable --now claude-wifi-log.timer >/dev/null 2>&1 && echo "   claude-wifi-log.timer disabled (it wrote to the boot partition every 10 min)"
fi

say "3. boot straight into the player"
systemctl set-default multi-user.target >/dev/null 2>&1
for u in lightdm.service display-manager.service; do systemctl disable "$u" >/dev/null 2>&1; done
if [ -f /etc/lightdm/lightdm.conf ] && grep -qE '^autologin-user=' /etc/lightdm/lightdm.conf; then
  backup /etc/lightdm/lightdm.conf; sed -i -E 's/^autologin-user=/#harden-goblin# autologin-user=/' /etc/lightdm/lightdm.conf
fi
echo "   default target: $(systemctl get-default); lightdm: $(systemctl is-enabled lightdm.service 2>/dev/null || true)"
[ -f "$HERE/goblin-setup.sh" ] && { backup /usr/local/bin/goblin-setup.sh; install -m 755 "$HERE/goblin-setup.sh" /usr/local/bin/goblin-setup.sh; echo "   goblin-setup.sh updated"; }
D=/etc/systemd/system/goblin.service.d
mkdir -p "$D"
for f in "$D"/*.disabled-by-claude-fixup; do
  [ -f "$f" ] && { mv -f "$f" "${f%.disabled-by-claude-fixup}"; echo "   restored $(basename "${f%.disabled-by-claude-fixup}")"; }
done
# Dependencies cannot be cleared from a drop-in, so edit the unit (a local file on every Goblin).
U=/etc/systemd/system/goblin.service
if grep -qE '^(After|Wants)=network-online.target' "$U"; then
  backup "$U"
  sed -i -E 's/^After=network-online.target$/After=local-fs.target/; /^Wants=network-online.target$/d' "$U"
  echo "   goblin.service no longer waits for network-online.target"
fi
# Real-time scheduling on the whole service let a crash-looping mpv (and node) starve sshd, HTTP
# and NetworkManager: the unit answered ping and nothing else (Goblin 3 2026-09-26, Goblin 4
# 2026-10-12). Normal scheduling at high priority plays the same hardware-decoded clips.
if grep -qE '^(CPUSchedulingPolicy|CPUSchedulingPriority|IOSchedulingClass=realtime|Nice=-20)' "$U"; then
  backup "$U"
  sed -i -E '/^(CPUSchedulingPolicy|CPUSchedulingPriority|LimitRTPRIO)=/d; s/^IOSchedulingClass=realtime$/IOSchedulingClass=best-effort/; s/^Nice=-20$/Nice=-10/' "$U"
  echo "   goblin.service: real-time scheduling removed (Nice=-10, best-effort I/O)"
fi
systemctl daemon-reload
systemctl enable goblin.service >/dev/null 2>&1
echo "   goblin.service: $(systemctl is-enabled goblin.service)"
# A unit stuck on the desktop target right now: switch without a reboot.
if systemctl is-active --quiet lightdm.service; then
  systemctl stop lightdm.service; echo "   stopped the running desktop"
fi
systemctl restart goblin.service
sleep 15
echo "   health: $(curl -s -m 5 http://127.0.0.1:3001/health | head -c 160)"
echo "   mpv processes: $(pgrep -c mpv)"

say "done (backups in $BK)"
