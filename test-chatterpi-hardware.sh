#!/bin/bash
echo "🎃 Agent 2: ChatterPi Hardware Test Suite for Skulltalker RPI4b"
echo "=================================================================="

# Test 1: Check if MonsterBox is running
echo "🔍 Test 1: Checking MonsterBox application status..."
if curl -s http://192.168.8.130:3000 > /dev/null; then
    echo "✅ MonsterBox application is running on port 3000"
else
    echo "❌ MonsterBox application is not accessible"
fi

# Test 2: Check ChatterPi Chat page
echo "🔍 Test 2: Checking ChatterPi Chat page..."
if curl -s http://192.168.8.130:3000/chatterpi-chat.html > /dev/null; then
    echo "✅ ChatterPi Chat page is accessible"
else
    echo "❌ ChatterPi Chat page is not accessible"
fi

# Test 3: Check WebSocket jaw animation endpoint
echo "🔍 Test 3: Testing WebSocket jaw animation endpoint..."
if curl -s -I http://192.168.8.130:3000/jaw-animation | grep -q "101\|200"; then
    echo "✅ Jaw animation WebSocket endpoint is available"
else
    echo "❌ Jaw animation WebSocket endpoint is not available"
fi

# Test 4: Check GPIO pin 18 availability (jaw servo)
echo "🔍 Test 4: Checking GPIO pin 18 (jaw servo) status..."
ssh remote@192.168.8.130 'gpio mode 18 pwm 2>/dev/null && echo "✅ GPIO pin 18 is available for PWM" || echo "❌ GPIO pin 18 is not available"'

# Test 5: Test jaw movement command via WebSocket
echo "🔍 Test 5: Testing jaw movement via WebSocket..."
ssh remote@192.168.8.130 'timeout 5 python3 -c "
import asyncio
import websockets
import json

async def test_jaw():
    try:
        uri = \"ws://localhost:3000/jaw-animation\"
        async with websockets.connect(uri) as websocket:
            # Send jaw movement command
            command = {
                \"type\": \"jaw_move\",
                \"angle\": 30,
                \"duration\": 1.0,
                \"curve_type\": \"linear\"
            }
            await websocket.send(json.dumps(command))
            response = await websocket.recv()
            print(\"✅ Jaw WebSocket test successful:\", response)
    except Exception as e:
        print(\"❌ Jaw WebSocket test failed:\", str(e))

asyncio.run(test_jaw())
" 2>/dev/null || echo "❌ WebSocket jaw test failed"'

# Test 6: Check system resources
echo "🔍 Test 6: Checking system resources..."
ssh remote@192.168.8.130 'echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk "{print \$2}" | cut -d"%" -f1)%"'
ssh remote@192.168.8.130 'echo "Memory Usage: $(free | grep Mem | awk "{printf \"%.1f%%\", \$3/\$2 * 100.0}")"'
ssh remote@192.168.8.130 'echo "Temperature: $(vcgencmd measure_temp 2>/dev/null || echo "N/A")"'

# Test 7: Check audio system
echo "🔍 Test 7: Checking audio system..."
ssh remote@192.168.8.130 'aplay -l 2>/dev/null | grep -q "card" && echo "✅ Audio devices available" || echo "❌ No audio devices found"'

# Test 8: Test ChatterPi AI integration
echo "🔍 Test 8: Testing ChatterPi AI integration..."
if curl -s -X POST http://192.168.8.130:3000/api/chatterpi/chat \
   -H "Content-Type: application/json" \
   -d '{"message":"Hello, test message","characterId":"orlok"}' | grep -q "response"; then
    echo "✅ ChatterPi AI integration is working"
else
    echo "❌ ChatterPi AI integration test failed"
fi

echo "=================================================================="
echo "🎃 Agent 2: ChatterPi Hardware Test Suite Complete"
echo "=================================================================="
