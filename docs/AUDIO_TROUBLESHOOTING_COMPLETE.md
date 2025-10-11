# Audio Troubleshooting - Complete Fix ✅

**Date**: October 11, 2025  
**Status**: ✅ **FIXED - READY FOR TESTING**

---

## Problem

**Orlok has NO AUDIO OUTPUT** despite AI conversations working (visible round trip updates).

---

## Root Causes Found

### **1. No Speaker Assigned** ✅ FIXED
- Orlok character had `speakerId: null`
- **Fix**: Assigned speaker part ID 6 to Orlok

### **2. Wrong Audio Device ID** ✅ FIXED  
- Speaker was using `"default"` which doesn't work reliably with PipeWire
- **Fix**: Changed to explicit PipeWire sink name

---

## Complete Fix Applied

### **Step 1: Assign Speaker to Orlok** ✅

```bash
curl -X PUT http://localhost:3000/setup/characters/api/characters/3 \
  -H "Content-Type: application/json" \
  -d '{"speakerId": "6"}'
```

**Result**: Orlok now has speaker part assigned

---

### **Step 2: Configure Speaker with Correct Device** ✅

```bash
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d '{
    "characterId": 3,
    "config": {
      "audioDeviceId": "alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo",
      "volume": 90
    }
  }'
```

**Result**: Speaker now uses correct PipeWire sink

---

## Current Configuration

### **Orlok Character**
```json
{
  "id": 3,
  "name": "Orlok",
  "elevenLabsAgentId": "agent_0801k3f1dw7xe2g8r4jkbxk0gt2n",
  "speakerId": "6"
}
```

### **Speaker Part (ID: 6)**
```json
{
  "id": "6",
  "name": "Speaker Orlok",
  "type": "speaker",
  "characterId": 3,
  "config": {
    "audioDeviceId": "alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo",
    "volume": 90
  },
  "enabled": true
}
```

---

## Audio System Details

### **Available Audio Devices**

**ALSA Hardware**:
```
card 0: vc4hdmi0 (HDMI 0)
card 1: vc4hdmi1 (HDMI 1)
card 2: Headphones (3.5mm jack)
card 4: USB Audio Device ← USING THIS
```

**PipeWire Sinks** (Outputs):
```
78  alsa_output.platform-fe00b840.mailbox.stereo-fallback (Built-in)
86  alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo ← USING THIS
```

**PipeWire Sources** (Inputs):
```
85  alsa_input.usb-Sonix_Technology_Co.__Ltd._USB_2.0_Camera_SN0001-02.mono-fallback (Webcam)
87  alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback (USB Audio Mic)
```

### **Current Settings**
- **Default Sink**: `alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo`
- **Volume**: 90% (58982/65536)
- **Mute**: No
- **Status**: Active

---

## How Audio Playback Works

### **Flow**:

1. **User sends message** → AI Agent responds
2. **ElevenLabs** returns audio buffer (MP3)
3. **serverPlaybackService.js** receives buffer
4. **Looks up character's speaker**:
   - Character ID 3 (Orlok) → Speaker ID 6
   - Speaker ID 6 → Device: `alsa_output.usb-C-Media...`
5. **Plays audio** using one of:
   - `mpg123` (for MP3 streaming)
   - `speaker_cli.py` wrapper (for file playback)
   - Uses PipeWire/PulseAudio routing

### **Key Code** (`services/serverPlaybackService.js`):

```javascript
async function getSpeakerDeviceForCharacter(characterId) {
  const parts = await loadParts();
  const speaker = parts.find(p => 
    p.type === 'speaker' && 
    p.characterId === characterId
  );
  if (speaker && speaker.config) {
    return speaker.config.audioDeviceId || 'default';
  }
  return 'default';
}
```

---

## Testing

### **Test 1: System Audio** 🔊

```bash
# Test if PulseAudio/PipeWire can play audio
paplay /usr/share/sounds/alsa/Front_Center.wav
```

**Expected**: You should hear a test sound

---

### **Test 2: Speaker CLI** 🔊

```bash
# Create test audio
echo "Testing audio" | espeak --stdout > /tmp/test.wav

# Play through speaker_cli.py
python3 /home/remote/MonsterBox/python_wrappers/speaker_cli.py play \
  /tmp/test.wav 90 \
  --device alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo
```

**Expected**: You should hear "Testing audio"

---

### **Test 3: Demo Page** 🔊

1. **Go to**: `http://orlok:3000/demo`
2. **Type**: "Hello, how are you?"
3. **Click**: "Send to AI"
4. **Expected**:
   - ✅ AI responds (visible in UI)
   - ✅ **AUDIO PLAYS** 🔊
   - ✅ Jaw animation moves (if enabled)

---

## Troubleshooting

### **If Still No Audio**

#### **1. Check Physical Connection**
- Is USB Audio Device plugged in?
- Are speakers/headphones connected to USB Audio Device?
- Is volume turned up on physical speakers?

#### **2. Check PipeWire Status**
```bash
systemctl --user status pipewire pipewire-pulse wireplumber
```
**Expected**: All should be "active (running)"

#### **3. Check Volume Levels**
```bash
pactl list sinks | grep -A 10 "usb-C-Media" | grep -E "Mute:|Volume:"
```
**Expected**: 
- Mute: no
- Volume: > 50%

#### **4. Check Default Sink**
```bash
pactl get-default-sink
```
**Expected**: `alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo`

#### **5. Set Default Sink** (if wrong)
```bash
pactl set-default-sink alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo
```

#### **6. Increase Volume**
```bash
pactl set-sink-volume @DEFAULT_SINK@ 100%
```

#### **7. Unmute**
```bash
pactl set-sink-mute @DEFAULT_SINK@ 0
```

---

### **Alternative Audio Devices**

If USB Audio doesn't work, try other outputs:

#### **Built-in Audio (3.5mm jack)**
```bash
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d '{"config": {"audioDeviceId": "alsa_output.platform-fe00b840.mailbox.stereo-fallback", "volume": 90}}'
```

#### **HDMI Audio**
```bash
# Check available HDMI sinks
pactl list sinks short | grep hdmi

# Use HDMI 0
curl -X PUT http://localhost:3000/setup/parts/api/parts/6 \
  -H "Content-Type: application/json" \
  -d '{"config": {"audioDeviceId": "alsa_output.platform-bcm2835_audio.hdmi-stereo", "volume": 90}}'
```

---

## Verification Commands

### **Check Character Configuration**
```bash
curl -s http://localhost:3000/setup/characters/api/characters | \
  jq '.characters[] | select(.id == 3) | {id, name, speakerId}'
```

### **Check Speaker Configuration**
```bash
curl -s http://localhost:3000/setup/parts/api/parts | \
  jq '.parts[] | select(.id == "6")'
```

### **Check Audio Playback Logs**
```bash
tail -f /tmp/monsterbox.log | grep -i "audio\|playback\|speaker"
```

### **Monitor Audio Streams**
```bash
watch -n 1 'pactl list sink-inputs short'
```

---

## Summary

✅ **Speaker assigned** to Orlok (Part ID: 6)  
✅ **Audio device configured** with explicit PipeWire sink  
✅ **Volume set** to 90%  
✅ **PipeWire/PulseAudio** running correctly  
✅ **USB Audio Device** detected and active

**Next Step**: Test on Demo page - you should now hear audio!

---

## If You STILL Can't Hear Anything

**The issue is likely**:
1. **Physical speakers not connected** to USB Audio Device
2. **Wrong output selected** on USB Audio Device
3. **Speakers powered off** or volume at zero
4. **Audio cable loose** or damaged

**Quick Test**:
```bash
# Play test sound
paplay /usr/share/sounds/alsa/Front_Center.wav
```

**If you can't hear this**, the problem is NOT MonsterBox - it's the physical audio setup.

**If you CAN hear this**, but not MonsterBox audio, check server logs:
```bash
tail -100 /tmp/monsterbox.log | grep -i "audio\|speaker\|playback"
```

