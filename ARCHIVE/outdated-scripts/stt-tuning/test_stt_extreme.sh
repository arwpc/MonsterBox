#!/bin/bash
# STT Extreme Filtering Test
# Maximum music rejection settings

TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"

echo "========================================="
echo "STT EXTREME FILTERING TEST"
echo "========================================="
echo ""
echo "EXTREME Settings Applied:"
echo "  VAD Threshold: 0.35 (more sensitive)"
echo "  Highpass: 400Hz (cut low bass/music)"
echo "  Lowpass: 3200Hz (narrow speech band)"
echo "  Denoise: -40dB (maximum noise reduction)"
echo "  Microphone: 150%"
echo ""
echo "🔊 SPEAK VERY LOUDLY AND CLEARLY!"
echo ""

> stt_extreme_results.log

for TEST_NUM in {1..5}; do
    echo "========================================="
    echo "TEST $TEST_NUM/5"
    echo "🎤 SHOUT YOUR PHRASE NOW! (3 seconds)..."
    echo "========================================="
    sleep 1
    
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    
    echo ""
    echo "📝 $TRANSCRIPT"
    echo ""
    
    echo "TEST $TEST_NUM | $TRANSCRIPT" >> stt_extreme_results.log
    
    if [ $TEST_NUM -lt 5 ]; then
        sleep 3
    fi
done

echo ""
echo "========================================="
echo "EXTREME FILTER RESULTS:"
cat stt_extreme_results.log
echo "========================================="

