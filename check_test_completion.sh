#!/bin/bash
exec > test_completion_check.txt 2>&1

echo "=== Checking if tests are complete ==="
echo "Date: $(date)"
echo ""

# Check for running playwright/node processes
echo "=== Running test processes ==="
ps aux | grep -E "(playwright|node.*test)" | grep -v grep | wc -l
echo ""

# Check port 3000
echo "=== Port 3000 status ==="
lsof -i:3000 | wc -l
echo ""

# Check test-results directory for recent files
echo "=== Recent test result files ==="
find test-results -name "*.webm" -o -name "*.png" | head -5
echo ""

# Try to parse the report if it exists
echo "=== Attempting to read report stats ==="
if [ -f playwright-report/report.json ]; then
  cat playwright-report/report.json | grep -A 10 '"stats"' || echo "Could not parse stats"
fi

echo ""
echo "=== Done ==="

