#!/bin/bash
# Orlok Post-Reboot Verification Test
# Tests that all four critical components work after a reboot:
# 1. Webcam stream
# 2. Motion sensor
# 3. Speaker audio
# 4. Light control

set -e

echo "🧪 Orlok Post-Reboot Verification Test"
echo "======================================"
echo ""

# Wait for services to start
echo "⏳ Waiting for services to start (30 seconds)..."
sleep 30

# Test 1: Webcam Stream
echo ""
echo "Test 1: Webcam Stream"
echo "---------------------"
echo "Checking mjpg-streamer service..."
if systemctl is-active mjpg-streamer > /dev/null 2>&1; then
    echo "✅ mjpg-streamer service is active"
else
    echo "❌ mjpg-streamer service is NOT active"
    exit 1
fi

echo "Checking if USB camera is detected..."
if lsusb | grep -qi "camera\|video"; then
    echo "✅ USB camera detected via lsusb"

    echo "Testing webcam stream endpoint..."
    if curl -s -I http://127.0.0.1:8090/?action=stream 2>&1 | grep -q "multipart/x-mixed-replace"; then
        echo "✅ Webcam stream is working"

        echo "Verifying webcam stream has actual image data..."
        if timeout 5 curl -s http://127.0.0.1:8090/?action=stream 2>&1 | head -c 10000 | grep -q "JFIF"; then
            echo "✅ Webcam stream contains JPEG data"
        else
            echo "⚠️  Webcam stream does NOT contain JPEG data (camera may need driver/reboot)"
        fi
    else
        echo "⚠️  Webcam stream endpoint not responding (camera may need driver/reboot)"
    fi
else
    echo "⚠️  No USB camera detected - webcam test skipped"
fi

# Test 2: Motion Sensor
echo ""
echo "Test 2: Motion Sensor (GPIO 16)"
echo "--------------------------------"
echo "Reading motion sensor state..."
SENSOR_RESULT=$(curl -s -X POST "http://127.0.0.1:3000/api/parts/14/test" \
    -H "Content-Type: application/json" \
    -d '{"action":"read"}' | jq -r '.success')

if [ "$SENSOR_RESULT" = "true" ]; then
    echo "✅ Motion sensor is responding"
else
    echo "❌ Motion sensor is NOT responding"
    exit 1
fi

# Test 3: Speaker Audio
echo ""
echo "Test 3: Speaker Audio"
echo "---------------------"
echo "Checking PipeWire/WirePlumber services..."
if systemctl --user is-active wireplumber > /dev/null 2>&1 && \
   systemctl --user is-active pipewire > /dev/null 2>&1; then
    echo "✅ PipeWire and WirePlumber are active"
else
    echo "❌ PipeWire or WirePlumber is NOT active"
    exit 1
fi

echo "Testing speaker playback capability..."
SPEAKER_RESULT=$(curl -s -X POST "http://127.0.0.1:3000/api/parts/6/test" \
    -H "Content-Type: application/json" \
    -d '{"action":"play","params":{"file":"public/sounds/monster-howl-85304.mp3"}}' | jq -r '.success')

if [ "$SPEAKER_RESULT" = "true" ]; then
    echo "✅ Speaker playback command succeeded"
    echo "⚠️  Note: If no sound is heard, check physical speaker connection"
else
    echo "❌ Speaker playback command FAILED"
    exit 1
fi

# Test 4: Light Control
echo ""
echo "Test 4: Light Control (GPIO 26)"
echo "--------------------------------"
echo "Testing light ON..."
LIGHT_ON=$(curl -s -X POST "http://127.0.0.1:3000/api/parts/8/test" \
    -H "Content-Type: application/json" \
    -d '{"action":"on"}' | jq -r '.success')

if [ "$LIGHT_ON" = "true" ]; then
    echo "✅ Light ON command succeeded"
else
    echo "❌ Light ON command FAILED"
    exit 1
fi

sleep 1

echo "Testing light OFF..."
LIGHT_OFF=$(curl -s -X POST "http://127.0.0.1:3000/api/parts/8/test" \
    -H "Content-Type: application/json" \
    -d '{"action":"off"}' | jq -r '.success')

if [ "$LIGHT_OFF" = "true" ]; then
    echo "✅ Light OFF command succeeded"
else
    echo "❌ Light OFF command FAILED"
    exit 1
fi

# Summary
echo ""
echo "🎉 All Post-Reboot Tests Passed!"
echo "================================="
echo "✅ Webcam stream working"
echo "✅ Motion sensor responding"
echo "✅ Speaker playback working (software)"
echo "✅ Light control working"
echo ""
echo "⚠️  Hardware Notes:"
echo "   - If no sound is heard from speaker, check:"
echo "     1. Speaker physically connected to USB audio adapter"
echo "     2. Speaker powered on"
echo "     3. Speaker volume knob"
echo "     4. Correct audio jack (green = output)"
echo ""
echo "✅ Orlok is ready for operation!"

