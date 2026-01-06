#!/bin/bash
# STT VAD Tuning Test Script
# Tests different VAD thresholds to achieve 90%+ transcription accuracy

CONFIG_FILE="data/character-3/ai-config/stt-config.json"
TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "STT VAD TUNING TEST SUITE"
echo "========================================="
echo ""
echo "Instructions: Speak clearly when you see 'SPEAK NOW'"
echo "Say different phrases for each test"
echo ""

# Test configurations: VAD Threshold, Silence Duration, Description
TESTS=(
    "0.40:500:Moderate sensitivity"
    "0.35:500:Higher sensitivity"
    "0.30:600:High sensitivity + longer silence"
    "0.45:400:Lower sensitivity + faster cutoff"
    "0.40:700:Moderate + long silence"
    "0.35:400:High sensitivity + fast cutoff"
    "0.50:500:Balanced (default)"
    "0.30:500:Very sensitive"
    "0.40:600:Moderate + medium silence"
    "0.35:700:High sensitivity + very long silence"
)

TEST_NUM=1
for TEST_CONFIG in "${TESTS[@]}"; do
    IFS=':' read -r VAD_THRESH SILENCE_DUR DESC <<< "$TEST_CONFIG"
    
    echo "========================================="
    echo "TEST $TEST_NUM/10: $DESC"
    echo "VAD Threshold: $VAD_THRESH"
    echo "Silence Duration: ${SILENCE_DUR}ms"
    echo "========================================="
    
    # Update config file
    jq --arg vad "$VAD_THRESH" --arg silence "$SILENCE_DUR" \
        '.vadThreshold = $vad | .vadSilenceDuration = $silence' \
        "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    
    echo ""
    echo "🎤 SPEAK NOW! (3 seconds to speak)..."
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
    echo "TEST $TEST_NUM | VAD: $VAD_THRESH | Silence: ${SILENCE_DUR}ms | Result: $TRANSCRIPT" >> stt_test_results.log
    
    TEST_NUM=$((TEST_NUM + 1))
    
    # Pause between tests
    if [ $TEST_NUM -le 10 ]; then
        echo "Next test in 2 seconds..."
        sleep 2
    fi
done

echo ""
echo "========================================="
echo "ALL TESTS COMPLETE"
echo "========================================="
echo ""
echo "Results saved to: stt_test_results.log"
echo ""
echo "Review results and choose the best VAD threshold"
echo "for your environment."

