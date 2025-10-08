#!/usr/bin/env bash
set -euo pipefail

# Disable random poses on all animatronics via orchestration API
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-3000}

echo "Disabling random poses on all animatronics (${HOST}:${PORT})..."

curl -sS -X POST "http://${HOST}:${PORT}/api/orchestration/disable-random-poses" | sed -n '1,200p'

echo "Done."

