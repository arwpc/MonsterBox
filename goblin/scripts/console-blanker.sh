#!/bin/bash
# console-blanker.sh - Continuously blank the console to prevent CLI visibility
# This runs as a separate systemd service to ensure console stays blanked
# even between MPV process transitions

set -euo pipefail

echo "Console blanker started - keeping tty1 blank"

# Function to blank the console
blank_console() {
    # Blank screen and hide cursor
    setterm -blank force -cursor off >/dev/tty1 2>/dev/null || true
    # Clear screen and hide cursor via ANSI codes
    printf "\033[2J\033[H\033[?25l" >/dev/tty1 2>/dev/null || true
    # Fill with black
    printf "\033[40m\033[2J" >/dev/tty1 2>/dev/null || true
}

# Initial blanking
blank_console

# Continuously blank every 2 seconds to handle any console output
while true; do
    sleep 2
    blank_console
done
