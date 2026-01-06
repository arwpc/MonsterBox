#!/bin/bash
# MonsterBox Audio Startup Script
# Ensures PipeWire and WirePlumber start reliably at boot

# Wait for system to settle
sleep 5

# Start audio services
systemctl --user start pipewire pipewire-pulse wireplumber

# Wait for audio system to be ready (up to 20 seconds)
for i in {1..10}; do
    if wpctl status &>/dev/null; then
        echo "$(date): Audio system ready" >> ~/audio-startup.log
        exit 0
    fi
    sleep 2
done

echo "$(date): Audio system failed to start" >> ~/audio-startup.log
exit 1
