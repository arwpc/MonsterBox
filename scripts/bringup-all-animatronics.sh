#!/bin/bash
# Bring up Sir Dragomir (4), Mina (2), and PumpkinHead (1)
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
MINA_HOST=${MINA_HOST:-mina}
DRAGOMIR_HOST=${DRAGOMIR_HOST:-sirdragomir}

# If you prefer IPs, export env vars:
#   export PUMPKIN_HOST=192.168.8.150; export MINA_HOST=192.168.8.140; export DRAGOMIR_HOST=192.168.8.130

run(){ echo "\n=== $* ==="; bash -lc "$*"; }

# Sir Dragomir (4)
run "XI_API_KEY='${XI_API_KEY}' ./scripts/bringup-animatronic.sh ${DRAGOMIR_HOST} 4 ${DRY}"

# Mina (2)
run "XI_API_KEY='${XI_API_KEY}' ./scripts/bringup-animatronic.sh ${MINA_HOST} 2 ${DRY}"

# PumpkinHead (1)
run "XI_API_KEY='${XI_API_KEY}' ./scripts/bringup-animatronic.sh ${PUMPKIN_HOST} 1 ${DRY}"

echo "\nAll bring-up calls issued. Review output above for each device."

