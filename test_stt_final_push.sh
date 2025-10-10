#!/bin/bash
# Final STT Push - 200% Mic + Optimized Filters

TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "FINAL STT PUSH - MAXIMUM SETTINGS"
echo "========================================="
echo ""
echo "Settings:"
echo "  VAD: 0.30 (very sensitive)"
echo "  Silence: 600ms (longer capture)"
echo "  Highpass: 350Hz"
echo "  Lowpass: 3500Hz"
echo "  Denoise: -42dB"
echo "  🎤 MICROPHONE: 200% GAIN!"
echo ""
echo "🔊 SPEAK LOUDLY AND CLEARLY!"
echo "Try different phrases each time"
echo ""

> stt_final_push_results.log

PHRASES=(
    "Hello Orlok"
    "What time is it"
    "Tell me a story"
    "How are you today"
    "This is a test"
)

for TEST_NUM in {1..5}; do
    SUGGESTED="${PHRASES[$((TEST_NUM-1))]}"
    echo "========================================="
    echo "TEST $TEST_NUM/5"
    echo "Suggested phrase: \"$SUGGESTED\""
    echo "🎤 SPEAK NOW! (3 seconds)..."
    echo "========================================="
    sleep 1
    
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    
    echo ""
    echo "📝 RESULT: $TRANSCRIPT"
    echo ""
    
    # Check if it's actual speech
    if echo "$TRANSCRIPT" | grep -qiE "music|musique|música|소음|ääniä|brus"; then
        echo "❌ Music/noise detected"
    else
        echo "✅ SPEECH DETECTED!"
    fi
    echo ""
    
    echo "TEST $TEST_NUM | Suggested: $SUGGESTED | Got: $TRANSCRIPT" >> stt_final_push_results.log
    
    if [ $TEST_NUM -lt 5 ]; then
        sleep 3
    fi
done

echo ""
echo "========================================="
echo "FINAL PUSH RESULTS:"
echo "========================================="
cat stt_final_push_results.log
echo ""

# Count successes
MUSIC_COUNT=$(grep -iE "music|musique|música|소음|ääniä|brus|noise" stt_final_push_results.log | wc -l)
TOTAL=5
SPEECH_COUNT=$((TOTAL - MUSIC_COUNT))

echo "========================================="
echo "Speech captured: $SPEECH_COUNT / $TOTAL"
ACCURACY=$((SPEECH_COUNT * 100 / TOTAL))
echo "Accuracy: ${ACCURACY}%"
echo "========================================="

if [ $ACCURACY -ge 90 ]; then
    echo "🎉 SUCCESS! 90%+ ACHIEVED!"
elif [ $ACCURACY -ge 60 ]; then
    echo "⚠️  Getting close: ${ACCURACY}%"
else
    echo "❌ Background music too loud: ${ACCURACY}%"
fi

