#!/usr/bin/env bash
# Upload Halloween audio to all animatronics
# Usage: ./scripts/upload-halloween-audio-all.sh [directory]

set -euo pipefail

DIR=${1:-"/home/remote/Halloween2025"}

ANIMS=(
  "PumpkinHead:192.168.8.150"
  "CoffinBreaker:192.168.8.140"
  "Skulltalker:192.168.8.130"
  "Orlok:192.168.8.120"
  "Groundbreaker:192.168.8.200"
)

echo "🎃 Uploading Halloween audio to all animatronics from ${DIR}"

for entry in "${ANIMS[@]}"; do
  name="${entry%%:*}"
  ip="${entry##*:}"
  echo "\n==== ${name} (${ip}) ===="
  if ping -c 1 -W 2 "$ip" >/dev/null 2>&1; then
    echo "🌐 ${name} reachable"
    bash "$(dirname "$0")/upload-halloween-audio.sh" "$ip" "$DIR" || echo "⚠️  Upload to ${name} encountered errors"
  else
    echo "❌ ${name} not reachable at ${ip}"
  fi
done

echo "\n✅ All uploads attempted."
