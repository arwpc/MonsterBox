#!/usr/bin/env bash
set -euo pipefail
printf '{filename:fire.mp4}' >/tmp/add.json
curl -sS -X POST http://127.0.0.1:3001/queue/clear >/dev/null || true
curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' --data-binary @/tmp/add.json
echo
curl -sS http://127.0.0.1:3001/queue || true
