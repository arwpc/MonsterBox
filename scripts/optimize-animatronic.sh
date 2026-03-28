#!/bin/bash
# MonsterBox Animatronic Optimization Script
# Strips a Raspberry Pi 4B to essentials for running MonsterBox
# Usage: ssh remote@<IP> 'bash -s' < scripts/optimize-animatronic.sh
#   or:  sudo bash scripts/optimize-animatronic.sh  (run locally on the Pi)

set -e

echo "=== MonsterBox Animatronic Optimizer ==="

# Must be root
if [ "$EUID" -ne 0 ]; then
    echo "Run as root: sudo bash $0"
    exit 1
fi

ACTUAL_USER=${SUDO_USER:-remote}

# ── 1. Disable unnecessary services ──
echo ">>> Disabling unnecessary services..."
DISABLE_SERVICES=(
    smbd nmbd                    # Samba file sharing
    cups cups-browsed            # Printing
    bluetooth                    # Bluetooth
    ModemManager                 # Modem management
    colord                       # Color profiles
    fluent-bit                   # Log forwarding
    triggerhappy                 # Hotkey daemon
    avahi-daemon                 # mDNS (not needed on static IP)
    lightdm                      # Desktop GUI
    xdg-desktop-portal           # Desktop portal
)
for svc in "${DISABLE_SERVICES[@]}"; do
    systemctl disable --now "$svc" 2>/dev/null || true
done
echo "    Services disabled"

# ── 2. Remove bloat packages ──
echo ">>> Removing bloat packages..."
apt-get purge -y --auto-remove \
    samba-common samba cups cups-browsed cups-common \
    bluez modemmanager colord fluent-bit triggerhappy \
    chromium-browser chromium-codecs-ffmpeg \
    vlc vlc-data \
    libreoffice-common \
    scratch scratch3 \
    sonic-pi \
    thonny \
    geany \
    rpd-planner \
    2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true
apt-get clean
echo "    Bloat removed"

# ── 3. Set headless mode ──
echo ">>> Setting headless (multi-user) target..."
systemctl set-default multi-user.target 2>/dev/null || true

# ── 4. Performance tuning ──
echo ">>> Applying performance tuning..."
cat > /etc/sysctl.d/99-monsterbox.conf << 'SYSCTL'
# MonsterBox animatronic performance tuning
vm.swappiness=10
vm.dirty_writeback_centisecs=1500
vm.dirty_expire_centisecs=3000
kernel.printk=3 4 1 3
net.core.somaxconn=256
SYSCTL
sysctl -p /etc/sysctl.d/99-monsterbox.conf 2>/dev/null
echo "    Sysctl tuning applied"

# ── 5. Swap to 1GB ──
echo ">>> Configuring 1GB swap..."
if [ -f /etc/dphys-swapfile ]; then
    dphys-swapfile swapoff 2>/dev/null || true
    sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
    dphys-swapfile setup 2>/dev/null
    dphys-swapfile swapon 2>/dev/null
    echo "    Swap set to 1GB"
else
    echo "    dphys-swapfile not found, skipping"
fi

# ── 6. Journal and log limits ──
echo ">>> Configuring log limits..."
journalctl --vacuum-size=20M 2>/dev/null || true
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/monsterbox.conf << 'JOURNAL'
[Journal]
SystemMaxUse=50M
RuntimeMaxUse=20M
MaxFileSec=1day
JOURNAL
systemctl restart systemd-journald 2>/dev/null || true

cat > /etc/logrotate.d/monsterbox << 'LOGROTATE'
/var/log/monsterbox.log /var/log/monsterbox.err {
    daily
    rotate 3
    compress
    missingok
    notifempty
    size 10M
}
LOGROTATE
echo "    Log limits configured"

# ── 7. Optimized MonsterBox service ──
echo ">>> Installing optimized MonsterBox service..."
REPO_DIR="/home/${ACTUAL_USER}/MonsterBox"
if [ -d "$REPO_DIR" ]; then
    cat > /etc/systemd/system/monsterbox.service << EOF
[Unit]
Description=MonsterBox Animatronic Control System
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target multi-user.target
Wants=network-online.target

[Service]
Type=simple
User=${ACTUAL_USER}
WorkingDirectory=${REPO_DIR}
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=GAIN=130
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u ${ACTUAL_USER})
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StartLimitBurst=5
StandardOutput=append:/var/log/monsterbox.log
StandardError=append:/var/log/monsterbox.err
SyslogIdentifier=monsterbox
Nice=-15
IOSchedulingClass=realtime
IOSchedulingPriority=0
LimitNOFILE=4096
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable monsterbox.service
    echo "    MonsterBox service installed"
else
    echo "    WARNING: ${REPO_DIR} not found, skipping service setup"
fi

# ── 8. SSL certs (if missing) ──
CERT_DIR="${REPO_DIR}/certs"
if [ -d "$REPO_DIR" ] && [ ! -f "$CERT_DIR/server.key" ]; then
    echo ">>> Generating SSL certificates..."
    mkdir -p "$CERT_DIR"
    HOSTNAME_SHORT=$(hostname -s 2>/dev/null || echo "monsterbox")
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.cert" \
        -days 3650 -subj "/CN=$HOSTNAME_SHORT" 2>/dev/null
    chmod 600 "$CERT_DIR/server.key"
    chown "${ACTUAL_USER}:${ACTUAL_USER}" "$CERT_DIR/server.key" "$CERT_DIR/server.cert"
    echo "    SSL certs generated"
fi

echo ""
echo "=== Optimization complete ==="
echo "    Reboot recommended: sudo reboot"
echo "    MonsterBox will auto-start on boot"
echo "    Dashboard: https://$(hostname -I | awk '{print $1}'):3000"
