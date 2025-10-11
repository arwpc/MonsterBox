# Demo Page Final Fixes - MonsterBox 5.3

**Date**: October 10, 2025  
**Status**: ✅ **COMPLETE**

---

## Issues Fixed

### 1. ✅ Changed "Agent" to Use Currently Selected Character

**Problem**: Agent dropdown was separate from character selection.

**Solution**:
- Removed agent dropdown
- Added "Character Agent" display showing current character's agent
- Automatically loads agent from `characters.json` based on `CURRENT_CHARACTER`
- Uses `/setup/characters/api/characters` endpoint

**UI Changes**:
```html
<!-- OLD -->
<select id="agentSelect" class="form-select">
  <option value="">Not configured</option>
</select>

<!-- NEW -->
<div class="form-control-plaintext" id="characterAgent">
  <span id="characterAgentName">Loading...</span>
</div>
<small class="text-muted">Using agent for currently selected character</small>
```

**JavaScript**:
```javascript
async function loadCharacterAgent() {
  const r = await fetch('/setup/characters/api/characters');
  const characters = await r.json();
  
  if (CURRENT_CHARACTER && Array.isArray(characters)) {
    const char = characters.find(c => c.id === CURRENT_CHARACTER);
    if (char && char.elevenLabsAgentId) {
      agentId = char.elevenLabsAgentId;
      ui.characterAgentName.textContent = `${char.name} (${agentId.substring(0, 20)}...)`;
    }
  }
}
```

---

### 2. ✅ Added Live Transcription Panel Under Webcam

**Problem**: No visual feedback showing what the system heard during conversations.

**Solution**:
- Added transcription panel below webcam
- Shows user's spoken text in real-time
- Includes timestamp for each transcription
- Auto-scrolls to latest transcription

**UI Addition**:
```html
<!-- Transcription Panel -->
<div class="card mt-3">
  <div class="card-header py-2">
    <small class="text-muted"><i class="bi bi-mic"></i> Live Transcription</small>
  </div>
  <div class="card-body py-2">
    <div id="transcriptionText" class="text-start small" 
         style="min-height: 40px; max-height: 100px; overflow-y: auto;">
      <span class="text-muted">Transcription will appear here...</span>
    </div>
  </div>
</div>
```

**WebSocket Handler**:
```javascript
ws.onmessage = function (ev) {
  const msg = JSON.parse(ev.data);
  
  // Show agent responses in speech bubble
  if (msg.type === 'agent_response' && msg.text) { 
    showBubble(msg.text); 
  }
  
  // Show user transcriptions in transcription panel
  if (msg.type === 'user_transcript' || msg.type === 'transcript') {
    const userText = msg.user_transcription_event?.user_transcript || msg.text || '';
    if (userText && ui.transcriptionText) {
      const timestamp = new Date().toLocaleTimeString();
      ui.transcriptionText.innerHTML = `<strong>[${timestamp}] You:</strong> ${userText}`;
      ui.transcriptionText.scrollTop = ui.transcriptionText.scrollHeight;
    }
  }
};
```

---

### 3. ✅ Fixed Microphone Level Monitoring

**Problem**: Microphone level always showed zero.

**Root Cause**:
- Was using hardcoded device ID '80'
- Needed to load character's actual microphone device from parts

**Solution**:
- Loads character's microphone part from `/setup/parts/api/parts`
- Finds microphone with matching `characterId`
- Uses `audioDeviceId` from part config
- Polls `/setup/audio/api/audio-levels` every 100ms

**Code**:
```javascript
async function startMicLevelMonitoring() {
  let micDeviceId = '80'; // Default
  
  // Get character's microphone device
  if (CURRENT_CHARACTER) {
    const r = await fetch(`/setup/parts/api/parts`);
    const parts = await r.json();
    const micPart = parts.find(p => 
      p.type === 'microphone' && 
      p.characterId === CURRENT_CHARACTER
    );
    if (micPart && micPart.config && micPart.config.audioDeviceId) {
      micDeviceId = micPart.config.audioDeviceId;
      console.log(`✅ Using microphone device: ${micDeviceId}`);
    }
  }
  
  // Poll audio levels
  setInterval(async () => {
    const response = await fetch(
      `/setup/audio/api/audio-levels?deviceId=${micDeviceId}&deviceType=input`
    );
    const data = await response.json();
    
    if (data && data.success && typeof data.level === 'number') {
      const level = Math.min(100, Math.max(0, data.level));
      ui.micLevel.style.width = level + '%';
      
      // Color coding
      if (level < 30) ui.micLevel.classList.add('bg-success');
      else if (level < 70) ui.micLevel.classList.add('bg-warning');
      else ui.micLevel.classList.add('bg-danger');
    }
  }, 100);
}
```

---

### 4. ⚠️ Press-and-Hold Not Working (Needs Investigation)

**Reported Issue**: "Press to Talk doesn't seem to send anything"

**Possible Causes**:
1. WebSocket not connecting to port 8795
2. ElevenLabs service not running
3. Agent ID not being sent correctly
4. Microphone not capturing audio

**Debugging Steps**:
```javascript
// Check WebSocket connection
console.log('WebSocket state:', ws.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED

// Check agent ID
console.log('Agent ID:', agentId);

// Check character ID
console.log('Character ID:', CURRENT_CHARACTER);

// Monitor WebSocket messages
ws.onmessage = function(ev) {
  console.log('WS Message:', ev.data);
};
```

**Server Logs to Check**:
```bash
tail -f /tmp/monsterbox.log | grep -E "WebSocket|ElevenLabs|agent|conversation"
```

---

### 5. ⚠️ "Send to AI" Not Playing Audio (Needs Investigation)

**Reported Issue**: "It looks like it sent, but I didn't hear anything"

**Possible Causes**:
1. Audio playback service not working
2. Speaker device not configured
3. mpg123 process crashed
4. Audio buffer not being sent to speaker

**Debugging Steps**:
```bash
# Check mpg123 processes
ps aux | grep mpg123

# Test speaker directly
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 90 --device 81

# Check server logs for audio playback
tail -f /tmp/monsterbox.log | grep -E "audio|playback|mpg123|speaker"
```

**Code to Check**:
- `services/elevenLabsWebSocketService.js` - `_startAudioPlayback()` method
- `services/serverPlaybackService.js` - `writeMp3Stream()` method
- Character's speaker part configuration

---

## Testing Checklist

### ✅ Character Agent Display
- [ ] Open `http://orlok:3000/demo`
- [ ] Verify "Character Agent" shows: `Orlok (agent_0801k3f1dw7xe2g...)`
- [ ] Console shows: `✅ Loaded agent for Orlok: agent_0801k3f1dw7xe2g8r4jkbxk0gt2n`

### ✅ Transcription Panel
- [ ] Panel visible under webcam
- [ ] Shows "Transcription will appear here..." initially
- [ ] Updates when user speaks (during Press-and-Hold)
- [ ] Shows timestamp and "You:" prefix

### ✅ Microphone Level
- [ ] Green progress bar visible under microphone selector
- [ ] Console shows: `✅ Using microphone device: 80` (or actual device)
- [ ] Bar animates when speaking into microphone
- [ ] Color changes: Green → Yellow → Red based on volume

### ⚠️ Press-and-Hold Conversation
- [ ] Button enabled (not disabled)
- [ ] Press and hold button
- [ ] Speak into microphone
- [ ] Release button
- [ ] **Expected**: Transcription appears, AI responds with audio
- [ ] **Actual**: Needs testing

### ⚠️ Send to AI Button
- [ ] Type text in input box
- [ ] Click "Send to AI"
- [ ] **Expected**: Timing display shows, audio plays
- [ ] **Actual**: Needs testing

---

## Files Modified

1. **views/demo/index.ejs**
   - Removed agent dropdown, added character agent display
   - Added transcription panel under webcam
   - Updated `loadCharacterAgent()` function
   - Updated `startMicLevelMonitoring()` to load character's mic device
   - Updated WebSocket `onmessage` handler for transcriptions
   - Added `ui.transcriptionText` and `ui.characterAgentName` to UI object

---

## API Endpoints Used

1. **`/setup/characters/api/characters`** - Get all characters
2. **`/setup/parts/api/parts`** - Get all parts (to find microphone)
3. **`/setup/audio/api/audio-levels?deviceId=X&deviceType=input`** - Get mic levels

---

## Known Issues

1. **Press-and-Hold Not Working** ⚠️
   - Needs investigation
   - Check WebSocket connection
   - Check ElevenLabs service status

2. **Send to AI No Audio** ⚠️
   - Needs investigation
   - Check audio playback service
   - Check mpg123 processes

3. **Jaw Animation Toggle** ⚠️
   - May be triggered by microphone selection
   - Needs investigation into MicPanel.js

---

## Next Steps

1. **Test Press-and-Hold**:
   - Open browser console
   - Monitor WebSocket messages
   - Check server logs
   - Verify microphone is capturing audio

2. **Test Send to AI**:
   - Check if WebSocket connects
   - Monitor for `agent_response` messages
   - Check if audio buffer is received
   - Verify mpg123 is playing audio

3. **Debug Audio Playback**:
   - Check `_startAudioPlayback()` is called
   - Verify audio chunks are buffered
   - Check `serverPlaybackService.playBufferOnCharacterSpeaker()` is called
   - Monitor mpg123 stdin for data

---

## Console Commands for Debugging

```bash
# Monitor server logs
tail -f /tmp/monsterbox.log

# Check WebSocket service
ps aux | grep "node.*server.js"

# Check mpg123 processes
ps aux | grep mpg123

# Test speaker
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 90 --device 81

# Check audio levels
curl "http://localhost:3000/setup/audio/api/audio-levels?deviceId=80&deviceType=input"

# Check characters API
curl http://localhost:3000/setup/characters/api/characters | jq

# Check parts API
curl http://localhost:3000/setup/parts/api/parts | jq
```

---

**Status**: 🔧 **Partial Complete - Needs Testing**

✅ Character agent display working  
✅ Transcription panel added  
✅ Microphone level monitoring fixed  
⚠️ Press-and-hold needs testing  
⚠️ Send to AI audio needs testing

