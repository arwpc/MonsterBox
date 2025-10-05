#!/bin/bash
# Test all three linear actuators on Orlok
# - Left Arm (MDD10A): DIR=18, PWM=13
# - Right Arm (MDD10A): DIR=23, PWM=12
# - Loom Over (BTS7960): RPWM=19, LPWM=21, R_EN=5, L_EN=22

echo "🎃 Testing Orlok Linear Actuators 🎃"
echo "===================================="
echo ""

# Test duration and speed
DURATION=2000
SPEED=50

echo "Test parameters: Duration=${DURATION}ms, Speed=${SPEED}%"
echo ""

# Test 1: Left Arm (MDD10A)
echo "📍 Test 1: Left Arm (MDD10A - DIR=18, PWM=13)"
echo "   Testing FORWARD..."
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "MDD10A",
  "directionPin": 18,
  "pwmPin": 13,
  "direction": "forward",
  "speed": '${SPEED}',
  "duration": '${DURATION}'
}'

if [ $? -eq 0 ]; then
    echo "   ✅ Left Arm FORWARD test passed"
else
    echo "   ❌ Left Arm FORWARD test failed"
fi

sleep 2

echo "   Testing BACKWARD..."
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "MDD10A",
  "directionPin": 18,
  "pwmPin": 13,
  "direction": "backward",
  "speed": '${SPEED}',
  "duration": '${DURATION}'
}'

if [ $? -eq 0 ]; then
    echo "   ✅ Left Arm BACKWARD test passed"
else
    echo "   ❌ Left Arm BACKWARD test failed"
fi

sleep 2
echo ""

# Test 2: Right Arm (MDD10A)
echo "📍 Test 2: Right Arm (MDD10A - DIR=23, PWM=12)"
echo "   Testing FORWARD..."
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "MDD10A",
  "directionPin": 23,
  "pwmPin": 12,
  "direction": "forward",
  "speed": '${SPEED}',
  "duration": '${DURATION}'
}'

if [ $? -eq 0 ]; then
    echo "   ✅ Right Arm FORWARD test passed"
else
    echo "   ❌ Right Arm FORWARD test failed"
fi

sleep 2

echo "   Testing BACKWARD..."
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "MDD10A",
  "directionPin": 23,
  "pwmPin": 12,
  "direction": "backward",
  "speed": '${SPEED}',
  "duration": '${DURATION}'
}'

if [ $? -eq 0 ]; then
    echo "   ✅ Right Arm BACKWARD test passed"
else
    echo "   ❌ Right Arm BACKWARD test failed"
fi

sleep 2
echo ""

# Test 3: Loom Over (BTS7960)
echo "📍 Test 3: Loom Over (BTS7960 - RPWM=19, LPWM=21, R_EN=5, L_EN=22)"
echo "   Testing FORWARD..."
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "BTS7960",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "renPin": 5,
  "lenPin": 22,
  "direction": "forward",
  "speed": '${SPEED}',
  "duration": '${DURATION}'
}'

if [ $? -eq 0 ]; then
    echo "   ✅ Loom Over FORWARD test passed"
else
    echo "   ❌ Loom Over FORWARD test failed"
fi

sleep 2

echo "   Testing BACKWARD..."
python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "BTS7960",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "renPin": 5,
  "lenPin": 22,
  "direction": "backward",
  "speed": '${SPEED}',
  "duration": '${DURATION}'
}'

if [ $? -eq 0 ]; then
    echo "   ✅ Loom Over BACKWARD test passed"
else
    echo "   ❌ Loom Over BACKWARD test failed"
fi

echo ""
echo "===================================="
echo "✅ All tests completed!"
echo ""
echo "If you saw movement on all three actuators, the wiring is correct!"
echo "If any failed, check:"
echo "  - Wiring connections"
echo "  - Power supply to motor drivers"
echo "  - GPIO pin assignments"

