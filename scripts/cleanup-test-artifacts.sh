#!/bin/bash
#
# Cleanup Test Artifacts
# Removes orphaned test parts, old log files, and temporary test data
#

set -e

BASE_URL="${BASE_URL:-http://orlok:3000}"

echo "========================================"
echo "Cleaning up test artifacts"
echo "========================================"
echo ""

# 1. Delete orphaned "Auto Mic" test parts
echo "[1/4] Removing orphaned 'Auto Mic' test parts..."
PART_IDS=$(curl -s "$BASE_URL/setup/parts/api/parts" | \
  jq -r '.parts[] | select(.name | contains("Auto")) | select(.characterId == null) | .id' 2>/dev/null || echo "")

if [ -n "$PART_IDS" ]; then
  COUNT=0
  for ID in $PART_IDS; do
    echo "  Deleting part ID: $ID"
    curl -s -X DELETE "$BASE_URL/setup/parts/api/parts/$ID" > /dev/null
    COUNT=$((COUNT + 1))
  done
  echo "  ✅ Deleted $COUNT orphaned test parts"
else
  echo "  ✅ No orphaned test parts found"
fi
echo ""

# 2. Clean up old test log files
echo "[2/4] Removing old test log files..."
LOG_COUNT=0

# Remove old Playwright test logs
if [ -d "/tmp" ]; then
  find /tmp -name "test-*.log" -mtime +7 -delete 2>/dev/null || true
  find /tmp -name "playwright-*.log" -mtime +7 -delete 2>/dev/null || true
  find /tmp -name "mb-*.log" -mtime +7 -delete 2>/dev/null || true
  LOG_COUNT=$(find /tmp -name "*test*.log" -mtime +7 2>/dev/null | wc -l || echo 0)
fi

# Remove old STT autotune result logs (keep last 3 days)
if [ -d "/tmp/stt-autotune-results" ]; then
  find /tmp/stt-autotune-results -name "*.log" -mtime +3 -delete 2>/dev/null || true
fi

echo "  ✅ Cleaned up old log files"
echo ""

# 3. Clean up temporary test files
echo "[3/4] Removing temporary test files..."
rm -f /tmp/test-run-*.log 2>/dev/null || true
rm -f /tmp/run-tests.sh 2>/dev/null || true
rm -f /tmp/check-*.sh 2>/dev/null || true
rm -f /tmp/test-results.log 2>/dev/null || true
rm -f /tmp/final-results.txt 2>/dev/null || true
rm -f /tmp/results-output.txt 2>/dev/null || true
rm -f /tmp/test-status.txt 2>/dev/null || true
rm -f /tmp/timestamp.txt 2>/dev/null || true
rm -f /tmp/process-check.txt 2>/dev/null || true
rm -f /tmp/test-results-summary.txt 2>/dev/null || true
rm -f /tmp/stt-filter-test.log 2>/dev/null || true
rm -f /home/remote/MonsterBox/current-stt-config.json 2>/dev/null || true
rm -f /home/remote/MonsterBox/stt-filter-test-results.txt 2>/dev/null || true
rm -f /home/remote/MonsterBox/check_results.py 2>/dev/null || true
rm -f /home/remote/MonsterBox/check_processes.sh 2>/dev/null || true
rm -f /home/remote/MonsterBox/test-stt-filters.sh 2>/dev/null || true
rm -f /home/remote/MonsterBox/start-server-with-filters.sh 2>/dev/null || true
echo "  ✅ Removed temporary test files"
echo ""

# 4. Clean up old Playwright test results
echo "[4/4] Removing old Playwright test results..."
if [ -d "test-results" ]; then
  # Keep only the last 5 test result directories
  ls -dt test-results/playwright-* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
  RESULT_COUNT=$(ls -d test-results/playwright-* 2>/dev/null | wc -l || echo 0)
  echo "  ✅ Kept $RESULT_COUNT most recent test result directories"
else
  echo "  ✅ No test results directory found"
fi
echo ""

echo "========================================"
echo "Cleanup complete!"
echo "========================================"

