#!/usr/bin/env bash
set -euo pipefail

# Enable random poses on all animatronics via orchestration API
# Usage:
#   COOLDOWN_MS=3000 MIN_AMP=0.2 MAX_AMP=0.5 ./scripts/enable-random-poses-all.sh
# Defaults: COOLDOWN_MS=3000, MIN_AMP=0.2, MAX_AMP=0.5

COOLDOWN_MS=${COOLDOWN_MS:-3000}
MIN_AMP=${MIN_AMP:-0.2}
MAX_AMP=${MAX_AMP:-0.5}
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-3000}

echo "Enabling random poses on all animatronics (${HOST}:${PORT})..."

curl -sS -X POST "http://${HOST}:${PORT}/api/orchestration/enable-random-poses" \
  -H "Content-Type: application/json" \
  -d "{\"cooldownMs\":${COOLDOWN_MS},\"minAmplitude\":${MIN_AMP},\"maxAmplitude\":${MAX_AMP}}" | sed -n '1,200p'

echo "Done."

