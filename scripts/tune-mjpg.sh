#!/usr/bin/env bash
set -euo pipefail

# Tune per-node camera geometry for mjpg-streamer.
#
# This used to write a systemd drop-in that RESET ExecStart with a hardcoded
# device path and its own fps/quality — silently discarding the canonical
# launcher's by-id device self-healing (re-arming the documented 42-restart
# USB re-enumeration crash-loop) and whatever the operator had specified.
# Eight different scripts fought over that unit file; last writer won.
#
# It now writes the ONE supported knob: /etc/default/monsterbox-cam, which
# scripts/mjpg-launcher.sh sources on every start. The launcher keeps device
# auto-detection (by-id) unless MB_CAM_DEV is set explicitly.
#
# Usage: sudo bash scripts/tune-mjpg.sh [WxH] [fps] [quality] [/dev/videoX]
#   e.g. sudo bash scripts/tune-mjpg.sh 640x480 15 60
# Defaults preserve the operator spec: 640x480 @ 15fps, q60 (q only applies
# in YUYV fallback; native MJPG passthrough ignores it).

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must run as root; re-exec with sudo..."
  exec sudo -E bash "$0" "$@"
fi

res="${1:-640x480}"
fps="${2:-15}"
quality="${3:-60}"
device="${4:-}"

env_path="/etc/default/monsterbox-cam"

{
  echo "# Written by scripts/tune-mjpg.sh $(date -Iseconds) — sourced by mjpg-launcher.sh"
  echo "MB_CAM_RES=$res"
  echo "MB_CAM_FPS=$fps"
  echo "MB_CAM_Q=$quality"
  if [[ -n "$device" ]]; then
    echo "MB_CAM_DEV=$device"
  fi
} > "$env_path"

# Remove any legacy ExecStart-resetting drop-ins this script (or its siblings)
# left behind — they override the launcher entirely and pin bare device paths.
if [[ -d /etc/systemd/system/mjpg-streamer.service.d ]]; then
  rm -f /etc/systemd/system/mjpg-streamer.service.d/20-monsterbox-vid.conf
  rmdir --ignore-fail-on-non-empty /etc/systemd/system/mjpg-streamer.service.d
fi

systemctl daemon-reload
systemctl restart mjpg-streamer 2>/dev/null || true
echo "Camera geometry set: ${res}@${fps} q${quality}${device:+ dev=$device} -> $env_path"
