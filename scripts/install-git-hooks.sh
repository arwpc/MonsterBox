#!/usr/bin/env bash
set -euo pipefail
# Install a lightweight pre-push hook to run self-improvement tests
HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-push"
mkdir -p "$HOOK_DIR"
cat > "$HOOK_FILE" <<'EOF'
#!/usr/bin/env bash
# Run only the self-improvement tests before pushing (fast)
if command -v npm >/dev/null 2>&1; then
  echo "🧠 Harvesting common issues (pre-push)..."
  npm run -s self:harvest || true
  echo "🔍 Running self-improvement tests (pre-push)..."
  if ! npm run -s test:self-improvement; then
    echo "❌ Self-improvement tests failed. Aborting push." >&2
    exit 1
  fi
fi
exit 0
EOF
chmod +x "$HOOK_FILE"
echo "✅ Installed pre-push hook to run self-improvement tests"

