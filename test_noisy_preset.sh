#!/bin/bash
# Noisy Environment Preset Tuning
# Test and refine the noisy-environment preset

TEST_ENDPOINT="http://localhost:3000/api/elevenlabs/stt/testSample"
CONFIG_FILE="data/character-3/ai-config/stt-config.json"

echo "========================================="
echo "NOISY ENVIRONMENT PRESET - TUNING"
echo "========================================="
echo ""
echo "🎵 Background Music: LOUD (current level)"
echo "🎤 Microphone: 140% gain"
echo ""
echo "Preset: Noisy Environment (Music/Crowds)"
echo "  VAD: 0.38"
echo "  Silence: 550ms"
echo "  Highpass: 320Hz (cut bass/music)"
echo "  Lowpass: 3600Hz (speech band)"
echo "  Denoise: -38dB (strong)"
echo "  Min Letter Ratio: 60% (strict)"
echo ""
echo "========================================="
echo "ROUND 1: Baseline Test (10 tests)"
echo "========================================="
echo ""

> noisy_preset_results.log

ROUND=1
for TEST_NUM in {1..10}; do
    echo "TEST $TEST_NUM/10 - SPEAK CLEARLY NOW! (3 sec)..."
    sleep 1
    
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    
    # Classify
    if echo "$TRANSCRIPT" | grep -qiE "music|musique|música"; then
        TYPE="MUSIC"
        ICON="🎵"
    elif echo "$TRANSCRIPT" | grep -qiE "소음|ääniä|brus|noise|static|clicking"; then
        TYPE="NOISE"
        ICON="📢"
    else
        TYPE="SPEECH"
        ICON="✅"
    fi
    
    echo "$ICON $TRANSCRIPT"
    echo "R${ROUND}-T${TEST_NUM} | $TYPE | $TRANSCRIPT" >> noisy_preset_results.log
    
    if [ $TEST_NUM -lt 10 ]; then
        sleep 2
    fi
done

echo ""
echo "========================================="
echo "ROUND 1 RESULTS"
echo "========================================="

SPEECH=$(grep "SPEECH" noisy_preset_results.log | wc -l)
MUSIC=$(grep "MUSIC" noisy_preset_results.log | wc -l)
NOISE=$(grep "NOISE" noisy_preset_results.log | wc -l)

echo "Speech: $SPEECH / 10"
echo "Music: $MUSIC / 10"
echo "Noise: $NOISE / 10"
echo "Accuracy: $((SPEECH * 10))%"
echo ""

if [ $SPEECH -ge 9 ]; then
    echo "🎉 EXCELLENT! 90%+ achieved!"
    exit 0
elif [ $SPEECH -ge 7 ]; then
    echo "⚠️  Good progress! Tuning further..."
elif [ $SPEECH -ge 5 ]; then
    echo "⚠️  Moderate success. Adjusting..."
else
    echo "❌ Low accuracy. Trying more aggressive settings..."
fi

echo ""
echo "========================================="
echo "ROUND 2: More Aggressive Filtering"
echo "========================================="
echo ""

# Increase filtering
jq '.highpassFreq = "350" | .lowpassFreq = "3500" | .denoiseLevel = "-42" | .vadThreshold = "0.35"' \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "Updated settings:"
echo "  Highpass: 350Hz (more aggressive)"
echo "  Lowpass: 3500Hz (narrower band)"
echo "  Denoise: -42dB (stronger)"
echo "  VAD: 0.35 (more sensitive)"
echo ""

ROUND=2
for TEST_NUM in {1..10}; do
    echo "TEST $TEST_NUM/10 - SPEAK LOUDLY! (3 sec)..."
    sleep 1
    
    RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"deviceId":"default","duration":3}' \
        "$TEST_ENDPOINT")
    
    TRANSCRIPT=$(echo "$RESULT" | jq -r '.text // "ERROR"')
    
    if echo "$TRANSCRIPT" | grep -qiE "music|musique|música"; then
        TYPE="MUSIC"
        ICON="🎵"
    elif echo "$TRANSCRIPT" | grep -qiE "소음|ääniä|brus|noise|static|clicking"; then
        TYPE="NOISE"
        ICON="📢"
    else
        TYPE="SPEECH"
        ICON="✅"
    fi
    
    echo "$ICON $TRANSCRIPT"
    echo "R${ROUND}-T${TEST_NUM} | $TYPE | $TRANSCRIPT" >> noisy_preset_results.log
    
    if [ $TEST_NUM -lt 10 ]; then
        sleep 2
    fi
done

echo ""
echo "========================================="
echo "ROUND 2 RESULTS"
echo "========================================="

SPEECH_R2=$(grep "R2" noisy_preset_results.log | grep "SPEECH" | wc -l)
MUSIC_R2=$(grep "R2" noisy_preset_results.log | grep "MUSIC" | wc -l)
NOISE_R2=$(grep "R2" noisy_preset_results.log | grep "NOISE" | wc -l)

echo "Speech: $SPEECH_R2 / 10"
echo "Music: $MUSIC_R2 / 10"
echo "Noise: $NOISE_R2 / 10"
echo "Accuracy: $((SPEECH_R2 * 10))%"
echo ""

# Compare rounds
if [ $SPEECH_R2 -gt $SPEECH ]; then
    echo "✅ IMPROVEMENT! Round 2 better than Round 1"
    BEST_CONFIG="Round 2 (HP:350, LP:3500, DN:-42, VAD:0.35)"
else
    echo "⚠️  Round 1 was better. Reverting..."
    jq '.highpassFreq = "320" | .lowpassFreq = "3600" | .denoiseLevel = "-38" | .vadThreshold = "0.38"' \
        "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
    BEST_CONFIG="Round 1 (HP:320, LP:3600, DN:-38, VAD:0.38)"
fi

echo ""
echo "========================================="
echo "FINAL SUMMARY"
echo "========================================="
echo ""
echo "Total tests: 20"
echo "Round 1 accuracy: $((SPEECH * 10))%"
echo "Round 2 accuracy: $((SPEECH_R2 * 10))%"
echo ""
echo "Best configuration: $BEST_CONFIG"
echo ""
echo "All results saved to: noisy_preset_results.log"
echo ""

TOTAL_SPEECH=$((SPEECH + SPEECH_R2))
OVERALL_ACC=$((TOTAL_SPEECH * 100 / 20))

if [ $OVERALL_ACC -ge 90 ]; then
    echo "🎉 SUCCESS! Achieved 90%+ overall accuracy!"
elif [ $OVERALL_ACC -ge 70 ]; then
    echo "⚠️  Good: ${OVERALL_ACC}% - Close to target"
else
    echo "❌ ${OVERALL_ACC}% - Recommend reducing background music volume"
fi

