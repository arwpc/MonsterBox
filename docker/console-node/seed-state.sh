#!/usr/bin/env bash
# One-time: give the console container its own state, selected to character 7 (Alpha): data/ and
# config/ go into <state>/tree (the tree scripts/deploy-console-node.sh keeps in step with the
# fleet's code), certs/ into <state>/certs. Never overwrites existing state; rerun is a no-op.
#   bash docker/console-node/seed-state.sh [state-dir]      (default ~/monsterbox-console)
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
STATE=${1:-${MB_CONSOLE_STATE:-$HOME/monsterbox-console}}
CHAR=${MB_CONSOLE_CHARACTER:-7}
mkdir -p "$STATE"
mkdir -p "$STATE/tree"
for d in data config; do
  if [ -e "$STATE/tree/$d" ]; then echo "keep   $STATE/tree/$d (already there)"; else cp -a "$REPO/$d" "$STATE/tree/$d"; echo "copied $d -> $STATE/tree/$d"; fi
done
if [ -e "$STATE/certs" ]; then echo "keep   $STATE/certs (already there)"; else cp -a "$REPO/certs" "$STATE/certs"; echo "copied certs -> $STATE/certs"; fi
node -e "
const fs=require('fs');const p='$STATE/tree/config/app-config.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));c.selectedCharacter=$CHAR;c.dataPath='data/character-$CHAR';
fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log('selected character', c.selectedCharacter, 'in', p);"
