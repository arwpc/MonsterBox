#!/bin/bash
# Comprehensive Audio Test Suite for Orlok
# Tests all audio outputs with both files and TTS

echo "========================================="
echo "ORLOK AUDIO DIAGNOSTIC TEST SUITE"
echo "========================================="
echo ""
date
echo ""

# Check PipeWire status
echo "========================================="
echo "1. CHECKING PIPEWIRE STATUS"
echo "========================================="
systemctl --user status pipewire pipewire-pulse wireplumber | grep -E "Active:|Main PID:"
echo ""

# List audio devices
echo "========================================="
echo "2. AUDIO DEVICES"
echo "========================================="
wpctl status | grep -A 30 "Audio"
echo ""

# Check volumes
echo "========================================="
echo "3. CURRENT VOLUMES"
echo "========================================="
echo "Sink 81 (USB Audio): $(wpctl get-volume 81)"
echo "Sink 34 (Built-in): $(wpctl get-volume 34)"
echo "Source 82 (USB Mic): $(wpctl get-volume 82)"
echo ""

# Set volumes to audible levels
echo "Setting all outputs to 80% for testing..."
wpctl set-volume 81 80%
wpctl set-volume 34 80%
echo "Volumes set to 80%"
echo ""

# Test 1: Direct ALSA playback
echo "========================================="
echo "TEST 1: ALSA DIRECT - USB Audio (hw:4,0)"
echo "========================================="
echo "Playing test tone via aplay..."
speaker-test -D plughw:4,0 -c 2 -t sine -f 440 -l 1 2>&1 | head -5 &
SPKTEST_PID=$!
sleep 3
kill $SPKTEST_PID 2>/dev/null
echo "✅ Test 1 complete"
echo ""
sleep 2

# Test 2: ALSA - Headphone jack
echo "========================================="
echo "TEST 2: ALSA DIRECT - Headphone Jack (hw:2,0)"
echo "========================================="
echo "Playing test tone via aplay..."
speaker-test -D hw:2,0 -c 2 -t sine -f 440 -l 1 2>&1 | head -5 &
SPKTEST_PID=$!
sleep 3
kill $SPKTEST_PID 2>/dev/null
echo "✅ Test 2 complete"
echo ""
sleep 2

# Test 3: PipeWire - USB Audio
echo "========================================="
echo "TEST 3: PIPEWIRE - USB Audio (sink 81)"
echo "========================================="
echo "Playing monster howl via pw-play..."
pw-play --target 81 public/sounds/monster-howl-85304.mp3 &
PWPLAY_PID=$!
sleep 5
kill $PWPLAY_PID 2>/dev/null
echo "✅ Test 3 complete"
echo ""
sleep 2

# Test 4: PipeWire - Built-in Audio
echo "========================================="
echo "TEST 4: PIPEWIRE - Built-in Audio (sink 34)"
echo "========================================="
echo "Playing monster howl via pw-play..."
pw-play --target 34 public/sounds/monster-howl-85304.mp3 &
PWPLAY_PID=$!
sleep 5
kill $PWPLAY_PID 2>/dev/null
echo "✅ Test 4 complete"
echo ""
sleep 2

# Test 5: mpg123 via PulseAudio
echo "========================================="
echo "TEST 5: MPG123 - Default Output"
echo "========================================="
echo "Playing monster howl via mpg123..."
mpg123 --quiet -o pulse public/sounds/monster-howl-85304.mp3
echo "✅ Test 5 complete"
echo ""
sleep 2

# Test 6: MonsterBox API - Test System (Speaker)
echo "========================================="
echo "TEST 6: MONSTERBOX API - Test System"
echo "========================================="
echo "Testing via /setup/audio/api/test-system..."
RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"testType":"speaker","deviceId":"default"}' \
  http://localhost:3000/setup/audio/api/test-system)
echo "Result: $RESULT"
sleep 5
echo "✅ Test 6 complete"
echo ""
sleep 2

# Test 7: MonsterBox API - USB Audio Device
echo "========================================="
echo "TEST 7: MONSTERBOX API - USB Audio (hw:4,0)"
echo "========================================="
RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"testType":"speaker","deviceId":"hw:4,0"}' \
  http://localhost:3000/setup/audio/api/test-system)
echo "Result: $RESULT"
sleep 5
echo "✅ Test 7 complete"
echo ""
sleep 2

# Test 8: MonsterBox API - Headphone Jack
echo "========================================="
echo "TEST 8: MONSTERBOX API - Headphone Jack (hw:2,0)"
echo "========================================="
RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"testType":"speaker","deviceId":"hw:2,0"}' \
  http://localhost:3000/setup/audio/api/test-system)
echo "Result: $RESULT"
sleep 5
echo "✅ Test 8 complete"
echo ""
sleep 2

# Test 9: Speaker Part Test
echo "========================================="
echo "TEST 9: SPEAKER PART - Orlok Speaker (ID 6)"
echo "========================================="
echo "Testing via /setup/parts/api/parts/6/test..."
RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"play","params":{"filename":"public/sounds/monster-howl-85304.mp3","volume":80}}' \
  http://localhost:3000/setup/parts/api/parts/6/test)
echo "Result: $(echo $RESULT | jq -r '.message // .error // "Unknown"')"
sleep 5
echo "✅ Test 9 complete"
echo ""
sleep 2

# Test 10: TTS via ElevenLabs
echo "========================================="
echo "TEST 10: TTS - ElevenLabs Text-to-Speech"
echo "========================================="
echo "Generating speech: 'Hello, this is Orlok testing audio output'..."
RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is Orlok testing audio output","voiceId":"21m00Tcm4TlvDq8ikWAM","outputFormat":"mp3_44100_128"}' \
  http://localhost:3000/api/elevenlabs/tts/generate)

if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
  AUDIO_FILE=$(echo "$RESULT" | jq -r '.audioFile')
  echo "TTS generated: $AUDIO_FILE"
  echo "Playing TTS audio..."
  mpg123 --quiet -o pulse "$AUDIO_FILE"
  echo "✅ Test 10 complete"
else
  echo "❌ TTS generation failed: $(echo $RESULT | jq -r '.error // "Unknown error"')"
fi
echo ""
sleep 2

# Test 11: Check for active streams
echo "========================================="
echo "TEST 11: ACTIVE AUDIO STREAMS"
echo "========================================="
wpctl status | grep -A 10 "Streams:"
echo ""

# Test 12: Check for running audio processes
echo "========================================="
echo "TEST 12: RUNNING AUDIO PROCESSES"
echo "========================================="
ps aux | grep -E "mpg123|pw-play|paplay|aplay|speaker-test" | grep -v grep
echo ""

# Final diagnostics
echo "========================================="
echo "FINAL DIAGNOSTICS"
echo "========================================="
echo ""
echo "Default Sink:"
pactl info | grep "Default Sink"
echo ""
echo "Default Source:"
pactl info | grep "Default Source"
echo ""
echo "PipeWire Sinks:"
pactl list sinks short
echo ""
echo "PipeWire Sources:"
pactl list sources short
echo ""

echo "========================================="
echo "TEST SUITE COMPLETE"
echo "========================================="
echo ""
echo "Summary:"
echo "  - 12 audio tests performed"
echo "  - Tested: ALSA direct, PipeWire, mpg123, MonsterBox API, TTS"
echo "  - Devices: USB Audio, Headphone Jack, Built-in Audio"
echo ""
echo "If you heard NO audio from ANY test:"
echo "  1. Check physical connections (speakers plugged in?)"
echo "  2. Check speaker power (turned on?)"
echo "  3. Check volume knob on speakers"
echo "  4. Try different output device"
echo ""
echo "If you heard SOME tests but not others:"
echo "  - Note which tests worked"
echo "  - This indicates a software routing issue"
echo ""
date

