#!/bin/bash
# Complete Audio Test for MonsterBox

echo "========================================="
echo "MonsterBox Audio System Test"
echo "========================================="
echo ""

# Test 1: Check PipeWire/PulseAudio
echo "Test 1: PipeWire/PulseAudio Status"
echo "-----------------------------------"
systemctl --user is-active pipewire pipewire-pulse wireplumber
echo ""

# Test 2: List audio devices
echo "Test 2: Available Audio Devices"
echo "--------------------------------"
pactl list sinks short
echo ""

# Test 3: Check default sink
echo "Test 3: Default Sink"
echo "--------------------"
pactl get-default-sink
echo ""

# Test 4: Check volumes
echo "Test 4: Volume Levels"
echo "---------------------"
pactl list sinks | grep -A 5 "Volume:"
echo ""

# Test 5: Test built-in audio (3.5mm jack)
echo "Test 5: Testing Built-in Audio (3.5mm jack)"
echo "--------------------------------------------"
echo "Playing test sound on 3.5mm jack..."
paplay --device=alsa_output.platform-fe00b840.mailbox.stereo-fallback /usr/share/sounds/alsa/Front_Center.wav 2>&1 &
sleep 3
echo "Did you hear that? (3.5mm jack)"
echo ""

# Test 6: Test USB Audio
echo "Test 6: Testing USB Audio Device"
echo "---------------------------------"
echo "Playing test sound on USB Audio..."
paplay --device=alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo /usr/share/sounds/alsa/Front_Center.wav 2>&1 &
sleep 3
echo "Did you hear that? (USB Audio)"
echo ""

# Test 7: Test mpg123 with PulseAudio
echo "Test 7: Testing mpg123 with PulseAudio"
echo "---------------------------------------"
if [ -f /tmp/test.mp3 ]; then
    echo "Playing MP3 with mpg123..."
    export PULSE_SINK=alsa_output.platform-fe00b840.mailbox.stereo-fallback
    mpg123 -o pulse /tmp/test.mp3 2>&1 | head -5
    echo "Did you hear that? (mpg123)"
else
    echo "No test MP3 file found, skipping"
fi
echo ""

# Test 8: Check MonsterBox speaker configuration
echo "Test 8: MonsterBox Speaker Configuration"
echo "-----------------------------------------"
curl -s http://localhost:3000/setup/parts/api/parts | jq '.parts[] | select(.id == "6") | {id, name, type, characterId, audioDeviceId: .config.audioDeviceId, volume: .config.volume}'
echo ""

# Test 9: Check Orlok character configuration
echo "Test 9: Orlok Character Configuration"
echo "--------------------------------------"
curl -s http://localhost:3000/setup/characters/api/characters | jq '.characters[] | select(.id == 3) | {id, name, speakerId, agentId: .elevenLabsAgentId}'
echo ""

echo "========================================="
echo "Audio Test Complete"
echo "========================================="
echo ""
echo "IMPORTANT QUESTIONS:"
echo "1. Did you hear the 3.5mm jack test sound?"
echo "2. Did you hear the USB Audio test sound?"
echo "3. Do you have speakers/headphones plugged in?"
echo "4. Which audio output are you using?"
echo ""

