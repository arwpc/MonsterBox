#!/usr/bin/env bash
# Install MonsterBox git hooks (pre-push gate).
# Idempotent — safe to run repeatedly. Called from install.sh.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SRC_DIR="$REPO_ROOT/scripts/git-hooks"
DEST_DIR="$REPO_ROOT/.git/hooks"

if [ ! -d "$DEST_DIR" ]; then
  echo "✗ $DEST_DIR does not exist — is this a git working tree?"
  exit 1
fi

for hook in pre-push; do
  src="$SRC_DIR/$hook"
  dest="$DEST_DIR/$hook"
  if [ ! -f "$src" ]; then continue; fi
  cp "$src" "$dest"
  chmod +x "$dest"
  echo "✓ Installed $hook → $dest"
done

echo ""
echo "Gate bypass: MB_SKIP_GATE=1 git push (use sparingly — CI still runs the gate)."
