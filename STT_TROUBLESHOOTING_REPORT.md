# STT Troubleshooting Report - ElevenLabs Scribe

**Date**: 2025-10-17  
**System**: MonsterBox 5.3 (Groundbreaker - Character ID 5)  
**Issue**: Extremely poor transcription quality despite multiple fixes

---

## Problem Statement

User is speaking clearly into microphone saying:
> "The quick brown fox jumped over the lazy dog"

But getting completely wrong transcriptions:
- "Pak Eazy", "Fuck, Daisy", "Quick, John" (early tests)
- "You know what?", "One five zero six" (after language_code fix)
- "Time to wake up", "Police", "Do you have any-", "There are two-" (after mic switch)
- "Praying over the letter" (latest test)

---

## Fixes Applied

### 1. ✅ Fixed Critical API Parameter Bug (CONFIRMED WORKING)

**Problem**: ElevenLabs STT API expects `language_code` parameter, but we were sending `language`

**Fix**: Changed in `services/elevenLabsSTTService.js` line 91:
```javascript
// Before (WRONG):
formData.append('language', langToSend);

// After (CORRECT):
formData.append('language_code', langToSend);
```

**Evidence**: After this fix, transcriptions switched from random languages (French, German, Spanish) to English-only. The fix IS working - we're now getting English text, just completely wrong English.

**Commits**: 
- `a2ff2d53` - Initial fix
- `193d0917` - Added debug logging

---

### 2. ✅ Switched to Better Microphone

**Problem**: Using webcam microphone (poor quality)

**Fix**: Switched to USB audio adapter in `data/character-5/ai-config/stt-config.json`:
```json
{
  "microphoneDeviceId": "alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback"
}
```

**Before**: `alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo` (webcam)  
**After**: USB Audio Adapter (Unitek Y-247A) - dedicated microphone input

**Commit**: `abb8ec7d`

---

### 3. ✅ Reduced Microphone Volume (Prevent Distortion)

**Problem**: Microphone volumes were too high causing distortion

**Fixes**:
- Webcam mic: 143% (9.32 dB) → 100% (0.00 dB)
- USB audio adapter: 200% (18.06 dB) → 80% (-5.81 dB)

**Commands**:
```bash
pactl set-source-volume alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo 100%
pactl set-source-volume alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback 80%
```

---

### 4. ✅ Enabled Debug Logging

**Command**:
```bash
sudo systemctl set-environment MB_DEBUG_AUDIO=1
```

**Problem**: Cannot see console.log output from MonsterBox service in journalctl. Logs are not appearing despite debug logging being enabled.

---

## Current Configuration

### STT Config (`data/character-5/ai-config/stt-config.json`)
```json
{
  "model": "scribe_english_v1",
  "language": "en",
  "format": "mp3",
  "sampleRate": 16000,
  "channels": 1,
  "microphonePartId": "4",
  "microphoneDeviceId": "alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback",
  "vadEnabled": true,
  "vadThreshold": 0.02,
  "vadSilenceDuration": 500,
  "audioFilterEnabled": false,
  "highpassFreq": 200,
  "lowpassFreq": 4200,
  "denoiseLevel": -20,
  "filterSfx": true,
  "validateEnglish": true,
  "minLetterRatio": 55,
  "requireVowels": true,
  "_preset": "clean-audio",
  "_presetName": "Clean Audio (No Filtering)"
}
```

### Audio Pipeline Flow

1. **Capture**: Python script (`python_wrappers/microphone_cli.py`) captures audio via PyAudio
   - Uses `PULSE_SOURCE` environment variable to select microphone
   - Captures 250ms chunks at 16kHz mono
   
2. **Accumulation**: `services/elevenLabsWebSocketService.js` accumulates PCM chunks
   - Keeps rolling 2-second buffer
   - Transcribes every 1 second (throttled)
   
3. **Encoding**: Converts PCM16LE to WAV format
   - Sample rate: 16000 Hz
   - Channels: 1 (mono)
   - Format: S16_LE
   
4. **Filtering**: DISABLED (`audioFilterEnabled: false`)
   - No FFmpeg filtering applied
   
5. **API Call**: `services/elevenLabsSTTService.js` sends to ElevenLabs
   - Endpoint: `POST https://api.elevenlabs.io/v1/speech-to-text`
   - Parameters: `model_id=scribe_v1`, `language_code=en`
   - File: WAV audio buffer

---

## Remaining Issues

### Issue 1: Transcription Accuracy Still Terrible

**Symptoms**: 
- User says "The quick brown fox jumped over the lazy dog"
- Gets "Praying over the letter"
- Completely wrong words, but in English

**Possible Causes**:
1. **Wrong microphone being used** - User may not be speaking into USB audio adapter
2. **Audio corruption in pipeline** - Something between capture and API is degrading audio
3. **ElevenLabs Scribe model quality** - API itself may not be accurate
4. **Audio chunks too short** - 2-second rolling buffer may not be enough context
5. **Network/API issues** - Packets corrupted or API having problems

### Issue 2: Cannot See Debug Logs

**Problem**: Console.log output from MonsterBox service not appearing in journalctl

**Attempted**:
```bash
sudo journalctl -u monsterbox -f --no-pager | grep -E "(STT|language_code)"
```

**Result**: No output, even with `MB_DEBUG_AUDIO=1` set

**Impact**: Cannot verify:
- Which microphone device is actually being used
- What audio buffer sizes are being sent
- What ElevenLabs API is returning
- Whether filtering is actually disabled

### Issue 3: Microphone Device Status

**Current Status**:
```bash
pactl list sources short
```

Output shows:
- Webcam mic: `IDLE` (was recently used)
- USB audio adapter: `SUSPENDED` (not being used)

**Concern**: System may still be using webcam mic despite config change

---

## Technical Details

### Available Microphones

1. **Webcam Microphone** (Currently NOT configured):
   - Device: `alsa_input.usb-HHWei_Technology_Co.__Ltd._USB_Camera_HHW001-02.analog-stereo`
   - Description: USB Camera Analog Stereo
   - Channels: 2 (stereo)
   - Sample Rate: 48000 Hz
   - Volume: 100% (0.00 dB)
   - Status: IDLE

2. **USB Audio Adapter** (Currently configured):
   - Device: `alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback`
   - Description: Audio Adapter (Unitek Y-247A) Mono
   - Channels: 1 (mono)
   - Sample Rate: 48000 Hz
   - Volume: 80% (-5.81 dB)
   - Status: SUSPENDED

### Code Locations

**STT Service**: `services/elevenLabsSTTService.js`
- Line 91: `formData.append('language_code', langToSend)` ✅ FIXED
- Line 82-83: Debug logging added

**WebSocket Service**: `services/elevenLabsWebSocketService.js`
- Line 830: Captures 250ms chunks
- Line 855-890: STT transcription logic
- Line 873: Audio filtering check (should be disabled)
- Line 890: Calls `elevenLabsSTTService.transcribeAudio()`

**Server STT Listener**: `services/serverSTTListener.js`
- Line 270-290: `_captureWithPython()` - captures audio via Python
- Line 276: Sets `PULSE_SOURCE` environment variable
- Line 293-307: `captureChunkWav()` - main capture function

**Python Microphone CLI**: `python_wrappers/microphone_cli.py`
- Line 27-46: `_setup_pipewire_source()` - sets up PulseAudio source
- Line 42: Uses `PULSE_SOURCE` environment variable

---

## What Works

1. ✅ **Language parameter fix** - Transcriptions are now English-only (not random languages)
2. ✅ **Service is running** - MonsterBox service is active and responding
3. ✅ **WebSocket connection** - STT page connects successfully
4. ✅ **Audio capture** - VU meter shows audio levels (user confirmed 80-100%)
5. ✅ **API calls succeeding** - Getting responses from ElevenLabs (not errors)

---

## What Doesn't Work

1. ❌ **Transcription accuracy** - Completely wrong words despite clear speech
2. ❌ **Debug logging visibility** - Cannot see console.log output
3. ❌ **Microphone verification** - Cannot confirm which mic is actually being used

---

## Next Steps for Investigation

### Priority 1: Verify Microphone Source

**Need to confirm**: Is the USB audio adapter actually being used?

**How to verify**:
1. Check if `PULSE_SOURCE` is being set correctly in Python process
2. Monitor which PulseAudio source becomes RUNNING when STT starts
3. Test recording directly from USB audio adapter to verify it works

**Commands to try**:
```bash
# Monitor source status in real-time
watch -n 0.5 'pactl list sources short'

# Test direct recording from USB audio adapter
parecord -d alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback --channels=1 --rate=16000 test.wav
```

### Priority 2: Get Debug Logs Working

**Need to see**: Actual console.log output from MonsterBox service

**Options**:
1. Find where MonsterBox logs are actually written (not journalctl)
2. Add file-based logging to capture debug output
3. Run MonsterBox in foreground to see console output

### Priority 3: Test Audio Quality

**Need to verify**: Audio reaching ElevenLabs is not corrupted

**How to test**:
1. Save a captured audio chunk to file
2. Play it back to verify quality
3. Send same file directly to ElevenLabs API via curl
4. Compare transcription results

**Example**:
```bash
# Test ElevenLabs API directly with a file
curl -X POST "https://api.elevenlabs.io/v1/speech-to-text" \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
  -F "model_id=scribe_v1" \
  -F "language_code=en" \
  -F "file=@test_audio.wav"
```

### Priority 4: Increase Audio Context

**Current**: Sending 2-second rolling buffer every 1 second

**Try**: Increase buffer size to 3-4 seconds for more context

**Change in**: `services/elevenLabsWebSocketService.js` line 838:
```javascript
// Current:
const maxBytes = 16000 * 2 * 2; // 2 seconds

// Try:
const maxBytes = 16000 * 2 * 4; // 4 seconds
```

---

## Environment

- **System**: Raspberry Pi (ARM64)
- **OS**: Linux (PipeWire audio)
- **Node.js**: v20.19.5
- **MonsterBox**: 5.3
- **Character**: Groundbreaker (ID: 5)
- **Service**: systemd unit `monsterbox.service`
- **Port**: 3100 (HTTP), 8795 (WebSocket)

---

## Conclusion

The `language_code` fix is **confirmed working** - we're now getting English-only transcriptions instead of random languages. However, the transcription accuracy is still extremely poor, suggesting either:

1. **Audio quality issue** - The audio reaching ElevenLabs is severely degraded
2. **Wrong microphone** - Still using webcam instead of USB audio adapter
3. **ElevenLabs API quality** - Scribe model may not be accurate enough
4. **Configuration issue** - Some setting is causing audio corruption

**Critical next step**: Verify which microphone is actually being used and test the audio quality reaching the API.

