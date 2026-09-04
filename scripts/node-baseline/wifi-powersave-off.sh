#!/usr/bin/env bash
# Turn Wi-Fi power-save OFF on this node — now, and across reboots.
#
# Why: with power-save on, the radio dozes between beacons and the first packet
# after any idle gap waits for the next one. Measured on the fleet 2026-09-04 with
# power-save ON on five of six nodes: LAN ping averaged 11-31 ms with spikes to
# 103 ms (should be 2-5 ms), TCP connect to one node took 80 ms vs 6 ms elsewhere,
# and every inter-node HTTPS call and every browser request paid that tax. That
# is where "the communication takes full seconds" came from — not the code path.
#
# Orlok read "off" only by accident (nothing pinned it), so a reboot would have
# turned it back on. This makes it explicit everywhere.
#
# Usage (needs passwordless sudo):
#   bash scripts/node-baseline/wifi-powersave-off.sh
# Fleet-wide from the node holding SSH trust:
#   for ip in 192.168.8.150 192.168.8.140 192.168.8.130 192.168.8.200 192.168.8.224; do
#     ssh remote@$ip 'bash -s' < scripts/node-baseline/wifi-powersave-off.sh; done
set -euo pipefail

IFACE="${1:-wlan0}"
IW="$(command -v iw || echo /usr/sbin/iw)"

# Persistent: NetworkManager applies this to every Wi-Fi profile whose own
# powersave is "default" (0), on activation and at boot.
sudo mkdir -p /etc/NetworkManager/conf.d
printf '%s\n' \
  '# MonsterBox: Wi-Fi power-save adds 10-100 ms of doze latency to every LAN packet.' \
  '# 2 = disable. Installed by install.sh / scripts/node-baseline/wifi-powersave-off.sh' \
  '[connection]' \
  'wifi.powersave = 2' \
  | sudo tee /etc/NetworkManager/conf.d/10-monsterbox-wifi-powersave.conf >/dev/null
sudo nmcli general reload conf 2>/dev/null || true

# Immediate, WITHOUT re-activating the connection — a `nmcli c up` drops the link
# for a few seconds and cuts every SSH and HTTPS session on the node.
sudo "$IW" dev "$IFACE" set power_save off

printf '%s %s: %s\n' "$(hostname)" "$IFACE" "$("$IW" dev "$IFACE" get power_save)"
