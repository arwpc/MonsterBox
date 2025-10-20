#!/bin/bash
# goblin-setup.sh - Pre-start setup for DRM display and permissions
set -euo pipefail

# Stop/disable getty on tty1 to free the display
systemctl stop getty@tty1.service 2>/dev/null || true
systemctl disable getty@tty1.service 2>/dev/null || true
pkill -t tty1 2>/dev/null || true

# Clear framebuffer (ignore errors if not present)
dd if=/dev/zero of=/dev/fb0 bs=1M count=1 2>/dev/null || true

# Ensure runtime dir for user 1000 (remote)
mkdir -p /run/user/1000
chown remote:remote /run/user/1000
chmod 700 /run/user/1000

# Device permissions for DRM/KMS
chmod 666 /dev/fb0 2>/dev/null || true
chmod 666 /dev/tty1 2>/dev/null || true
[ -e /dev/dri/card0 ] && chmod 666 /dev/dri/card0 || true
[ -e /dev/dri/renderD128 ] && chmod 666 /dev/dri/renderD128 || true

# Kill anything holding our port/display
lsof -ti:3001 | xargs -r kill -9 2>/dev/null || true
pkill -f mpv 2>/dev/null || true
pkill -f vlc 2>/dev/null || true

# Switch to VT1 for DRM access
chvt 1 2>/dev/null || true
# Quiet and clear TTY1 so it never paints over DRM
{ setterm -blank 0 -cursor off -clear all >/dev/tty1; } 2>/dev/null || true
# Also clear via ANSI as a fallback
printf "\033[2J\033[H" >/dev/tty1 2>/dev/null || true

# Ensure CPU performance governor for smooth playback
if ls /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor >/dev/null 2>&1; then
  for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo performance > "$f" 2>/dev/null || true
  done
fi

exit 0

