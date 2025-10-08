#!/bin/bash
# Bring up Skulltalker (4), Coffin (2), and PumpkinHead (1)
# Uses hostnames by default per ops convention, but accepts IP overrides via env.
# XI_API_KEY environment variable propagates to set ElevenLabs key on each target.
#
# Usage:
#   ./scripts/bringup-all-animatronics.sh [--dry-run]
# Example:
#   XI_API_KEY="sk_..." ./scripts/bringup-all-animatronics.sh

set -e
DRY=""
if [ "$1" = "--dry-run" ]; then DRY="--dry-run"; fi

# Defaults from README
PUMPKIN_HOST=${PUMPKIN_HOST:-pumpkinhead}
COFFIN_HOST=${COFFIN_HOST:-coffin}
SKULL_HOST=${SKULL_HOST:-skulltalker}

# If you prefer IPs, export env vars:
#   export PUMPKIN_HOST=192.168.8.150; export COFFIN_HOST=192.168.8.140; export SKULL_HOST=192.168.8.130

run(){ echo "\n=== $* ==="; bash -lc "$*"; }

# Skulltalker (4)
run "XI_API_KEY='${XI_API_KEY}' ./scripts/bringup-animatronic.sh ${SKULL_HOST} 4 ${DRY}"

# Coffin (2)
run "XI_API_KEY='${XI_API_KEY}' ./scripts/bringup-animatronic.sh ${COFFIN_HOST} 2 ${DRY}"

# PumpkinHead (1)
run "XI_API_KEY='${XI_API_KEY}' ./scripts/bringup-animatronic.sh ${PUMPKIN_HOST} 1 ${DRY}"

echo "\nAll bring-up calls issued. Review output above for each device."

