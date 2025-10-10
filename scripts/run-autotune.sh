#!/usr/bin/env bash
set -euo pipefail

# MonsterBox 5.1 - Autotune Mic/STT/VAD runner (Orlok)
# Usage: ./scripts/run-autotune.sh [BASE_URL]
# Defaults to http://127.0.0.1:3000. Run on the Orlok Pi for production hardware.

BASE_URL="${1:-http://127.0.0.1:3000}"
export BASE_URL
export MB_E2E=1
export PW_CLEAN_SERVER=0

# Ensure server is running on the device before executing this
node -v >/dev/null 2>&1 || { echo "Node.js not found"; exit 1; }

# Run only the autotune test with Firefox project
npx playwright test -c playwright.config.ts tests/playwright/mic-stt-vad-autotune.spec.js \
  --project=firefox --reporter=list --retries=0

