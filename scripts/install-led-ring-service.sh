#!/bin/bash
# WS2812B eye rings on a Raspberry Pi 4 under the hardened monsterbox.service.
#
# Why this exists: on a Pi 4 the LED daemon drives GPIO18 through rpi_ws281x
# (PWM0 + DMA), which needs root. The app's only root path was spawning
# `sudo -n python3 led_ring_daemon.py` from inside monsterbox.service, and the
# unit install.sh writes sets NoNewPrivileges=true, under which sudo refuses —
# so a freshly installed Pi 4 never lit its rings (Renfield's replacement Pi 4,
# 2026-09-27). This runs the daemon as its own root unit instead and points the
# app at its socket. PrivateTmp=true hides /tmp from other units, so the socket
# lives under /run. ledRingDaemonClient.ensureDaemon() uses a live daemon before
# it ever tries to spawn one, so no application change is needed.
#
# A Pi 5 needs none of this (RP1 PIO, no root) and the script exits early.
#
# Usage: sudo bash scripts/install-led-ring-service.sh [count] [split] [pin] [dma] [channel] [freq] [colorOrder]
#        defaults: 16 8 18 10 0 800000 GRB — take them from the led_ring part's config.
# Re-run with new arguments after changing ring geometry on /setup/calibration.
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
    echo "Run as root: sudo bash $0 $*" >&2
    exit 1
fi

REPO_DIR="${MB_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COUNT="${1:-16}"
SPLIT="${2:-8}"
PIN="${3:-18}"
DMA="${4:-10}"
CHANNEL="${5:-0}"
FREQ="${6:-800000}"
ORDER="${7:-GRB}"
SOCKET_DIR=/run/monsterbox-led
SOCKET_PATH="$SOCKET_DIR/led.sock"

if grep -q "Raspberry Pi 5" /proc/device-tree/model 2>/dev/null; then
    echo "[ok] Raspberry Pi 5: the daemon uses RP1 PIO without root — nothing to install."
    exit 0
fi

if [ -f /boot/firmware/config.txt ]; then
    BOOT_CONFIG=/boot/firmware/config.txt
else
    BOOT_CONFIG=/boot/config.txt
fi

# 1. rpi_ws281x for root's python3 (no apt package provides it).
if python3 -c "import rpi_ws281x" >/dev/null 2>&1; then
    echo "[ok] rpi_ws281x importable for root"
else
    pip3 install --break-system-packages rpi-ws281x
    echo "[changed] rpi_ws281x installed for root"
fi

# 2. Onboard analog audio off: snd_bcm2835 drives the same PWM block as GPIO18,
#    and both at once gives flicker or a dead strip. The 3.5 mm jack goes away.
REBOOT_NEEDED=0
if grep -qE '^dtparam=audio=on' "$BOOT_CONFIG"; then
    sed -i 's/^dtparam=audio=on/dtparam=audio=off/' "$BOOT_CONFIG"
    REBOOT_NEEDED=1
    echo "[changed] $BOOT_CONFIG: dtparam=audio=off"
elif ! grep -qE '^dtparam=audio=off' "$BOOT_CONFIG"; then
    echo 'dtparam=audio=off' >> "$BOOT_CONFIG"
    REBOOT_NEEDED=1
    echo "[changed] $BOOT_CONFIG: dtparam=audio=off appended"
else
    echo "[ok] $BOOT_CONFIG: dtparam=audio=off"
fi
if [ ! -f /etc/modprobe.d/blacklist-snd-bcm2835.conf ]; then
    echo 'blacklist snd_bcm2835' > /etc/modprobe.d/blacklist-snd-bcm2835.conf
    REBOOT_NEEDED=1
    echo "[changed] snd_bcm2835 blacklisted"
else
    echo "[ok] snd_bcm2835 blacklisted"
fi

# 3. The daemon as a root unit, socket under /run.
cat > /etc/systemd/system/monsterbox-led.service <<EOF
[Unit]
Description=MonsterBox WS2812B LED ring daemon (rpi_ws281x PWM+DMA needs root on a Pi 4)
After=local-fs.target
Before=monsterbox.service

[Service]
Type=simple
RuntimeDirectory=monsterbox-led
RuntimeDirectoryMode=0755
ExecStart=/usr/bin/python3 $REPO_DIR/python_wrappers/led_ring_daemon.py --count $COUNT --split $SPLIT --pin $PIN --dma $DMA --channel $CHANNEL --freq $FREQ --color-order $ORDER --socket $SOCKET_PATH
Restart=always
RestartSec=3
StandardOutput=append:/var/log/monsterbox.log
StandardError=append:/var/log/monsterbox.err

[Install]
WantedBy=multi-user.target
EOF
echo "[changed] /etc/systemd/system/monsterbox-led.service (count=$COUNT split=$SPLIT pin=$PIN dma=$DMA channel=$CHANNEL freq=$FREQ order=$ORDER)"

# 4. Point the app at that socket.
mkdir -p /etc/systemd/system/monsterbox.service.d
cat > /etc/systemd/system/monsterbox.service.d/30-led-socket.conf <<EOF
[Service]
# The LED daemon runs as monsterbox-led.service (root); see scripts/install-led-ring-service.sh.
Environment=MB_LED_SOCKET=$SOCKET_PATH
EOF
echo "[changed] monsterbox.service drop-in: MB_LED_SOCKET=$SOCKET_PATH"

systemctl daemon-reload
systemctl enable monsterbox-led.service >/dev/null 2>&1

if [ "$REBOOT_NEEDED" = "1" ]; then
    echo "[next] reboot so analog audio unloads; monsterbox-led.service starts at boot"
else
    systemctl restart monsterbox-led.service
    echo "[ok] monsterbox-led.service restarted; restart monsterbox.service to pick up MB_LED_SOCKET"
fi
