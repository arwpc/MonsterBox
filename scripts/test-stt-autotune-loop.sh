#!/bin/bash
#
# STT Autotune Test Loop
# Runs the mic-stt-vad-autotune test multiple times and tracks success rate
#

set -e

# Configuration
RUNS=${1:-10}
TIMEOUT=240000
TEST_FILE="tests/playwright/mic-stt-vad-autotune.spec.js"
RESULTS_DIR="/tmp/stt-autotune-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$RESULTS_DIR/test-run-$TIMESTAMP.log"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p "$RESULTS_DIR"

echo "========================================" | tee -a "$LOG_FILE"
echo "STT Autotune Test Loop" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Runs: $RUNS" | tee -a "$LOG_FILE"
echo "Timeout: ${TIMEOUT}ms" | tee -a "$LOG_FILE"
echo "Test: $TEST_FILE" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Initialize counters
PASSED=0
FAILED=0
TOTAL=0

# Run tests
for i in $(seq 1 $RUNS); do
    TOTAL=$((TOTAL + 1))
    RUN_LOG="$RESULTS_DIR/run-${i}-${TIMESTAMP}.log"
    
    echo -e "${YELLOW}[Run $i/$RUNS]${NC} Starting test..." | tee -a "$LOG_FILE"
    START_TIME=$(date +%s)
    
    # Run the test
    BASE_URL=http://orlok:3000 MB_E2E=1 PW_CLEAN_SERVER=0 \
        npx playwright test -c playwright.config.ts \
        "$TEST_FILE" \
        --project=firefox \
        --reporter=list \
        --retries=0 \
        --timeout=$TIMEOUT \
        2>&1 | tee "$RUN_LOG"

    TEST_EXIT_CODE=$?
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # Check if test passed by looking for "passed" in output and exit code
    if [ $TEST_EXIT_CODE -eq 0 ] && grep -q "passed" "$RUN_LOG"; then
        PASSED=$((PASSED + 1))
        echo -e "${GREEN}[Run $i/$RUNS] ✅ PASSED${NC} (${DURATION}s)" | tee -a "$LOG_FILE"
    else
        FAILED=$((FAILED + 1))
        echo -e "${RED}[Run $i/$RUNS] ❌ FAILED${NC} (${DURATION}s)" | tee -a "$LOG_FILE"

        # Extract error if available
        if grep -q "Error:" "$RUN_LOG"; then
            echo "  Error: $(grep -m 1 'Error:' "$RUN_LOG")" | tee -a "$LOG_FILE"
        elif grep -q "TimeoutError:" "$RUN_LOG"; then
            echo "  Error: Timeout waiting for STT recognition" | tee -a "$LOG_FILE"
        fi
    fi
    
    # Show running stats
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo "  Stats: $PASSED passed, $FAILED failed, $SUCCESS_RATE% success rate" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    
    # Small delay between runs
    if [ $i -lt $RUNS ]; then
        sleep 2
    fi
done

# Final summary
echo "========================================" | tee -a "$LOG_FILE"
echo "FINAL RESULTS" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Total Runs:    $TOTAL" | tee -a "$LOG_FILE"
echo "Passed:        $PASSED" | tee -a "$LOG_FILE"
echo "Failed:        $FAILED" | tee -a "$LOG_FILE"

SUCCESS_RATE=$((PASSED * 100 / TOTAL))
echo "Success Rate:  $SUCCESS_RATE%" | tee -a "$LOG_FILE"

if [ $SUCCESS_RATE -ge 75 ]; then
    echo -e "${GREEN}✅ SUCCESS: Achieved 75%+ success rate!${NC}" | tee -a "$LOG_FILE"
    EXIT_CODE=0
elif [ $SUCCESS_RATE -ge 50 ]; then
    echo -e "${YELLOW}⚠️  PARTIAL: 50-74% success rate${NC}" | tee -a "$LOG_FILE"
    EXIT_CODE=1
else
    echo -e "${RED}❌ FAILED: Below 50% success rate${NC}" | tee -a "$LOG_FILE"
    EXIT_CODE=2
fi

echo "Completed: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Full log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Individual run logs: $RESULTS_DIR/run-*-${TIMESTAMP}.log" | tee -a "$LOG_FILE"

exit $EXIT_CODE

