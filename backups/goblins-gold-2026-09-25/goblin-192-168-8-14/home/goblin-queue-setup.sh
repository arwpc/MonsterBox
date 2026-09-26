#!/usr/bin/env bash
set -euo pipefail
cd /home/remote/goblin/media/video
ls -1 *.mp4 2>/dev/null | sed -n '1,5p' > /tmp/goblin_files.txt || true
COUNT=
if [ 0 -eq 0 ]; then echo NO_FILES_FOUND && exit 0; fi
curl -sS -X POST http://127.0.0.1:3001/queue/clear >/dev/null || true
while IFS= read -r f; do
  [ -z  ] && continue
  printf '{filename:%s}'  > /tmp/add.json
  echo Adding 
  curl -sS -X POST http://127.0.0.1:3001/queue/add -H 'Content-Type: application/json' --data-binary @/tmp/add.json >/dev/null || true
done < /tmp/goblin_files.txt
printf '{loopMode:queue}' > /tmp/start.json
curl -sS -X POST http://127.0.0.1:3001/queue/start -H 'Content-Type: application/json' --data-binary @/tmp/start.json >/dev/null || true
sleep 1
curl -sS http://127.0.0.1:3001/queue || true
