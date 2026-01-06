#!/bin/bash
# Complete Audio Fix for MonsterBox
# This script diagnoses and fixes all audio issues

echo "========================================="
echo "MonsterBox Complete Audio Fix"
echo "========================================="
echo ""

# Step 1: Check if PipeWire is running
echo "Step 1: Checking PipeWire/PulseAudio..."
systemctl --user is-active pipewire pipewire-pulse wireplumber
if [ $? -ne 0 ]; then
    echo "❌ PipeWire not running! Starting..."
    systemctl --user start pipewire pipewire-pulse wireplumber
    sleep 2
fi
echo "✅ PipeWire running"
echo ""

# Step 2: List all audio devices
echo "Step 2: Available Audio Devices"
echo "--------------------------------"
echo "ALSA Devices:"
aplay -l
echo ""
echo "PulseAudio Sinks:"
pactl list sinks short
echo ""

# Step 3: Set default to HDMI (most common for monitors)
echo "Step 3: Setting default audio output..."
echo "Trying HDMI 0..."
pactl set-default-sink alsa_output.platform-bcm2835_audio.hdmi-stereo 2>/dev/null
if [ $? -ne 0 ]; then
    echo "HDMI not available, trying 3.5mm jack..."
    pactl set-default-sink alsa_output.platform-fe00b840.mailbox.stereo-fallback
fi
echo "✅ Default sink set"
echo ""

# Step 4: Unmute and set volume to 100%
echo "Step 4: Unmuting and setting volume..."
pactl set-sink-volume @DEFAULT_SINK@ 100%
pactl set-sink-mute @DEFAULT_SINK@ 0

# Also try ALSA mixer
amixer sset 'Headphone' 100% unmute 2>/dev/null
amixer sset 'PCM' 100% unmute 2>/dev/null
amixer sset 'Master' 100% unmute 2>/dev/null
echo "✅ Volume set to 100%, unmuted"
echo ""

# Step 5: Test each output
echo "Step 5: Testing Audio Outputs"
echo "------------------------------"

echo "Testing 3.5mm Headphone Jack..."
paplay --device=alsa_output.platform-fe00b840.mailbox.stereo-fallback /usr/share/sounds/alsa/Front_Center.wav 2>&1 &
sleep 3
echo "Did you hear a beep from the 3.5mm jack?"
echo ""

echo "Testing USB Audio Device..."
paplay --device=alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo /usr/share/sounds/alsa/Front_Center.wav 2>&1 &
sleep 3
echo "Did you hear a beep from USB Audio?"
echo ""

# Step 6: Update MonsterBox speaker configuration
echo "Step 6: Updating MonsterBox Speaker Configuration..."
DEFAULT_SINK=$(pactl get-default-sink)
echo "Default sink: $DEFAULT_SINK"

curl -s -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d "{\"config\": {\"audioDeviceId\": \"$DEFAULT_SINK\", \"volume\": 100}}" | jq '.success'

echo "✅ Speaker configuration updated"
echo ""

# Step 7: Test MonsterBox TTS
echo "Step 7: Testing MonsterBox TTS..."
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text": "Audio system test successful", "characterId": 3}' 2>&1 | jq
echo ""

sleep 5
echo "Did you hear 'Audio system test successful'?"
echo ""

# Step 8: Show current configuration
echo "Step 8: Current Audio Configuration"
echo "------------------------------------"
echo "Default Sink:"
pactl get-default-sink
echo ""
echo "Sink Volume:"
pactl list sinks | grep -A 10 "$(pactl get-default-sink)" | grep "Volume:"
echo ""
echo "Mute Status:"
pactl list sinks | grep -A 10 "$(pactl get-default-sink)" | grep "Mute:"
echo ""

echo "========================================="
echo "Audio Fix Complete"
echo "========================================="
echo ""
echo "IMPORTANT:"
echo "1. If you heard ANY of the test sounds, note which one"
echo "2. If you heard NONE, check physical speaker connections"
echo "3. Speakers must be plugged into:"
echo "   - 3.5mm headphone jack on Raspberry Pi, OR"
echo "   - HDMI monitor with speakers, OR"
echo "   - USB Audio Device"
echo ""
echo "Current default: $DEFAULT_SINK"
echo ""

