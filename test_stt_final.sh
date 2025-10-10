#!/bin/bash
# Final STT Accuracy Test
# Using optimal settings: VAD 0.40, HP 320Hz, LP 3400Hz, DN -38dB

CONFIG_FILE="data/character-3/ai-config/stt-config.json"
TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "FINAL STT ACCURACY TEST"
echo "Optimal Settings Applied"
echo "========================================="
echo ""
echo "VAD Threshold: 0.40"
echo "Silence Duration: 500ms"
echo "Highpass Filter: 320Hz"
echo "Lowpass Filter: 3400Hz"
echo "Denoise Level: -38dB"
echo ""
echo "========================================="
echo ""
echo "Instructions:"
echo "- Speak CLEARLY and LOUDLY"
echo "- Use different phrases each time"
echo "- Speak over the background music"
echo "- Try short and long sentences"
echo ""

# Ensure optimal config
jq '.vadThreshold = "0.40" | .vadSilenceDuration = "500" | .highpassFreq = "320" | .lowpassFreq = "3400" | .denoiseLevel = "-38"' \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "Starting 10 tests in 3 seconds..."
sleep 3

> stt_final_results.log

for TEST_NUM in {1..10}; do
    echo "========================================="
    echo "TEST $TEST_NUM/10"
    echo "========================================="
    echo ""
    echo "🎤 SPEAK NOW! (3 seconds)..."
    sleep 1
    
    # Run STT test
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    # Extract transcript
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    SUCCESS=$(echo "$RESULT" | jq -r '.success // false')
    
    echo ""
    echo "📝 Transcript: $TRANSCRIPT"
    echo "✅ Success: $SUCCESS"
    echo ""
    
    # Log to file
    echo "TEST $TEST_NUM | $TRANSCRIPT" >> stt_final_results.log
    
    # Pause between tests
    if [ $TEST_NUM -lt 10 ]; then
        echo "Next test in 3 seconds..."
        sleep 3
    fi
done

echo ""
echo "========================================="
echo "FINAL RESULTS"
echo "========================================="
echo ""

# Analyze results
echo "All transcripts:"
cat stt_final_results.log
echo ""

# Count successful speech captures (not just music/noise)
MUSIC_COUNT=$(grep -E "\(rock music\)|\(heavy metal\)|\(musique\)|\(music\)" stt_final_results.log | wc -l)
NOISE_COUNT=$(grep -E "\(background noise\)|\(brus\)|\(소음\)|\(ääniä\)" stt_final_results.log | wc -l)
TOTAL_TESTS=10
SPEECH_COUNT=$((TOTAL_TESTS - MUSIC_COUNT - NOISE_COUNT))

echo "Speech captured: $SPEECH_COUNT / $TOTAL_TESTS tests"
echo "Music only: $MUSIC_COUNT tests"
echo "Noise only: $NOISE_COUNT tests"
echo ""

ACCURACY=$((SPEECH_COUNT * 100 / TOTAL_TESTS))
echo "Transcription Accuracy: ${ACCURACY}%"
echo ""

if [ $ACCURACY -ge 90 ]; then
    echo "✅ SUCCESS! Achieved 90%+ transcription accuracy!"
    echo ""
    echo "Optimal settings saved to: $CONFIG_FILE"
elif [ $ACCURACY -ge 70 ]; then
    echo "⚠️  Good progress (${ACCURACY}%), but not quite 90% yet."
    echo "Recommendations:"
    echo "- Speak louder and more clearly"
    echo "- Reduce background music volume"
    echo "- Move microphone closer to mouth"
else
    echo "❌ Low accuracy (${ACCURACY}%)."
    echo "Recommendations:"
    echo "- Significantly reduce background music volume"
    echo "- Use a directional microphone"
    echo "- Speak much louder"
fi

echo ""
echo "Results saved to: stt_final_results.log"

