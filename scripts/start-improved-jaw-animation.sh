#!/bin/bash

# Start Improved Jaw Animation System
# This script starts the jaw animation system with all the new improvements

echo "🦴 Starting Improved Jaw Animation System..."
echo "================================================"

# Check if we're on a Raspberry Pi
if command -v gpio &> /dev/null; then
    echo "✅ Raspberry Pi detected - GPIO available"
    GPIO_AVAILABLE=true
else
    echo "⚠️  Not on Raspberry Pi - Running in simulation mode"
    GPIO_AVAILABLE=false
fi

# Set default GPIO pin for jaw servo
SERVO_PIN=${1:-18}
SERVO_PORT=${2:-8765}

echo "🔧 Configuration:"
echo "   Servo GPIO Pin: $SERVO_PIN"
echo "   WebSocket Port: $SERVO_PORT"
echo "   Improvements Enabled:"
echo "     ✅ Servo jitter reduction (0.5° deadband)"
echo "     ✅ PWM idle state management"
echo "     ✅ Speech frequency filtering (300-3400Hz)"
echo "     ✅ Enhanced attack/release timing (50ms/150ms)"
echo "     ✅ 60Hz update rate"
echo "     ✅ RMS volume calculation"
echo ""

# Start the GPIO jaw server with improvements
echo "🚀 Starting GPIO Jaw Server..."
cd /home/remote/MonsterBox

if [ "$GPIO_AVAILABLE" = true ]; then
    echo "Starting with GPIO support on pin $SERVO_PIN..."
    python3 scripts/chatterpi/gpio_jaw_server.py --pin $SERVO_PIN --port $SERVO_PORT
else
    echo "Starting in simulation mode..."
    python3 scripts/chatterpi/gpio_jaw_server.py --pin $SERVO_PIN --port $SERVO_PORT --simulate
fi
