#!/bin/bash

# Test script for Groundbreaker BTS7960 motor
# Wiring: EN=GPIO17, RPWM=GPIO27, LPWM=GPIO22
# Usage: bash scripts/test-groundbreaker-motor.sh

echo "🤖 Groundbreaker Motor Test Script"
echo "===================================="
echo ""
echo "BTS7960 Configuration:"
echo "  EN Pin:   GPIO 17 (Pin 11, Brown)"
echo "  RPWM Pin: GPIO 27 (Pin 13, Red)"
echo "  LPWM Pin: GPIO 22 (Pin 15, Orange)"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_WRAPPER="$SCRIPT_DIR/../python_wrappers/linear_actuator_control_v2.py"

if [ ! -f "$PYTHON_WRAPPER" ]; then
    echo "❌ Error: Python wrapper not found at $PYTHON_WRAPPER"
    exit 1
fi

echo "✅ Found Python wrapper"
echo ""

# Test 1: Forward 15 seconds
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Forward for 15 seconds"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONFIG='{"controlBoard":"BTS7960","rpwmPin":27,"lpwmPin":22,"renPin":17,"lenPin":17,"direction":"forward","speed":100,"duration":15000}'
echo "Running: python3 $PYTHON_WRAPPER '$CONFIG'"
python3 "$PYTHON_WRAPPER" "$CONFIG"
echo ""
sleep 2

# Test 2: Reverse 15 seconds
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Reverse for 15 seconds"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONFIG='{"controlBoard":"BTS7960","rpwmPin":27,"lpwmPin":22,"renPin":17,"lenPin":17,"direction":"reverse","speed":100,"duration":15000}'
echo "Running: python3 $PYTHON_WRAPPER '$CONFIG'"
python3 "$PYTHON_WRAPPER" "$CONFIG"
echo ""
sleep 2

# Test 3: Forward 4 seconds
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Forward for 4 seconds"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONFIG='{"controlBoard":"BTS7960","rpwmPin":27,"lpwmPin":22,"renPin":17,"lenPin":17,"direction":"forward","speed":100,"duration":4000}'
echo "Running: python3 $PYTHON_WRAPPER '$CONFIG'"
python3 "$PYTHON_WRAPPER" "$CONFIG"
echo ""
sleep 2

# Test 4: Reverse 4 seconds
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Reverse for 4 seconds"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CONFIG='{"controlBoard":"BTS7960","rpwmPin":27,"lpwmPin":22,"renPin":17,"lenPin":17,"direction":"reverse","speed":100,"duration":4000}'
echo "Running: python3 $PYTHON_WRAPPER '$CONFIG'"
python3 "$PYTHON_WRAPPER" "$CONFIG"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

