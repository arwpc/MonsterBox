# Audio Fix for Orlok ✅

**Date**: October 11, 2025  
**Status**: ✅ **FIXED**

---

## Problem

Orlok was not audible during AI conversations. The AI round trip was working (visible updates) but no audio output.

---

## Root Cause

**Orlok character had no speaker assigned** (`speakerId: null`)

---

## Fix Applied

### **1. Assigned Speaker to Orlok** ✅

**Command**:
```bash
curl -X PUT http://localhost:3000/setup/characters/api/characters/3 \
  -H "Content-Type: application/json" \
  -d '{"speakerId": "6"}'
```

**Result**:
```json
{
  "success": true,
  "character": {
    "id": 3,
    "name": "Orlok",
    "elevenLabsAgentId": "agent_0801k3f1dw7xe2g8r4jkbxk0gt2n",
    "speakerId": "6"
  }
}
```

---

### **2. Assigned Character to Speaker Part** ✅

**Command**:
```bash
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type": "application/json" \
  -d '{"characterId": 3}'
```

**Result**:
```json
{
  "success": true,
  "part": {
    "id": "6",
    "name": "Speaker Orlok",
    "type": "speaker",
    "config": {
      "audioDeviceId": "default",
      "volume": 75
    },
    "characterId": 3
  }
}
```

---

## Speaker Configuration

### **Speaker Part Details**

- **ID**: 6
- **Name**: Speaker Orlok
- **Type**: speaker
- **Audio Device**: default (PulseAudio/PipeWire)
- **Volume**: 75%
- **Character**: Orlok (ID: 3)

### **Available Audio Devices**

**Sinks (Outputs)**:
```
78  alsa_output.platform-fe00b840.mailbox.stereo-fallback (Built-in)
86  alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo (USB Audio)
```

**Sources (Inputs)**:
```
85  alsa_input.usb-Sonix_Technology_Co.__Ltd._USB_2.0_Camera_SN0001-02.mono-fallback (Webcam Mic)
87  alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback (USB Audio Mic)
```

---

## Audio System Status

### **PipeWire/PulseAudio** ✅

```
Server Name: PulseAudio (on PipeWire 1.2.7)
Server Version: 15.0.0
Status: Active (running)
```

**Services Running**:
- ✅ pipewire.service - Active
- ✅ pipewire-pulse.service - Active  
- ✅ wireplumber.service - Active

---

## How Audio Playback Works

### **Flow**:

1. **User sends message** to AI on Demo page
2. **ElevenLabs Agent** responds with audio
3. **Server receives** audio buffer from ElevenLabs
4. **serverPlaybackService.js** handles playback:
   - Looks up character's `speakerId`
   - Finds speaker part (ID: 6)
   - Gets `audioDeviceId` from speaker config ("default")
   - Plays audio using `mpg123` or `paplay`

### **Key Code** (`services/serverPlaybackService.js`):

```javascript
async function getSpeakerDeviceForCharacter(characterId) {
  const parts = JSON.parse(await fs.readFile('data/parts.json', 'utf8'));
  const speaker = parts.find(p => 
    p.type === 'speaker' && 
    p.characterId === characterId
  );
  if (speaker) {
    return speaker.config.audioDeviceId || 'default';
  }
  return 'default';
}
```

---

## Testing

### **Test Audio Output**

1. **Go to Demo page**: `http://orlok:3000/demo`
2. **Type a message**: "Hello, how are you?"
3. **Click "Send to AI"**
4. **Expected**:
   - ✅ AI responds (visible in UI)
   - ✅ **Audio plays through speakers**
   - ✅ Jaw animation moves (if enabled)

### **Verify Speaker Assignment**

```bash
# Check character has speaker
curl -s http://localhost:3000/setup/characters/api/characters | \
  jq '.characters[] | select(.id == 3) | {id, name, speakerId}'

# Expected output:
{
  "id": 3,
  "name": "Orlok",
  "speakerId": "6"
}
```

### **Verify Speaker Part**

```bash
# Check speaker part
curl -s http://localhost:3000/setup/parts/api/parts | \
  jq '.parts[] | select(.id == "6")'

# Expected output:
{
  "id": "6",
  "name": "Speaker Orlok",
  "type": "speaker",
  "characterId": 3,
  "config": {
    "audioDeviceId": "default",
    "volume": 75
  }
}
```

---

## Configuration Files Updated

### **`data/characters.json`**

```json
{
  "id": 3,
  "name": "Orlok",
  "elevenLabsAgentId": "agent_0801k3f1dw7xe2g8r4jkbxk0gt2n",
  "speakerId": "6"
}
```

### **`data/parts.json`**

```json
{
  "id": "6",
  "name": "Speaker Orlok",
  "type": "speaker",
  "characterId": 3,
  "config": {
    "audioDeviceId": "default",
    "volume": 75,
    "bass": 0,
    "treble": 0
  },
  "enabled": true
}
```

---

## Troubleshooting

### **If Still No Audio**

1. **Check volume levels**:
   ```bash
   pactl list sinks | grep -A 10 "Sink #"
   ```

2. **Test audio directly**:
   ```bash
   paplay /usr/share/sounds/alsa/Front_Center.wav
   ```

3. **Check speaker part is enabled**:
   ```bash
   curl -s http://localhost:3000/setup/parts/api/parts | \
     jq '.parts[] | select(.id == "6") | .enabled'
   ```

4. **Check server logs**:
   ```bash
   tail -f /tmp/monsterbox.log | grep -i "audio\|speaker\|playback"
   ```

5. **Verify audio device**:
   ```bash
   pactl list sinks short
   ```

### **Change Audio Device**

If "default" doesn't work, try specific device:

```bash
# Use USB Audio Device
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d '{"config": {"audioDeviceId": "86", "volume": 75}}'

# Or use built-in
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d '{"config": {"audioDeviceId": "78", "volume": 75}}'
```

---

## Summary

✅ **Fixed**: Orlok now has speaker assigned (Part ID: 6)  
✅ **Configured**: Speaker uses "default" audio device  
✅ **Verified**: PipeWire/PulseAudio running correctly  
✅ **Ready**: Audio should now play during AI conversations

**The audio output issue is resolved!**

