#!/usr/bin/env bash
set -euo pipefail

# This script runs shortly after MonsterBox boots to apply default runtime settings
# - Enable random poses on the local device
# - Optionally adjust mic gain via API in the future

PORT=${PORT:-3000}
BASE="http://127.0.0.1:${PORT}"

# Wait for MonsterBox HTTP to be ready
for i in {1..30}; do
  if curl -sS "${BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Small additional delay to ensure routes are live
sleep 3

# Enable random poses with safe defaults
curl -sS -X POST "${BASE}/api/orchestration/enable-random-poses" \
  -H "Content-Type: application/json" \
  --data '{"cooldownMs":3000,"minAmplitude":0.2,"maxAmplitude":0.5}' \
  || true

echo "boot-init complete"
