#!/usr/bin/env bash
# One-time: give the console container its own copy of data/, config/ and certs/, selected to
# character 7 (Alpha). Never overwrites existing state; rerun is a no-op.
#   bash docker/console-node/seed-state.sh [state-dir]      (default ~/monsterbox-console)
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
STATE=${1:-${MB_CONSOLE_STATE:-$HOME/monsterbox-console}}
CHAR=${MB_CONSOLE_CHARACTER:-7}
mkdir -p "$STATE"
for d in data config certs; do
  if [ -e "$STATE/$d" ]; then echo "keep   $STATE/$d (already there)"; else cp -a "$REPO/$d" "$STATE/$d"; echo "copied $d -> $STATE/$d"; fi
done
node -e "
const fs=require('fs');const p='$STATE/config/app-config.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));c.selectedCharacter=$CHAR;c.dataPath='data/character-$CHAR';
fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log('selected character', c.selectedCharacter, 'in', p);"
