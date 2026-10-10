#!/usr/bin/env bash
# Push one character's SHOW (poses.json + scenes.json + its TTS cache) from this repo to that character's own node,
# point the node's lurk-scene rotation at the two silent lurk pieces, restart the service there and prove it.
#
# Scenes and poses are node-local and deliberately excluded from `deploy-to-animatronic.sh`, so a rebuilt show
# travels only this way. Run AFTER the code deploy (the validator and the fleet step types must already be there).
#
#   scripts/push-show.sh <characterId> <ip> [--no-restart] [--dry-run]
#
# Locked characters: this copies files directly (the app's lock refuses only app writes), so refresh the lock
# fingerprints on the node afterwards (`node scripts/character-lock.mjs refresh <id>` there) and run
# `npm run lock:verify` — the script prints both.
set -u
CHAR="${1:-}"; IP="${2:-}"; shift 2 || true
RESTART=1; DRY=0
for a in "$@"; do case "$a" in --no-restart) RESTART=0;; --dry-run) DRY=1;; esac; done
[ -z "$CHAR" ] || [ -z "$IP" ] && { echo "usage: $0 <characterId> <ip> [--no-restart] [--dry-run]" >&2; exit 2; }
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/data/character-$CHAR"
REMOTE_USER="${MB_SSH_USER:-remote}"
REMOTE="/home/$REMOTE_USER/MonsterBox"
# Key trust is the norm; a node without it (a freshly replaced Pi) takes the fleet password through sshpass -e
# (the env var, never argv), the same way deploy-to-animatronic.sh does.
if [ -n "${MONSTERBOX_SSH_PASSWORD:-}" ] && ! ssh -o BatchMode=yes -o ConnectTimeout=6 "$REMOTE_USER@$IP" true 2>/dev/null; then
  export SSHPASS="$MONSTERBOX_SSH_PASSWORD"; PW="sshpass -e"; BATCH="-o BatchMode=no"
else
  PW=""; BATCH="-o BatchMode=yes"
fi
SSH="$PW ssh $BATCH -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new $REMOTE_USER@$IP"
TS="$(date +%Y%m%dT%H%M%S)"
say() { printf '== %s\n' "$*"; }

[ -f "$SRC/poses.json" ] && [ -f "$SRC/scenes.json" ] || { echo "no poses.json/scenes.json under $SRC" >&2; exit 1; }
say "character $CHAR → $IP ($(python3 -c "import json;print(len(json.load(open('$SRC/scenes.json'))['scenes']) if isinstance(json.load(open('$SRC/scenes.json')),dict) else len(json.load(open('$SRC/scenes.json'))))" 2>/dev/null || echo '?') scenes)"
$SSH "curl -sk -m 5 https://localhost:3000/health" >/dev/null 2>&1 || { echo "   ! $IP does not answer /health; aborting" >&2; exit 1; }

if [ "$DRY" = 1 ]; then
  say "dry-run: would back up, copy poses.json/scenes.json and data/tts-cache/$CHAR/, write lurk-scenes-state sceneIds [1,2], restart, verify"
  rsync -rnc --itemize-changes "$SRC/poses.json" "$SRC/scenes.json" "$REMOTE_USER@$IP:$REMOTE/data/character-$CHAR/" 2>&1 | sed 's/^/   /'
  exit 0
fi

say "backup on the node → data/character-$CHAR/backups/*.pre-push-$TS.json"
$SSH "mkdir -p $REMOTE/data/character-$CHAR/backups && cd $REMOTE/data/character-$CHAR && for f in poses scenes; do [ -f \$f.json ] && cp \$f.json backups/\$f.pre-push-$TS.json; done; ls backups | tail -2 | sed 's/^/   /'"

say "copy show files"
$PW scp -q $BATCH "$SRC/poses.json" "$SRC/scenes.json" "$REMOTE_USER@$IP:$REMOTE/data/character-$CHAR/" && echo "   poses.json, scenes.json copied"
if [ -d "$REPO/data/tts-cache/$CHAR" ]; then
  $PW rsync -a --itemize-changes -e "ssh $BATCH" "$REPO/data/tts-cache/$CHAR/" "$REMOTE_USER@$IP:$REMOTE/data/tts-cache/$CHAR/" | grep -c '^>f' | sed 's/^/   tts-cache clips copied: /'
fi

say "lurk rotation → the two silent lurk pieces (1, 2), rotation stays OFF unless the operator enables it"
$SSH "cd $REMOTE && node -e '
const fs=require(\"fs\"); const p=\"data/character-$CHAR/lurk-scenes-state.json\";
let s={}; try { s=JSON.parse(fs.readFileSync(p,\"utf8\")); } catch {}
const before=JSON.stringify(s.sceneIds||[]);
s={ enabled: false, intervalMs: s.intervalMs||240000, jitterPct: s.jitterPct??25, quietHours: s.quietHours||{start:\"23:00\",end:\"08:00\"}, ...s, sceneIds:[\"1\",\"2\"], enabled:false };
fs.writeFileSync(p, JSON.stringify(s,null,2)+\"\\n\"); console.log(\"   sceneIds\", before, \"->\", JSON.stringify(s.sceneIds), \"enabled:\", s.enabled);'"

if [ "$RESTART" = 1 ]; then
  say "restart monsterbox.service on $IP"
  $SSH "sudo systemctl restart monsterbox.service"
  for i in $(seq 1 40); do sleep 2; if $SSH "curl -sk -m 3 https://localhost:3000/health" 2>/dev/null | grep -q '"OK"'; then echo "   healthy after $((i*2)) s"; break; fi; [ "$i" = 40 ] && echo "   ! not healthy after 80 s"; done
fi

say "prove on the node"
$SSH "cd $REMOTE && node scripts/validate-scenes.mjs $CHAR 2>&1 | tail -2 | sed 's/^/   /'; \
  curl -sk -m 8 'https://localhost:3000/scenes/api/?characterId=$CHAR' | node -e 'let b=\"\";process.stdin.on(\"data\",d=>b+=d).on(\"end\",()=>{const d=JSON.parse(b);console.log(\"   scenes served:\",(d.scenes||[]).map(s=>s.id).join(\",\"))})'; \
  curl -sk -m 8 'https://localhost:3000/poses/api/poses?characterId=$CHAR' | node -e 'let b=\"\";process.stdin.on(\"data\",d=>b+=d).on(\"end\",()=>{try{const d=JSON.parse(b);const p=d.poses||d;console.log(\"   poses served:\",Array.isArray(p)?p.length:\"?\")}catch{console.log(\"   poses: no JSON\")}})'; \
  curl -sk -m 8 'https://localhost:3000/conversation/api/lurk-state' | head -c 160; echo; \
  curl -sk -m 8 -X POST -H 'Content-Type: application/json' -d '{\"enabled\":false}' https://localhost:3000/conversation/api/callouts >/dev/null && echo '   callouts off'; \
  curl -sk -m 8 -X POST -H 'Content-Type: application/json' -d '{\"enabled\":false}' https://localhost:3000/conversation/api/lurk-scenes >/dev/null && echo '   lurk scenes off'; \
  if node scripts/character-lock.mjs status 2>/dev/null | grep -q \"id $CHAR)\"; then echo '   locked character: refreshing fingerprints on this node'; node scripts/character-lock.mjs refresh $CHAR 2>&1 | sed 's/^/   /'; npm run -s lock:verify 2>&1 | tail -3 | sed 's/^/   /'; fi"
say "done: character $CHAR show is on $IP"
