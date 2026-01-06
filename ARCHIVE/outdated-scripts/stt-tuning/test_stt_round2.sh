#!/bin/bash
# STT Round 2 - Updated Filter Settings
# HP:250Hz, LP:3800Hz, DN:-30dB

TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "STT ROUND 2 - UPDATED FILTERS"
echo "========================================="
echo ""
echo "Current Settings:"
echo "  VAD Threshold: 0.40"
echo "  Silence Duration: 500ms"
echo "  Highpass: 250Hz"
echo "  Lowpass: 3800Hz"
echo "  Denoise: -30dB"
echo "  Microphone Gain: 150%"
echo ""
echo "Running 5 tests..."
echo ""

> stt_round2_results.log

for TEST_NUM in {1..5}; do
    echo "========================================="
    echo "TEST $TEST_NUM/5"
    echo "🎤 SPEAK CLEARLY NOW! (3 seconds)..."
    echo "========================================="
    sleep 1
    
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    SUCCESS=$(echo "$RESULT" | jq -r '.success // false')
    
    echo ""
    echo "📝 Transcript: $TRANSCRIPT"
    echo "✅ Success: $SUCCESS"
    echo ""
    
    echo "TEST $TEST_NUM | $TRANSCRIPT" >> stt_round2_results.log
    
    if [ $TEST_NUM -lt 5 ]; then
        echo "Next test in 3 seconds..."
        sleep 3
    fi
done

echo ""
echo "========================================="
echo "ROUND 2 RESULTS"
echo "========================================="
echo ""
cat stt_round2_results.log
echo ""

# Analyze
MUSIC_COUNT=$(grep -iE "music|musique|música" stt_round2_results.log | wc -l)
TOTAL=5
SPEECH_COUNT=$((TOTAL - MUSIC_COUNT))

echo "Speech captured: $SPEECH_COUNT / $TOTAL"
ACCURACY=$((SPEECH_COUNT * 100 / TOTAL))
echo "Accuracy: ${ACCURACY}%"
echo ""

if [ $ACCURACY -ge 90 ]; then
    echo "✅ TARGET ACHIEVED: 90%+ accuracy!"
elif [ $ACCURACY -ge 60 ]; then
    echo "⚠️  Good progress: ${ACCURACY}%"
else
    echo "❌ More tuning needed: ${ACCURACY}%"
fi

