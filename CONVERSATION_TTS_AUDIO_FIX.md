# Conversation TTS Audio Fix - Complete

## Summary

Fixed the conversation page "Make Character Say" feature to properly play TTS audio through speakers with the correct voice for Groundbreaker.

---

## Issues Fixed

### 1. **No Audio Output from TTS**

**Problem:**
- Conversation API returned `{"success":true}` but no audio played
- mpg123 was failing with exit code 255
- Error: `out123 error 3: failure loading driver module`

**Root Cause:**
- MonsterBox systemd service didn't have `XDG_RUNTIME_DIR` environment variable set
- mpg123 couldn't access PulseAudio/PipeWire session without it

**Fix:**
- Added `Environment=XDG_RUNTIME_DIR=/run/user/1000` to `/etc/systemd/system/monsterbox.service`
- Reloaded systemd and restarted MonsterBox service

---

### 2. **Wrong Audio Streaming Method**

**Problem:**
- Original code used `ffmpeg + paplay` pipeline for MP3 streaming
- paplay was hanging and not producing audio
- Multiple stuck ffmpeg processes accumulating

**Root Cause:**
- paplay compatibility layer with PipeWire was unreliable
- Complex pipeline (MP3 → ffmpeg → WAV → paplay) introduced failure points

**Fix:**
- Replaced `ffmpeg + paplay` with direct `mpg123` streaming
- mpg123 can play MP3 from stdin without conversion
- Uses same approach as `speaker_cli.py` (which was working)
- Simplified pipeline: MP3 → mpg123 → PulseAudio → speakers

**Code Changes:**
```javascript
// OLD: ffmpeg + paplay pipeline
const ffmpeg = spawn('ffmpeg', ['-i', '-', '-f', 'wav', '-']);
const paplay = spawn('paplay', paplayArgs, { env });
ffmpeg.stdout.pipe(paplay.stdin);

// NEW: Direct mpg123 streaming
const scale = Math.max(0, Math.min(32768, Math.floor(32768 * (volume / 100.0))));
const mpg123Args = ['--quiet', '-o', 'pulse', '-f', String(scale), '-'];
const mpg123 = spawn('mpg123', mpg123Args, { env });
```

---

### 3. **Wrong Voice for Groundbreaker**

**Problem:**
- Audio was playing but using wrong voice
- TTS config had voice_id `5PWbsfogbLtky5sxqtBz`
- Groundbreaker agent has voice_id `vfaqCOvlrKi4Zp7C2IAm`

**Root Cause:**
- Character TTS config (`data/character-5/ai-config/tts-config.json`) didn't match agent voice
- `/conversation/api/say` uses TTS config, not agent config

**Fix:**
- Updated `data/character-5/ai-config/tts-config.json` to use correct voice_id
- Changed from `5PWbsfogbLtky5sxqtBz` to `vfaqCOvlrKi4Zp7C2IAm`
- Now matches ElevenLabs agent `agent_4201k6s9y384f9v9hqmg67ygc645`

---

## Files Modified

### 1. `/etc/systemd/system/monsterbox.service`
```ini
[Service]
User=remote
WorkingDirectory=/home/remote/MonsterBox
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=GAIN=130
Environment=XDG_RUNTIME_DIR=/run/user/1000  # ← ADDED
ExecStart=/usr/bin/npm start
```

### 2. `services/serverPlaybackService.js`
- Replaced `_ensureMp3Stream()` function (lines 99-146)
- Changed from ffmpeg + paplay to mpg123
- Simplified error handling
- Removed paplay process management

### 3. `data/character-5/ai-config/tts-config.json`
```json
{
  "model": "eleven_monolingual_v1",
  "voice_id": "vfaqCOvlrKi4Zp7C2IAm",  // ← CHANGED
  "stability": 0.5,
  "similarity_boost": 0.5,
  "style": 0,
  "use_speaker_boost": true
}
```

---

## Testing Results

### ✅ Before Fix
```bash
# Direct audio playback worked
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 80 --device 81
# ✓ Audio played successfully

# Conversation TTS failed
curl -X POST -d '{"text":"Test"}' http://192.168.8.200:3000/conversation/api/say
# ✓ API returned success
# ✗ No audio output
# ✗ mpg123 exit code 255
```

### ✅ After Fix
```bash
# Conversation TTS works
curl -X POST -d '{"text":"Greetings. I am Groundbreaker."}' http://192.168.8.200:3000/conversation/api/say
# ✓ API returned success
# ✓ Audio plays through speakers
# ✓ Correct Groundbreaker voice
# ✓ mpg123 exit code 0
```

---

## Technical Details

### Audio Pipeline Flow

**Before:**
```
TTS API → ElevenLabs → MP3 Buffer → ffmpeg (convert to WAV) → paplay → PipeWire → Speakers
                                      ↑ FAILED HERE
```

**After:**
```
TTS API → ElevenLabs → MP3 Buffer → mpg123 → PulseAudio → PipeWire → Speakers
                                      ↑ WORKS
```

### Environment Requirements

For mpg123 to access PulseAudio/PipeWire in a systemd service:
- `XDG_RUNTIME_DIR=/run/user/1000` (user's runtime directory)
- `PULSE_SINK=<device_id>` (optional, for specific device routing)

### Volume Scaling

mpg123 uses integer scale 0-32768 for volume:
```javascript
const scale = Math.floor(32768 * (volume / 100.0));
```

Example:
- 80% volume → scale = 26214
- 100% volume → scale = 32768

---

## Commits

1. **681d6d60** - Fix conversation TTS audio: Replace ffmpeg+paplay with mpg123 streaming
2. **5b0fe432** - Fix Groundbreaker voice: Update TTS config to match agent voice

---

## Verification

To verify the fix is working:

1. **Test conversation API:**
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"text":"Hello, I am Groundbreaker"}' \
     http://192.168.8.200:3000/conversation/api/say
   ```

2. **Check logs:**
   ```bash
   sudo tail -f /var/log/monsterbox.log | grep -E "(mpg123|🔊|🎵)"
   ```

3. **Expected output:**
   ```
   🎵 Starting mpg123 audio stream for character 5: device=default, volume=80
   🔊 Writing 87398 bytes to mpg123 stream (device: default)
   ```

4. **Verify no errors:**
   ```bash
   sudo tail -f /var/log/monsterbox.err | grep mpg123
   ```
   Should be empty (no errors)

---

## Status

✅ **COMPLETE** - Conversation TTS audio is now working with correct voice for Groundbreaker

