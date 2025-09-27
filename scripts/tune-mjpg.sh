#!/usr/bin/env bash
set -euo pipefail

# Write a systemd drop-in for mjpg-streamer with low-latency flags
# Usage: sudo bash scripts/tune-mjpg.sh [/dev/videoX] [640x480] [24] [80]

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must run as root; re-exec with sudo..."
  exec sudo -E bash "$0" "$@"
fi

device="${1:-/dev/video0}"
res="${2:-640x480}"
fps="${3:-24}"
quality="${4:-80}"

mjpg_bin="/usr/local/bin/mjpg_streamer"
www_path="/usr/local/share/mjpg-streamer/www"
override_dir="/etc/systemd/system/mjpg-streamer.service.d"
override_path="$override_dir/20-monsterbox-vid.conf"

mkdir -p "$override_dir"
cat > "$override_path" <<EOF
[Service]
ExecStart=
ExecStart=$mjpg_bin -i "input_uvc.so -d $device -r $res -f $fps -q $quality" -o "output_http.so -p 8090 -w $www_path"
EOF

systemctl daemon-reload
systemctl restart mjpg-streamer
systemctl is-active mjpg-streamer --quiet && echo "mjpg-streamer restarted with $device $res ${fps}fps q$quality" || (echo "mjpg-streamer failed to start"; exit 1)

