#!/bin/bash
# STT Test with Boosted Microphone
# Microphone at 150%, Speakers at 50%

TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "STT TEST - BOOSTED MICROPHONE"
echo "========================================="
echo ""
echo "Microphone: 150% gain"
echo "Speakers: 50% volume (reduced bleed)"
echo "Optimal filters applied"
echo ""
echo "Running 5 quick tests..."
echo ""

> stt_boosted_results.log

for TEST_NUM in {1..5}; do
    echo "========================================="
    echo "TEST $TEST_NUM/5"
    echo "🎤 SPEAK CLEARLY NOW! (3 seconds)..."
    sleep 1
    
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    
    echo "📝 $TRANSCRIPT"
    echo ""
    echo "TEST $TEST_NUM | $TRANSCRIPT" >> stt_boosted_results.log
    
    if [ $TEST_NUM -lt 5 ]; then
        sleep 2
    fi
done

echo ""
echo "========================================="
echo "RESULTS:"
cat stt_boosted_results.log
echo "========================================="

