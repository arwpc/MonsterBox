# Audio UI Features - Manual Test Guide

## Overview
This guide helps you verify that audio playback works correctly in the MonsterBox UI.

---

## ✅ Test 1: Audio Configuration - Test Audio Output Button

**Location:** http://192.168.8.200:3000/setup/audio

**Steps:**
1. Navigate to **Setup > Audio** in the MonsterBox UI
2. Scroll to the **"Audio Output"** section
3. Click the **"Test Audio Output"** button
4. **Expected Result:** You should hear a monster howl sound through your speakers

**What it tests:**
- Server-side audio playback
- PipeWire audio routing
- Speaker configuration
- Audio device selection

**Technical Details:**
- Plays: `public/sounds/monster-howl-85304.mp3`
- Volume: 25%
- Player: mpg123
- Endpoint: `POST /setup/audio/api/test-system`

---

## ✅ Test 2: Audio Library - Play on Character Button

**Location:** http://192.168.8.200:3000/audio-library

**Steps:**
1. Navigate to **Audio Library** in the MonsterBox UI
2. Find any audio card in the library
3. Click the **"Play on Character"** button (speaker icon)
4. **Expected Result:** You should hear the audio file through your speakers

**What it tests:**
- Audio library playback system
- Character speaker routing
- Audio file streaming
- Volume control

**Technical Details:**
- Plays: Selected audio file from library
- Volume: 80%
- Character: Current selected character
- Endpoint: `POST /audio-library/api/audio/:id/play`

---

## ⚠️ Test 3: Audio Library - Play Preview Button (Browser Playback)

**Location:** http://192.168.8.200:3000/audio-library

**Steps:**
1. Navigate to **Audio Library** in the MonsterBox UI
2. Find any audio card in the library
3. Click the **blue Play button (▶)** on the audio card
4. A modal will open with a waveform player
5. Click the **Play/Pause button** in the modal
6. **Expected Result:** You should hear audio through **your computer's speakers** (not the server's speakers)

**What it tests:**
- Browser-based audio playback
- WaveSurfer.js player
- HTML5 Audio API
- Client-side audio streaming

**Technical Details:**
- Player: WaveSurfer.js with MediaElement backend
- Playback: Client-side (browser)
- Audio source: Streamed from `/audio-library/api/audio/:id/download`
- No server-side playback involved

**Note:** This plays through your computer/browser, not the MonsterBox server's speakers.

---

## 🔧 Automated Test Script

You can also run the automated test script to verify the API endpoints:

```bash
./scripts/test-audio-ui-features.sh
```

This script tests:
- ✅ Audio Configuration Test Audio Output API
- ✅ Audio Library Play on Character API
- ✅ UI pages load correctly
- ✅ Buttons exist in HTML

---

## 🎯 Expected Results Summary

| Feature | Location | Playback Type | Expected Sound |
|---------|----------|---------------|----------------|
| Test Audio Output | Setup > Audio | Server speakers | Monster howl |
| Play on Character | Audio Library | Server speakers | Selected audio |
| Play Preview | Audio Library | Browser/computer | Selected audio |

---

## 🐛 Troubleshooting

### No sound from "Test Audio Output" or "Play on Character"

1. **Check speaker connections:**
   ```bash
   wpctl status
   ```

2. **Check volume levels:**
   ```bash
   wpctl get-volume 81  # Default audio adapter
   ```

3. **Increase volume if needed:**
   ```bash
   wpctl set-volume 81 0.9
   ```

4. **Run diagnostic script:**
   ```bash
   ./scripts/test-audio-system.sh
   ```

5. **Check MonsterBox logs:**
   ```bash
   journalctl -u monsterbox -f
   ```

### No sound from "Play Preview" (Browser)

1. **Check browser audio:**
   - Ensure browser is not muted
   - Check browser's audio settings
   - Try a different browser

2. **Check browser console:**
   - Open Developer Tools (F12)
   - Look for JavaScript errors
   - Check Network tab for audio file loading

3. **Verify audio file exists:**
   - Audio files should be in `data/audio-library/files/`
   - Check file permissions

---

## 📊 Test Results

After testing, record your results:

- [ ] Test Audio Output button - Audible: _____ (Yes/No)
- [ ] Play on Character button - Audible: _____ (Yes/No)
- [ ] Play Preview button - Audible: _____ (Yes/No)

**Notes:**
_______________________________________________________________________
_______________________________________________________________________
_______________________________________________________________________

---

## 🚀 Quick Test URLs

- **Audio Configuration:** http://192.168.8.200:3000/setup/audio
- **Audio Library:** http://192.168.8.200:3000/audio-library

---

## 📝 Technical Notes

### Audio Playback Methods

MonsterBox uses three different audio playback methods:

1. **Server Playback (Test Audio Output, Play on Character)**
   - Uses `speaker_cli.py` wrapper
   - Routes through PipeWire
   - Plays on server's physical speakers
   - Players: mpg123, pw-play, paplay

2. **Browser Playback (Play Preview)**
   - Uses WaveSurfer.js
   - HTML5 Audio API
   - Plays on client's computer
   - No server-side audio processing

3. **Streaming Playback (TTS, Conversation)**
   - Uses `serverPlaybackService.js`
   - ffmpeg → paplay pipeline
   - Real-time audio streaming
   - Used for AI-generated speech

### Audio Files

- **Test Sound:** `public/sounds/monster-howl-85304.mp3`
- **Library Files:** `data/audio-library/files/*.mp3`
- **Character Audio:** `data/character-*/audio/*.wav`

---

**Last Updated:** October 16, 2025  
**MonsterBox Version:** 5.3  
**Audio System:** PipeWire 1.2.7

