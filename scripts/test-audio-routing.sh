#!/bin/bash
# Test audio routing to verify speakers are working

echo "=== AUDIO ROUTING TEST ==="
echo ""

echo "1. Checking PipeWire status..."
wpctl status | grep -A 15 "Audio"
echo ""

echo "2. Checking default sink..."
DEFAULT_SINK=$(pactl info | grep "Default Sink" | cut -d: -f2 | xargs)
echo "Default Sink: $DEFAULT_SINK"
echo ""

echo "3. Listing all sinks..."
pactl list sinks short
echo ""

echo "4. Testing audio with speaker-test (2 seconds)..."
timeout 2 speaker-test -t sine -f 1000 -c 2 2>&1 | head -15
echo ""

echo "5. Testing with mpg123 (default routing)..."
mpg123 --quiet -o pulse public/sounds/monster-howl-85304.mp3 2>&1
echo "mpg123 test complete"
echo ""

echo "6. Testing with mpg123 + PULSE_SINK=81..."
PULSE_SINK=81 mpg123 --quiet -o pulse public/sounds/monster-howl-85304.mp3 2>&1
echo "mpg123 with PULSE_SINK=81 complete"
echo ""

echo "7. Testing with speaker_cli.py..."
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 80 --device default
echo ""

echo "8. Testing with speaker_cli.py + device 81..."
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 80 --device 81
echo ""

echo "=== TEST COMPLETE ==="
echo "Did you hear audio from any of the tests above?"

