#!/bin/bash
# STT Audio Filtering Test Script
# Tests different audio filter settings to reduce background noise/music

CONFIG_FILE="data/character-3/ai-config/stt-config.json"
TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "STT AUDIO FILTERING TEST SUITE"
echo "Testing noise reduction for music/background"
echo "========================================="
echo ""
echo "Instructions: Speak CLEARLY and LOUDLY when you see 'SPEAK NOW'"
echo "Try to speak over the background music"
echo ""

# Keep VAD at 0.40 (worked best), vary filtering
# Format: highpass:lowpass:denoise:description
TESTS=(
    "300:3500:-35:Aggressive music filter"
    "250:3800:-30:Strong music filter"
    "200:4000:-25:Moderate music filter"
    "300:3200:-40:Very aggressive filter"
    "350:3500:-35:Extreme highpass + aggressive"
    "250:4000:-30:Balanced speech focus"
    "300:3800:-32:Strong with wider band"
    "200:3500:-28:Moderate with narrow band"
    "280:3600:-33:Optimized for speech over music"
    "320:3400:-38:Maximum music rejection"
)

# Set VAD to best value from previous tests
jq '.vadThreshold = "0.40" | .vadSilenceDuration = "500"' \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

TEST_NUM=1
for TEST_CONFIG in "${TESTS[@]}"; do
    IFS=':' read -r HIGHPASS LOWPASS DENOISE DESC <<< "$TEST_CONFIG"
    
    echo "========================================="
    echo "TEST $TEST_NUM/10: $DESC"
    echo "Highpass: ${HIGHPASS}Hz | Lowpass: ${LOWPASS}Hz | Denoise: ${DENOISE}dB"
    echo "========================================="
    
    # Update filter config
    jq --arg hp "$HIGHPASS" --arg lp "$LOWPASS" --arg dn "$DENOISE" \
        '.highpassFreq = $hp | .lowpassFreq = $lp | .denoiseLevel = $dn' \
        "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    
    echo ""
    echo "🎤 SPEAK LOUDLY NOW! (3 seconds)..."
    sleep 1
    
    # Run STT test
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    # Extract transcript
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    SUCCESS=$(echo "$RESULT" | jq -r '.success // false')
    
    echo ""
    echo "📝 Result: $TRANSCRIPT"
    echo "✅ Success: $SUCCESS"
    echo ""
    
    # Log to file
    echo "TEST $TEST_NUM | HP:${HIGHPASS} LP:${LOWPASS} DN:${DENOISE} | Result: $TRANSCRIPT" >> stt_filter_results.log
    
    TEST_NUM=$((TEST_NUM + 1))
    
    # Pause between tests
    if [ $TEST_NUM -le 10 ]; then
        echo "Next test in 2 seconds..."
        sleep 2
    fi
done

echo ""
echo "========================================="
echo "ALL FILTERING TESTS COMPLETE"
echo "========================================="
echo ""
echo "Results saved to: stt_filter_results.log"
echo ""
echo "Analyzing results..."
echo ""

# Count how many tests captured speech (not just music)
SPEECH_COUNT=$(grep -v "(rock music)" stt_filter_results.log | grep -v "(heavy metal)" | grep -v "TEST " | wc -l)
TOTAL_TESTS=10

echo "Speech captured: $SPEECH_COUNT / $TOTAL_TESTS tests"
ACCURACY=$((SPEECH_COUNT * 100 / TOTAL_TESTS))
echo "Accuracy: ${ACCURACY}%"
echo ""

if [ $ACCURACY -ge 90 ]; then
    echo "✅ TARGET ACHIEVED: 90%+ transcription accuracy!"
else
    echo "⚠️  Target not met. Try speaking louder or reducing background music volume."
fi

