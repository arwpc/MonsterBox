#!/usr/bin/env bash
# Autostart the Goblin queue on boot by calling the local API.
# Retries briefly to allow DRM/HDMI to be ready after boot.

sleep 8

# Try up to 10 times to start the queue and detect mpvRunning
for i in $(seq 1 10); do
  /usr/bin/curl -sS -X POST -H 'Content-Type: application/json' \
    --data-binary '{"loopMode":"queue"}' \
    http://127.0.0.1:3001/queue/start >/dev/null 2>&1 || true

  # Check if mpv is running
  H=$(/usr/bin/curl -sS http://127.0.0.1:3001/health || true)
  echo "$H" | /usr/bin/grep -q '"mpvRunning":true' && exit 0
  sleep 2

done

exit 0

