#!/bin/bash

# MonsterBox Comprehensive RPI4b Testing Script
# Run this on Orlok RPI4b after deployment to verify all functionality

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create log directory
LOG_DIR="./test-logs-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}🎃 MonsterBox Comprehensive RPI4b Testing${NC}"
echo -e "${BLUE}===========================================${NC}"
echo "Log directory: $LOG_DIR"
echo ""

# Function to run test and log results
run_test() {
    local test_name="$1"
    local test_command="$2"
    local log_file="$LOG_DIR/${test_name}.log"
    
    echo -e "${YELLOW}Running: $test_name${NC}"
    echo "Command: $test_command"
    echo "Log: $log_file"
    
    if eval "$test_command" > "$log_file" 2>&1; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        echo ""
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        echo "Check log: $log_file"
        echo ""
    fi
}

# Phase 1: Environment Setup
echo -e "${BLUE}Phase 1: Environment Setup${NC}"
run_test "01-npm-install" "npm install"
run_test "02-config-check" "npm run check-config"

# Phase 2: Core System Testing  
echo -e "${BLUE}Phase 2: Core System Testing${NC}"
run_test "03-rpi-dependencies" "npm run test:rpi"
run_test "04-api-keys" "npm run check-api-keys"
run_test "05-api-keys-verbose" "npm run test:api-keys-verbose"

# Phase 3: Hardware Testing
echo -e "${BLUE}Phase 3: Hardware-Specific Testing${NC}"
run_test "06-sound-system" "npm run test:sound"
run_test "07-animatronic-systems" "npm run animatronic:test-all"

# Phase 4: MCP & Log Collection
echo -e "${BLUE}Phase 4: MCP & Log Collection Testing${NC}"
run_test "08-mcp-setup" "npm run test:mcp"
run_test "09-mcp-remote" "npm run test:mcp-remote"
run_test "10-fluent-bit" "npm run test:fluent-bit"
run_test "11-rpi-logs" "npm run collect:rpi-logs"

# Phase 5: Security Testing
echo -e "${BLUE}Phase 5: Security & SSH Testing${NC}"
run_test "12-security-suite" "npm run test:security"
run_test "13-ssh-connectivity" "npm run test:animatronic-ssh"

# Phase 6: Full Test Suite
echo -e "${BLUE}Phase 6: Complete Test Suite${NC}"
run_test "14-full-test-suite" "npm test"

# Phase 7: System Information Collection
echo -e "${BLUE}Phase 7: System Information${NC}"
run_test "15-system-info" "uname -a && cat /proc/cpuinfo | head -20 && free -h && df -h"
run_test "16-gpio-status" "python3 scripts/test_gpio.py status"
run_test "17-service-status" "systemctl status monsterbox nginx ssh fluent-bit --no-pager"

# Generate summary report
echo -e "${BLUE}Generating Test Summary...${NC}"
SUMMARY_FILE="$LOG_DIR/test-summary.txt"

echo "MonsterBox RPI4b Test Summary" > "$SUMMARY_FILE"
echo "=============================" >> "$SUMMARY_FILE"
echo "Date: $(date)" >> "$SUMMARY_FILE"
echo "Host: $(hostname)" >> "$SUMMARY_FILE"
echo "User: $(whoami)" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# Count passed/failed tests
PASSED_COUNT=$(find "$LOG_DIR" -name "*.log" -exec grep -l "✅\|PASSED\|SUCCESS" {} \; | wc -l)
TOTAL_COUNT=$(find "$LOG_DIR" -name "*.log" | wc -l)
FAILED_COUNT=$((TOTAL_COUNT - PASSED_COUNT))

echo "Test Results:" >> "$SUMMARY_FILE"
echo "Total Tests: $TOTAL_COUNT" >> "$SUMMARY_FILE"
echo "Passed: $PASSED_COUNT" >> "$SUMMARY_FILE"
echo "Failed: $FAILED_COUNT" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# List all log files
echo "Generated Log Files:" >> "$SUMMARY_FILE"
ls -la "$LOG_DIR"/*.log >> "$SUMMARY_FILE"

echo -e "${GREEN}🎉 Testing Complete!${NC}"
echo -e "${GREEN}Summary: $SUMMARY_FILE${NC}"
echo -e "${GREEN}All logs: $LOG_DIR/${NC}"

# Display quick summary
echo ""
echo -e "${BLUE}Quick Summary:${NC}"
echo "Total Tests: $TOTAL_COUNT"
echo "Passed: $PASSED_COUNT"
echo "Failed: $FAILED_COUNT"

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed. Check logs in $LOG_DIR${NC}"
fi
