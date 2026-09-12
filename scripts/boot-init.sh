#!/usr/bin/env bash
set -euo pipefail

# This script runs shortly after MonsterBox boots to apply default runtime settings
# - Enable random poses on the local device
# - Optionally adjust mic gain via API in the future

PORT=${PORT:-3000}
BASE="https://127.0.0.1:${PORT}"

# Wait for MonsterBox HTTP to be ready
for i in {1..30}; do
  if curl -skS "${BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Small additional delay to ensure routes are live
sleep 3

# Enable random poses with safe defaults, ON THIS NODE ONLY.
#
# This MUST be the node-local /api/random-poses/enable, never the orchestration
# route /api/orchestration/enable-random-poses. That orchestration route maps over
# orchestrationService.animatronics and fans out to EVERY animatronic in the fleet
# (routes/api/orchestrationRoutes.js), so with this script on monsterbox-init.service
# every single boot of any one node armed random motion on all of them -- including
# Orlok's shared elbow/forearm rail and Sir Dragomir's 900-degree multi-turn neck,
# unattended. Caught 2026-08-30 when a node reboot armed all five (no pose had fired
# yet: lastPoseTime was still 0 everywhere).
#
# No characterId is sent on purpose: the node-local route falls back to
# resolveCharacter(req), which picks this node's own selected character.
curl -skS -X POST "${BASE}/api/random-poses/enable" \
  -H "Content-Type: application/json" \
  --data '{"cooldownMs":3000,"minAmplitude":0.2,"maxAmplitude":0.5}' \
  || true

echo "boot-init complete"
