#!/usr/bin/env bash
# STT Audio Quality Debugging Script for Groundbreaker
# This script helps diagnose poor transcription quality by:
# 1. Verifying which microphone is actually being used
# 2. Testing audio capture quality
# 3. Sending test audio directly to ElevenLabs API
# 4. Monitoring real-time audio levels

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
USB_MIC="alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback"
WEBCAM_MIC="alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo"
TEST_DURATION=3
SAMPLE_RATE=16000
CHANNELS=1

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  MonsterBox STT Audio Quality Debugger - Groundbreaker    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print section headers
print_section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# 1. Check MonsterBox logs location
print_section "1. Checking MonsterBox Logs"
echo "Debug logs are written to /var/log/monsterbox.log (NOT journalctl)"
echo ""
echo "To view real-time logs with STT debug info:"
echo -e "${GREEN}  tail -f /var/log/monsterbox.log | grep -E '(STT|🎙️|language_code)'${NC}"
echo ""
echo "Last 20 STT-related log entries:"
if [ -f /var/log/monsterbox.log ]; then
    tail -100 /var/log/monsterbox.log | grep -E "(STT|🎙️|language_code)" | tail -20 || echo "  (No STT logs found)"
else
    print_error "Log file /var/log/monsterbox.log not found"
fi

# 2. Check current microphone status
print_section "2. Current Microphone Status"
echo "Checking PulseAudio sources..."
pactl list sources short | while read -r line; do
    if echo "$line" | grep -q "$USB_MIC"; then
        status=$(echo "$line" | awk '{print $7}')
        if [ "$status" = "RUNNING" ]; then
            print_success "USB Audio Adapter: $status (ACTIVE - GOOD!)"
        elif [ "$status" = "IDLE" ]; then
            print_warning "USB Audio Adapter: $status (configured but not currently capturing)"
        else
            print_warning "USB Audio Adapter: $status (NOT ACTIVE)"
        fi
    elif echo "$line" | grep -q "$WEBCAM_MIC"; then
        status=$(echo "$line" | awk '{print $7}')
        if [ "$status" = "RUNNING" ]; then
            print_error "Webcam Mic: $status (SHOULD NOT BE ACTIVE!)"
        else
            print_success "Webcam Mic: $status (not active - good)"
        fi
    fi
done

# 3. Check STT configuration
print_section "3. STT Configuration"
if [ -f data/character-5/ai-config/stt-config.json ]; then
    configured_mic=$(jq -r '.microphoneDeviceId' data/character-5/ai-config/stt-config.json)
    echo "Configured microphone: $configured_mic"
    if [ "$configured_mic" = "$USB_MIC" ]; then
        print_success "Configuration is set to USB Audio Adapter"
    else
        print_warning "Configuration is NOT set to USB Audio Adapter"
    fi
else
    print_error "STT config file not found"
fi

# 4. Test direct audio capture from USB mic
print_section "4. Testing Direct Audio Capture"
echo "Recording ${TEST_DURATION}s test sample from USB Audio Adapter..."
echo "Please speak clearly: 'The quick brown fox jumped over the lazy dog'"
echo ""

TEST_FILE="/tmp/stt-test-$(date +%s).wav"
if parecord -d "$USB_MIC" --channels=$CHANNELS --rate=$SAMPLE_RATE --file-format=wav "$TEST_FILE" &
then
    RECORD_PID=$!
    sleep "$TEST_DURATION"
    kill $RECORD_PID 2>/dev/null || true
    wait $RECORD_PID 2>/dev/null || true
    
    if [ -f "$TEST_FILE" ]; then
        FILE_SIZE=$(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE" 2>/dev/null)
        print_success "Captured $FILE_SIZE bytes to $TEST_FILE"
        
        # Check if file has actual audio data (WAV header is 44 bytes)
        if [ "$FILE_SIZE" -gt 1000 ]; then
            print_success "File size looks good (contains audio data)"
            
            # Play back the recording
            echo ""
            echo "Playing back recording (you should hear your voice)..."
            paplay "$TEST_FILE" 2>/dev/null || print_warning "Could not play back audio"
        else
            print_error "File is too small - may not contain valid audio"
        fi
    else
        print_error "Failed to create test file"
    fi
else
    print_error "Failed to start recording"
fi

# 5. Test with ElevenLabs API (if API key available)
print_section "5. Testing ElevenLabs API Transcription"
if [ -f /etc/monsterbox/elevenlabs.key ]; then
    API_KEY=$(cat /etc/monsterbox/elevenlabs.key)
    
    if [ -f "$TEST_FILE" ]; then
        echo "Sending test audio to ElevenLabs API..."
        RESPONSE=$(curl -s -X POST "https://api.elevenlabs.io/v1/speech-to-text" \
            -H "xi-api-key: $API_KEY" \
            -F "model_id=scribe_v2" \
            -F "language_code=en" \
            -F "file=@$TEST_FILE")
        
        echo ""
        echo "API Response:"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        
        # Extract transcription
        TRANSCRIPT=$(echo "$RESPONSE" | jq -r '.text // .transcript // empty' 2>/dev/null)
        if [ -n "$TRANSCRIPT" ]; then
            echo ""
            echo -e "${GREEN}Transcription:${NC} \"$TRANSCRIPT\""
            echo ""
            echo "Expected: 'The quick brown fox jumped over the lazy dog'"
            echo "Got:      '$TRANSCRIPT'"
            
            # Simple accuracy check
            if echo "$TRANSCRIPT" | grep -qi "quick.*brown.*fox"; then
                print_success "Transcription looks accurate!"
            else
                print_error "Transcription does NOT match expected text"
                echo ""
                echo "This suggests either:"
                echo "  1. Audio quality from USB mic is poor"
                echo "  2. Audio encoding/format issue"
                echo "  3. ElevenLabs Scribe model limitation"
            fi
        else
            print_error "No transcription in API response"
        fi
    else
        print_warning "No test file available to send to API"
    fi
else
    print_warning "ElevenLabs API key not found at /etc/monsterbox/elevenlabs.key"
    echo "Skipping API test"
fi

# 6. Monitor real-time audio levels
print_section "6. Real-time Audio Level Monitoring"
echo "Monitoring audio levels from USB Audio Adapter for 5 seconds..."
echo "Speak into the microphone to see levels..."
echo ""

# Use parecord with a simple level meter
timeout 5 parecord -d "$USB_MIC" --channels=$CHANNELS --rate=$SAMPLE_RATE --file-format=wav /dev/null 2>&1 | head -20 || true

# 7. Check Python microphone wrapper
print_section "7. Testing Python Microphone Wrapper"
if [ -f python_wrappers/microphone_cli.py ]; then
    echo "Testing Python wrapper with USB Audio Adapter..."
    PULSE_SOURCE="$USB_MIC" python3 python_wrappers/microphone_cli.py record_wav "$USB_MIC" 16000 1 2 > /tmp/python-test.wav 2>&1
    
    if [ -f /tmp/python-test.wav ]; then
        PY_SIZE=$(stat -f%z /tmp/python-test.wav 2>/dev/null || stat -c%s /tmp/python-test.wav 2>/dev/null)
        if [ "$PY_SIZE" -gt 1000 ]; then
            print_success "Python wrapper captured $PY_SIZE bytes"
        else
            print_error "Python wrapper file too small: $PY_SIZE bytes"
        fi
    else
        print_error "Python wrapper did not create output file"
    fi
else
    print_warning "Python wrapper not found"
fi

# 8. Summary and recommendations
print_section "8. Summary & Recommendations"
echo ""
echo "Next steps:"
echo ""
echo "1. View real-time STT logs:"
echo -e "   ${GREEN}tail -f /var/log/monsterbox.log | grep -E '(STT|🎙️|language_code)'${NC}"
echo ""
echo "2. If USB mic shows SUSPENDED, restart MonsterBox to activate it:"
echo -e "   ${GREEN}sudo systemctl restart monsterbox${NC}"
echo ""
echo "3. Test audio file saved to: $TEST_FILE"
echo "   You can manually test this file with ElevenLabs API"
echo ""
echo "4. If transcription is still poor, try:"
echo "   - Increase microphone volume: pactl set-source-volume $USB_MIC 100%"
echo "   - Check microphone positioning (speak directly into it)"
echo "   - Test with a different audio format (WAV vs MP3)"
echo ""

print_success "Debug script complete!"

