#!/bin/bash
# Make a Goblin display node lean and stable. Run ON the Goblin as root (sudo bash stabilize-goblin.sh).
# Idempotent; every change is reversible and backed up. Written 2026-09-26 from the OS audit of
# goblin2 (see docs/troubleshooting/KNOWN-BUGS.md → Goblins). Agents cannot run this remotely
# (remote system writes are refused), so it is the operator's script.
#
# What it does:
#   1. Disables the leftover units that crash-loop or would start a SECOND player (monsterbox-goblin,
#      goblin-autoqueue, goblin-hide-console).
#   2. Keeps the box CLI-only: multi-user.target, lightdm and the desktop session units disabled.
#   3. Disables services a video display does not need (printing, colour management, Bluetooth,
#      modem, NFS/rpcbind, cloud-init, udisks, accounts, VNC control, RPi test units).
#   4. Masks the unattended apt timers (an upgrade mid-show is a reboot risk) and the PipeWire user
#      units (a login must never let PipeWire hold the HDMI card against mpv).
#   5. Removes the overclock/over-voltage lines from config.txt (force_turbo, over_voltage, arm_freq,
#      core_freq, gpu_freq) — the stock clocks draw less and brown out less; backup kept.
#   6. Makes the journal persistent and bounded so the NEXT reboot leaves a record of what preceded it.
#   7. HDMI mixer to full scale where the card has one (bcm2835), stored.
# It does NOT touch goblin.service, the app under /home/remote/goblin, the videos, or the network.
set -u
[ "$(id -u)" = 0 ] || { echo "run as root: sudo bash $0"; exit 1; }
say() { echo "== $*"; }

say "1. leftover units"
for u in monsterbox-goblin.service goblin-autoqueue.service goblin-hide-console.service; do
  if systemctl list-unit-files --no-legend "$u" 2>/dev/null | grep -q "$u"; then
    systemctl disable --now "$u" 2>/dev/null; systemctl mask "$u" 2>/dev/null; echo "   $u: disabled+masked"
  fi
done

say "2. CLI only"
systemctl set-default multi-user.target >/dev/null 2>&1 && echo "   default target: $(systemctl get-default)"
for u in lightdm.service display-manager.service; do systemctl disable "$u" 2>/dev/null && echo "   $u disabled"; done

say "3. unneeded services"
for u in cups.service cups-browsed.service cups.socket cups.path colord.service bluetooth.service hciuart.service \
         ModemManager.service nfs-blkmap.service rpcbind.service rpcbind.socket udisks2.service accounts-daemon.service \
         wayvnc-control.service glamor-test.service rp1-test.service rpi-eeprom-update.service \
         cloud-init-local.service cloud-init-main.service cloud-init-network.service cloud-config.service cloud-final.service; do
  if systemctl list-unit-files --no-legend "$u" 2>/dev/null | grep -q "$u"; then
    systemctl disable --now "$u" >/dev/null 2>&1 && echo "   $u: off"
  fi
done
[ -d /etc/cloud ] && touch /etc/cloud/cloud-init.disabled && echo "   cloud-init: disabled marker set"

say "4. timers and PipeWire"
for t in apt-daily.timer apt-daily-upgrade.timer man-db.timer; do systemctl disable --now "$t" >/dev/null 2>&1; systemctl mask "$t" >/dev/null 2>&1 && echo "   $t masked"; done
systemctl --global mask pipewire.socket pipewire.service pipewire-pulse.socket pipewire-pulse.service wireplumber.service >/dev/null 2>&1 && echo "   PipeWire user units masked (all users)"
if [ -d /run/user/1000 ]; then sudo -u remote XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop pipewire-pulse.socket pipewire-pulse.service pipewire.socket pipewire.service wireplumber.service 2>/dev/null; fi

say "5. config.txt clocks"
CFG=/boot/firmware/config.txt; [ -f "$CFG" ] || CFG=/boot/config.txt
if [ -f "$CFG" ] && grep -qE '^(force_turbo|over_voltage|arm_freq|core_freq|gpu_freq)=' "$CFG"; then
  cp -n "$CFG" "$CFG.pre-stabilize.$(date +%Y%m%d)" 2>/dev/null
  sed -i -E 's/^(force_turbo|over_voltage|arm_freq|core_freq|gpu_freq)=/# stabilize-goblin: &/' "$CFG"
  echo "   commented out: $(grep -oE '^# stabilize-goblin: [a-z_]+=[0-9]+' "$CFG" | sed 's/# stabilize-goblin: //' | tr '\n' ' ')"
else
  echo "   no overclock lines in $CFG"
fi

say "6. persistent, bounded journal"
mkdir -p /etc/systemd/journald.conf.d /var/log/journal
cat > /etc/systemd/journald.conf.d/50-goblin.conf <<'J'
[Journal]
Storage=persistent
SystemMaxUse=48M
SystemMaxFileSize=8M
MaxRetentionSec=14day
J
systemctl restart systemd-journald && echo "   journald: persistent, 48M cap, 8M files"

say "7. HDMI mixer"
if amixer -c 0 scontrols 2>/dev/null | grep -q "'PCM'"; then amixer -c 0 sset PCM 100% >/dev/null && alsactl store 2>/dev/null && echo "   card0 PCM -> $(amixer -c 0 sget PCM | grep -oE '\[[0-9]+%\]' | head -1) stored"; else echo "   card0 has no PCM control (vc4 HDMI is full scale)"; fi

say "done — reboot to apply the clock change: sudo reboot"
