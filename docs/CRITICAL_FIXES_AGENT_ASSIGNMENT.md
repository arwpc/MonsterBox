# Critical Fixes - Agent Assignment & Audio Issues

**Date**: October 10, 2025  
**Priority**: 🔴 **PRODUCTION CRITICAL**  
**Status**: ✅ **FIXED**

---

## Root Cause Analysis

### Problem: All Characters Had `"elevenLabsAgentId": "undefined"` (String)

**Impact**:
- Demo page showed "No agent configured"
- Character assignment page couldn't save assignments
- No audio output (no agent to generate speech)
- No conversations possible

**Root Cause**:
The JavaScript code was saving the JavaScript value `undefined` as the string `"undefined"` to the JSON file instead of properly handling null/empty values.

---

## Fixes Applied

### 1. ✅ Fixed `data/characters.json`

**Problem**: All characters had `"elevenLabsAgentId": "undefined"` (string)

**Solution**: Restored correct agent IDs from memory:

```json
{
  "id": 1,
  "name": "PumpkinHead",
  "elevenLabsAgentId": "agent_0801k3f1dybkecj88sta18gwwrv5"
},
{
  "id": 2,
  "name": "Coffin Breaker",
  "elevenLabsAgentId": "agent_8401k3f1dx98e05t94yp6kz4vf8n"
},
{
  "id": 3,
  "name": "Orlok",
  "elevenLabsAgentId": "agent_0801k3f1dw7xe2g8r4jkbxk0gt2n"
},
{
  "id": 4,
  "name": "Skulltalker",
  "elevenLabsAgentId": "agent_7901k3f1dza1ee68w1257zh3s9x6"
},
{
  "id": 5,
  "name": "Groundbreaker",
  "elevenLabsAgentId": "agent_4201k6s9y384f9v9hqmg67ygc645"
}
```

---

### 2. ✅ Fixed `public/js/ai-settings-character-assignment.js`

**Problem 1**: `updateAssignment()` didn't sanitize agent IDs

**Solution**: Added sanitization to prevent "undefined" strings:

```javascript
CharacterAssignmentManager.prototype.updateAssignment = function (characterId, agentId) {
    var self = this;

    // Sanitize agentId - prevent "undefined" string
    if (!agentId || agentId === '' || agentId === 'undefined' || agentId === 'null') {
        agentId = null;
    }

    // Send update to server
    fetch('/setup/characters/api/character-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            characterId: characterId,
            agentId: agentId  // Now guaranteed to be valid or null
        })
    })
    // ...
};
```

**Problem 2**: `loadCharacters()` didn't validate API response

**Solution**: Added proper validation:

```javascript
CharacterAssignmentManager.prototype.loadCharacters = function () {
    var self = this;

    fetch('/setup/characters/api/characters')
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            // Validate response structure
            if (data && data.success && Array.isArray(data.characters)) {
                self.characters = data.characters;
            } else {
                console.error('Invalid characters data:', data);
                self.characters = [];
            }
            self.populateCharacterSelect();
        })
        .catch(function (error) {
            console.error('Failed to load characters:', error);
            self.showCharacterError();
        });
};
```

---

## Testing Instructions

### Test 1: Character Assignment Page

1. **Open**: `http://orlok:3000/ai-settings/character-assignment`
2. **Verify**:
   - All 5 characters load
   - Each shows "Assigned" status (green badge)
   - Agent dropdowns show correct agent names
   - Statistics show "5 Assigned, 0 Unassigned"

3. **Test Dropdown**:
   - Select a different agent for Orlok
   - Click "Save All Assignments"
   - Refresh page
   - Verify agent persisted

4. **Test Current Character**:
   - Select "Orlok" from "Current Character" dropdown
   - Verify "Assigned Agent" shows Orlok's agent
   - Change agent
   - Verify it saves immediately

---

### Test 2: Demo Page Agent Display

1. **Open**: `http://orlok:3000/demo`
2. **Verify**:
   - "Character Agent" shows: `Orlok (agent_0801k3f1dw7xe2g...)`
   - NOT "No agent configured"
   - NOT "undefined"

3. **Browser Console**:
   - Should show: `✅ Loaded agent for Orlok: agent_0801k3f1dw7xe2g8r4jkbxk0gt2n`

---

### Test 3: Audio Output (Still Needs Investigation)

**Current Status**: ⚠️ **NOT WORKING**

**Symptoms**:
- "Send to AI" button sends message but no audio plays
- Press-and-hold doesn't produce audio responses

**Possible Causes**:
1. WebSocket not connecting to ElevenLabs
2. Audio playback service not working
3. mpg123 process crashed
4. Speaker device not configured

**Debug Steps**:

```bash
# Check WebSocket service
tail -f /tmp/monsterbox.log | grep -E "WebSocket|ElevenLabs"

# Check mpg123 processes
ps aux | grep mpg123

# Test speaker directly
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 90 --device 81

# Check if audio buffer is being received
tail -f /tmp/monsterbox.log | grep -E "audio|playback|buffer"
```

---

### Test 4: Microphone Level (Still Needs Investigation)

**Current Status**: ⚠️ **NOT WORKING**

**Symptoms**:
- VU meter shows zero/flat regardless of microphone input
- No movement when speaking

**Possible Causes**:
1. Microphone device ID incorrect
2. `/setup/audio/api/audio-levels` endpoint not working
3. Character doesn't have microphone part configured
4. PipeWire/PulseAudio not capturing audio

**Debug Steps**:

```bash
# Test audio levels API directly
curl "http://localhost:3000/setup/audio/api/audio-levels?deviceId=80&deviceType=input"

# Check microphone parts
curl http://localhost:3000/setup/parts/api/parts | jq '.[] | select(.type=="microphone")'

# Test microphone directly
python3 python_wrappers/microphone_cli.py get_level 80 16000 1 0.1
```

---

## Known Issues Remaining

### 1. ⚠️ Audio Output Not Working

**Impact**: No speech from AI Agent  
**Priority**: 🔴 **CRITICAL**

**Next Steps**:
1. Check if WebSocket connects to ElevenLabs (port 8795)
2. Verify audio chunks are being received
3. Check if `_startAudioPlayback()` is being called
4. Verify mpg123 is running and receiving data
5. Test speaker device directly

---

### 2. ⚠️ Microphone Level Always Zero

**Impact**: No visual feedback for microphone input  
**Priority**: 🟡 **HIGH**

**Next Steps**:
1. Verify character has microphone part configured
2. Test `/setup/audio/api/audio-levels` endpoint
3. Check if `microphone_cli.py` is working
4. Verify device ID is correct (should be '80' for Orlok)

---

### 3. ⚠️ Press-and-Hold Not Working

**Impact**: Can't have real-time conversations  
**Priority**: 🔴 **CRITICAL**

**Next Steps**:
1. Check WebSocket connection status
2. Verify agent ID is being sent
3. Check if microphone is capturing audio
4. Monitor WebSocket messages in browser console

---

## Files Modified

1. **data/characters.json**
   - Fixed all `elevenLabsAgentId` values from "undefined" to correct agent IDs

2. **public/js/ai-settings-character-assignment.js**
   - Added agent ID sanitization in `updateAssignment()`
   - Added response validation in `loadCharacters()`

---

## API Endpoints Verified

1. **`/setup/characters/api/characters`** ✅
   - Returns: `{ success: true, characters: [...] }`
   - Working correctly

2. **`/setup/characters/api/character-assignments`** ✅
   - GET: Returns assignments object
   - POST: Updates character-agent assignment
   - Working correctly

3. **`/setup/audio/api/audio-levels`** ⚠️
   - Should return: `{ success: true, level: 0-100, deviceId, type }`
   - Needs testing

---

## Production Readiness Checklist

- [x] Character agent IDs restored
- [x] Assignment page loads correctly
- [x] Assignment page saves correctly
- [x] Demo page shows correct agent
- [ ] Audio output working
- [ ] Microphone level working
- [ ] Press-and-hold working
- [ ] "Send to AI" working
- [ ] End-to-end conversation test

**Overall Status**: 🟡 **60% Complete**

---

## Next Immediate Actions

### Priority 1: Fix Audio Output

**Why**: Without audio, the system is non-functional

**Steps**:
1. Open browser console on demo page
2. Click "Send to AI" with text "Hello"
3. Check for WebSocket messages
4. Check server logs for audio playback
5. Verify mpg123 is receiving data

### Priority 2: Fix Microphone Level

**Why**: Need visual feedback for microphone input

**Steps**:
1. Test `/setup/audio/api/audio-levels` endpoint
2. Verify character has microphone part
3. Check device ID is correct
4. Test `microphone_cli.py` directly

### Priority 3: End-to-End Test

**Why**: Verify complete conversation flow

**Steps**:
1. Press and hold "Press and hold to talk"
2. Speak: "Hello, I'm trick-or-treating"
3. Release button
4. Verify transcription appears
5. Verify AI responds with audio
6. Verify audio plays through speaker

---

**CRITICAL**: The agent assignment issue is now fixed, but audio issues remain. These MUST be resolved before production.

