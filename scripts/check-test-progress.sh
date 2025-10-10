#!/bin/bash
#
# Check STT Test Progress
# Monitors the current test run and displays progress
#

# Find the most recent test log
LATEST_LOG=$(ls -t /tmp/stt-autotune-results/test-run-*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
    echo "No test runs found in /tmp/stt-autotune-results/"
    exit 1
fi

echo "========================================="
echo "STT Test Progress Monitor"
echo "========================================="
echo "Log file: $LATEST_LOG"
echo ""

# Extract key information
TOTAL_RUNS=$(grep "^Runs:" "$LATEST_LOG" | awk '{print $2}')
PASSED=$(grep -c "✅ PASSED" "$LATEST_LOG" || echo "0")
FAILED=$(grep -c "❌ FAILED" "$LATEST_LOG" || echo "0")
COMPLETED=$((PASSED + FAILED))

if [ "$COMPLETED" -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / COMPLETED))
else
    SUCCESS_RATE=0
fi

echo "Progress: $COMPLETED / $TOTAL_RUNS runs completed"
echo "Passed:   $PASSED"
echo "Failed:   $FAILED"
echo "Success:  $SUCCESS_RATE%"
echo ""

# Show last few lines
echo "========================================="
echo "Recent output:"
echo "========================================="
tail -20 "$LATEST_LOG"
echo ""

# Check if test is still running
if pgrep -f "playwright.*mic-stt-vad-autotune" > /dev/null; then
    echo "Status: ✅ Test is currently running"
else
    echo "Status: ⏸️  No test currently running"
fi

