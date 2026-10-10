#!/bin/bash
# Bring a FRESH Raspberry Pi OS (trixie, Pi 3B+) image up as a Goblin video node. Run ON the Goblin as root:
#   sudo bash /home/remote/goblin-os/provision-goblin.sh
# Expects, already synced into the home dir (user-space, done from the MonsterBox node):
#   /home/remote/goblin            the player app (a copy of a working Goblin's dir, node_modules included)
#   /home/remote/media/video       the video files
#   /home/remote/goblin-os/        this script + goblin.service + goblin-setup.sh + goblin-autostart.sh + stabilize-goblin.sh
# Idempotent. Mirrors what Goblin 3 (192.168.8.14, trixie) runs: Debian nodejs 20 + mpv 0.40, vc4-kms-v3d,
# hdmi_group=1/hdmi_mode=4 (720p60), gpu_mem=128, the gold "Goblin Gold Media Player" unit, CLI-only boot.
set -u
[ "$(id -u)" = 0 ] || { echo "run as root: sudo bash $0"; exit 1; }
D=/home/remote/goblin-os
say() { echo "== $*"; }

say "1. packages"
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null || ! command -v mpv >/dev/null; then
  apt-get update -q && apt-get install -y -q nodejs npm mpv || { echo "apt failed"; exit 1; }
fi
echo "   node $(node --version)  mpv $(mpv --version | head -1 | cut -d' ' -f1-2)  ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3)"

say "2. app + media ownership"
[ -f /home/remote/goblin/server.js ] || { echo "   /home/remote/goblin missing — sync it first"; exit 1; }
mkdir -p /home/remote/goblin/logs /home/remote/media/video
chown -R remote:remote /home/remote/goblin /home/remote/media
chgrp video /home/remote/goblin/logs
echo "   videos: $(ls /home/remote/media/video | grep -ciE '\.(mp4|mov|avi|mkv)$')"
(cd /home/remote/goblin && sudo -u remote node --check server.js && sudo -u remote node --check src/mpvController.js) || exit 1

say "3. gold unit + helper scripts"
install -m 755 "$D/goblin-setup.sh" "$D/goblin-autostart.sh" /usr/local/bin/
install -m 644 "$D/goblin.service" /etc/systemd/system/goblin.service
systemctl daemon-reload
systemctl enable goblin.service >/dev/null 2>&1 && echo "   goblin.service enabled"

say "4. display config"
CFG=/boot/firmware/config.txt; [ -f "$CFG" ] || CFG=/boot/config.txt
cp -n "$CFG" "$CFG.pre-goblin.$(date +%Y%m%d)" 2>/dev/null
grep -q '^\[all\]' "$CFG" || printf '\n[all]\n' >> "$CFG"
for kv in hdmi_group=1 hdmi_mode=4 hdmi_force_hotplug=1 hdmi_drive=2 gpu_mem=128; do
  k=${kv%%=*}
  grep -qE "^$k=" "$CFG" && sed -i -E "s/^$k=.*/$kv/" "$CFG" || echo "$kv" >> "$CFG"
done
grep -q '^dtoverlay=vc4-kms-v3d' "$CFG" || echo "   WARNING: vc4-kms-v3d overlay not found in $CFG"
echo "   $(grep -E '^(hdmi_|gpu_mem|dtoverlay=vc4)' "$CFG" | tr '\n' ' ')"

say "5. CLI-only boot"
systemctl set-default multi-user.target >/dev/null 2>&1
systemctl disable lightdm.service display-manager.service >/dev/null 2>&1
systemctl disable getty@tty1.service >/dev/null 2>&1
echo "   default target: $(systemctl get-default); lightdm: $(systemctl is-enabled lightdm.service 2>/dev/null)"

say "5b. clock (America/Chicago + NTP; show schedules are local time on every node)"
timedatectl set-timezone "${MB_TIMEZONE:-America/Chicago}" 2>/dev/null; timedatectl set-ntp true 2>/dev/null
echo "   $(timedatectl show -p Timezone -p NTP -p NTPSynchronized --value 2>/dev/null | tr '\n' ' ')$(date '+%F %T %Z')"

say "6. OS hygiene (stabilize-goblin.sh)"
[ -f "$D/stabilize-goblin.sh" ] && bash "$D/stabilize-goblin.sh"

say "done. Reboot to apply the display config and the CLI-only target: sudo reboot"
echo "After the reboot: curl -s http://127.0.0.1:3001/health | head -c 120 ; pgrep -c mpv   (expect 1)"
