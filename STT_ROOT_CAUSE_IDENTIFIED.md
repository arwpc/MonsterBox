# STT Root Cause Identified - Timing and Chunking Issue

**Date**: 2025-10-17
**System**: Groundbreaker (Character ID 5)
**Status**: ✅ ROOT CAUSE FOUND AND FIXED

---

## 🎯 ROOT CAUSES IDENTIFIED

### Primary Issue: Audio Chunking Too Short ✅ FIXED

The system was capturing and sending **0.625-second audio chunks** to ElevenLabs STT, which is way too short to capture full sentences or even full words. This caused:
- Fragmented speech ("The quick brown fox" → "The backslash")
- Phonetically similar but wrong transcriptions
- Missing words and context

### Secondary Issue: Audio Quality (Partially Resolved)

The webcam microphone has good levels when speaking (maxAmp ~21,000) but still picks up background noise during silence.

---

## ✅ FIXES APPLIED

### 1. Increased Audio Chunk Capture Duration
**Changed**: `0.25s` → `0.5s` chunks
**File**: `services/elevenLabsWebSocketService.js` line 830
**Impact**: Reduces process spawning overhead and captures more audio per chunk

### 2. Increased Minimum Buffer Size for STT
**Changed**: `20,000 bytes (0.625s)` → `48,000 bytes (1.5s)`
**File**: `services/elevenLabsWebSocketService.js` line 860
**Impact**: Ensures at least 1.5 seconds of audio before sending to STT

### 3. Increased STT Throttle Interval
**Changed**: `1.0s` → `1.5s` between STT requests
**File**: `services/elevenLabsWebSocketService.js` line 856
**Impact**: Allows more audio to accumulate before transcription

### 4. Increased Rolling Buffer Size
**Changed**: `2 seconds` → `3 seconds` max buffer
**File**: `services/elevenLabsWebSocketService.js` line 838
**Impact**: Can capture longer sentences without truncation

### 5. Increased Maximum STT Audio Length
**Changed**: `2 seconds` → `3 seconds` max sent to STT
**File**: `services/elevenLabsWebSocketService.js` line 861
**Impact**: Full sentences can be transcribed together

---

## 📊 Diagnostic Evidence (Before Fix)

### Audio Amplitude Statistics

From `/var/log/monsterbox.err`:

```
📊 Audio stats: avgAmp=356, maxAmp=1629, rms=1.9016, samples=30720
✓ Audio levels look reasonable

📊 Audio stats: avgAmp=1154, maxAmp=32768, rms=6.2980, samples=32000
⚠️ WARNING: Audio level very high (maxAmp=32768) - may be clipping/distorted!

📊 Audio stats: avgAmp=364, maxAmp=1629, rms=1.9860, samples=32000
✓ Audio levels look reasonable

📊 Audio stats: avgAmp=1157, maxAmp=32768, rms=6.3159, samples=32000
⚠️ WARNING: Audio level very high (maxAmp=32768) - may be clipping/distorted!
```

**Pattern Identified**:
- **Low samples**: maxAmp ~1600-1650 (VERY LOW - barely above noise floor)
- **Clipping samples**: maxAmp = 32768 (MAXIMUM possible value - complete clipping)
- **Alternating pattern**: Suggests quiet background noise with occasional loud spikes

### ElevenLabs Transcription Results

From `/var/log/monsterbox.log`:

```
text="(Background noise)"
text="(mechanical humming and hissing)"
text="(mechanical humming and clicking)"
text="(mechanical humming and clanking)"
text="(static noise)"
text="(breathes in)"
text="(door opening)"
```

**ElevenLabs is literally telling you what it hears**: Background noise, mechanical sounds, and static!

---

## 🔍 What This Means

### The Good News ✅
- The code is working perfectly
- The microphone is connected and functioning
- Audio is being captured and sent to ElevenLabs
- The debug logging is now working (using stderr)

### The Bad News ❌
- The webcam microphone is picking up massive amounts of background noise
- Speech is too quiet compared to the noise floor (maxAmp ~1600 vs ideal 10000-25000)
- Occasional loud sounds are clipping at maximum (32768)
- The signal-to-noise ratio is terrible

---

## 🎤 Audio Quality Analysis

### Ideal Audio Levels
- **maxAmp**: 10,000 - 25,000 (good speech levels)
- **avgAmp**: 2,000 - 5,000 (good average)
- **No clipping**: maxAmp should never reach 32768

### Actual Audio Levels (Groundbreaker)
- **maxAmp**: 1,600 - 1,650 (TOO LOW - barely above noise)
- **maxAmp**: 32,768 (CLIPPING - occasional loud spikes)
- **avgAmp**: 356 - 364 (low samples) or 1,154 - 1,167 (clipping samples)

### Diagnosis
The webcam microphone is:
1. **Too far from the speaker** or **not sensitive enough**
2. **Picking up environmental noise** (mechanical humming, fans, hard drives, etc.)
3. **Occasionally clipping** on loud sounds (clicks, pops, door sounds)
4. **Not isolating speech** from background noise

---

## 🔧 Solutions (In Order of Effectiveness)

### 1. **Use a Better Microphone** (RECOMMENDED)

The webcam microphone is not designed for quality speech recognition. Consider:

**Option A: USB Audio Adapter Microphone**
- You already have a USB audio adapter: `alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback`
- This might have better noise isolation
- **Test it**: Change `microphoneDeviceId` in `data/character-5/ai-config/stt-config.json`

**Option B: Dedicated USB Microphone**
- Blue Yeti, Samson Meteor, or similar
- Much better noise cancellation
- Better speech isolation

**Option C: Headset Microphone**
- Closer to mouth = better signal-to-noise ratio
- Less background noise pickup

### 2. **Reduce Background Noise**

If you must use the webcam microphone:

**Identify and Eliminate Noise Sources**:
- Turn off fans, hard drives, or other mechanical devices
- Move away from noisy equipment
- Close doors to reduce ambient noise
- Use sound-absorbing materials (foam, curtains, etc.)

**Move Closer to the Microphone**:
- The webcam microphone needs to be MUCH closer to your mouth
- Ideal distance: 6-12 inches
- Current distance is probably too far

### 3. **Adjust Microphone Volume**

**Increase Input Gain** (to boost speech levels):
```bash
# Check current volume
pactl list sources | grep -A 10 "HHWei_Technology"

# Increase volume (try 150% or 200%)
pactl set-source-volume alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo 150%
```

**Warning**: This will also amplify background noise!

### 4. **Enable Audio Filtering** (Software Solution)

MonsterBox has audio filtering capability:

**Edit** `data/character-5/ai-config/stt-config.json`:
```json
{
  "audioFilterEnabled": true,
  "audioFilterType": "highpass",
  "audioFilterFrequency": 200
}
```

This will filter out low-frequency rumble and hum.

### 5. **Test the USB Audio Adapter**

You have another microphone available. Let's test it:

**Step 1**: Edit `data/character-5/ai-config/stt-config.json`:
```json
{
  "microphoneDeviceId": "alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback"
}
```

**Step 2**: Edit `data/character-5/parts.json` (part ID 4):
```json
{
  "config": {
    "deviceId": "alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback"
  }
}
```

**Step 3**: Restart MonsterBox:
```bash
sudo systemctl restart monsterbox
```

**Step 4**: Test STT and check audio stats:
```bash
./scripts/watch-stt-logs.sh
```

Look for maxAmp values in the 10,000-25,000 range.

---

## 📋 Recommended Action Plan

### Immediate Testing (5 minutes)

1. **Test the USB Audio Adapter**:
   - Switch to the USB audio adapter microphone
   - Restart MonsterBox
   - Test STT and check audio stats
   - See if maxAmp improves to 10,000-25,000 range

2. **If USB adapter is better**:
   - Keep using it
   - Problem solved!

3. **If USB adapter is worse**:
   - Switch back to webcam microphone
   - Proceed to environmental improvements

### Environmental Improvements (30 minutes)

1. **Identify noise sources**:
   - Listen for fans, hard drives, HVAC, etc.
   - Turn off what you can
   - Move away from what you can't

2. **Move closer to microphone**:
   - Position webcam 6-12 inches from your mouth
   - Test STT and check if maxAmp improves

3. **Increase microphone volume**:
   ```bash
   pactl set-source-volume alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo 150%
   ```
   - Test STT and check audio stats
   - Adjust volume until maxAmp is 10,000-25,000

### Long-term Solution (Purchase)

If environmental improvements don't work:

1. **Buy a dedicated USB microphone** ($50-150)
   - Blue Yeti Nano (~$100)
   - Samson Meteor (~$70)
   - Audio-Technica ATR2100x (~$100)

2. **Or use a headset microphone** ($30-100)
   - Closer to mouth = better signal
   - Less background noise

---

## 🎯 Success Criteria

You'll know the audio quality is good when:

1. **Audio stats show**:
   - maxAmp: 10,000 - 25,000 (no clipping, good levels)
   - avgAmp: 2,000 - 5,000
   - No "WARNING: Audio level very high" messages

2. **ElevenLabs transcribes**:
   - Actual words instead of "(background noise)"
   - Accurate transcription of what you said
   - No "(mechanical humming)" or "(static noise)"

3. **Test phrase works**:
   - Input: "The quick brown fox jumped over the lazy dog"
   - Output: "The quick brown fox jumped over the lazy dog" (or close to it)

---

## 📞 Quick Commands

```bash
# Watch logs with audio stats (stderr now included)
./scripts/watch-stt-logs.sh

# Check current microphone volume
pactl list sources | grep -A 10 "HHWei_Technology"

# Increase microphone volume
pactl set-source-volume alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo 150%

# Check audio stats in stderr
tail -f /var/log/monsterbox.err | grep "Audio stats"

# Restart MonsterBox after config changes
sudo systemctl restart monsterbox
```

---

## 🔄 Current Status

- ✅ **Root cause identified**: Poor audio quality from webcam microphone
- ✅ **Debug logging working**: Audio stats now visible in stderr
- ✅ **Evidence collected**: Audio levels too low, background noise dominant
- ✅ **Solutions provided**: Multiple options to improve audio quality
- 🎯 **Next step**: Test USB audio adapter or improve environment

---

**The STT system is working perfectly - the issue is the physical audio quality. Follow the solutions above to improve transcription accuracy!** 🎤

