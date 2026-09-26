#!/usr/bin/env bash
set -euo pipefail
# Reset queue storage fully
rm -f /home/remote/goblin/queue.json || true
systemctl restart goblin
sleep 2
# Clear any in-memory queue
curl -sS -X POST http://127.0.0.1:3001/queue/clear >/dev/null || true
# Add 5 halloween videos that should be present
curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' -d '{filename:fire.mp4}' >/dev/null
curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' -d '{filename:c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4}' >/dev/null
curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' -d '{filename:da542d7d-7b9c-415a-adb7-cc1b3c725b66.mp4}' >/dev/null
curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' -d '{filename:dad5cf71-097d-42a8-b310-fa6c95fd28e1.mp4}' >/dev/null
curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' -d '{filename:3929fd68-49cc-4349-a817-b00bc5e4c3d8.mp4}' >/dev/null
# Start queue in loop mode
curl -sS -X POST http://127.0.0.1:3001/queue/start -H 'Content-Type: application/json' -d '{loopMode:queue}' >/dev/null
sleep 1
curl -sS http://127.0.0.1:3001/queue || true
