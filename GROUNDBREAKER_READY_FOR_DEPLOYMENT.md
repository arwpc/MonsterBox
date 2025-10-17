# Groundbreaker - Ready for Deployment ✅

**Date**: 2025-10-16  
**Character ID**: 5  
**IP Address**: 192.168.8.200  
**Status**: FULLY OPERATIONAL

---

## Critical Issues Resolved

### 1. ✅ Motor Crash Issue - FIXED
**Problem**: System was crashing and becoming unresponsive when testing the motor.

**Root Cause**: Invalid GPIO pin configuration
- Motor was configured with `rpwmPin: 37`
- **Raspberry Pi 4 only has GPIO 0-27** (28 pins total)
- Accessing GPIO 37 caused a kernel panic and system reboot

**Solution**: 
- Fixed motor configuration to use valid GPIO pins:
  - `rpwmPin: 27` (GPIO 27, Board Pin 13)
  - `lpwmPin: 22` (GPIO 22, Board Pin 15)
  - `renPin: 17` (GPIO 17, Board Pin 11)
  - `lenPin: 17` (GPIO 17, Board Pin 11)

**Files Modified**:
- `/home/remote/MonsterBox/data/character-5/parts.json` - Fixed motor pin configuration
- `/home/remote/MonsterBox/python_wrappers/linear_actuator_control_v2.py` - Simplified BTS7960 control (removed problematic software PWM)

### 2. ✅ Audio Playback Issue - FIXED
**Problem**: Audio library showing "EncodingError: Unable to decode audio data" for MP3 files.

**Root Cause**: WaveSurfer.js was configured with `WebAudio` backend which cannot decode MP3 files (only supports WAV, OGG).

**Solution**: 
- Changed WaveSurfer backend from `'WebAudio'` to `'MediaElement'`
- MediaElement uses HTML5 audio element which natively supports MP3

**Files Modified**:
- `/home/remote/MonsterBox/public/js/audio-player.js` - Changed backend to MediaElement

---

## System Test Results

All core systems tested and verified working:

### ✅ Motor Control (BTS7960)
- **Status**: WORKING
- **Driver**: BTS7960 H-bridge
- **Pins**: GPIO 27 (RPWM), GPIO 22 (LPWM), GPIO 17 (R_EN/L_EN)
- **Tests**: Forward and reverse movement both working
- **No crashes**: System remains stable during motor operation

### ✅ Audio Output
- **Status**: WORKING
- **Device**: Default speaker
- **Volume**: 80%
- **Tests**: TTS playback working, audio library playback working

### ✅ Webcam
- **Status**: WORKING
- **Device**: USB webcam (index 0)
- **Resolution**: 1920x1080 @ 30fps
- **Tests**: Capture test passed

### ✅ Microphone
- **Status**: WORKING
- **Device**: Webcam microphone (index 0)
- **Sample Rate**: 16kHz, mono
- **Tests**: Level detection working

### ✅ AI Conversation Mode
- **Status**: CONFIGURED
- **Agent ID**: agent_4201k6s9y384f9v9hqmg67ygc645
- **Provider**: ElevenLabs
- **Features**: AI responses, TTS, STT all configured

---

## Hardware Configuration

### Motor (BTS7960)
```json
{
  "id": "1",
  "name": "Groundbreaker Motor",
  "type": "motor",
  "driver": "BTS7960",
  "rpwmPin": 27,
  "lpwmPin": 22,
  "renPin": 17,
  "lenPin": 17,
  "enableMode": "dual",
  "enabled": true
}
```

### Wiring Notes
- Motor is now properly wired
- Snubber installed on motor power lines to prevent voltage spikes
- All GPIO pins verified as valid (0-27 range)

---

## Access Points

- **Web UI**: http://192.168.8.200:3000
- **Conversation Mode**: http://192.168.8.200:3000/conversation
- **Calibration**: http://192.168.8.200:3000/setup/calibration
- **Audio Library**: http://192.168.8.200:3000/audio-library

---

## Testing Scripts

### Complete System Test
```bash
cd /home/remote/MonsterBox
bash scripts/test-groundbreaker-complete.sh
```

### Motor Test Only
```bash
cd /home/remote/MonsterBox
python3 python_wrappers/test_groundbreaker_motor_simple.py
```

### Motor Test via API
```bash
curl -X POST 'http://192.168.8.200:3000/setup/parts/api/parts/1/test' \
  -H 'Content-Type: application/json' \
  -d '{"action":"control","params":{"direction":"forward","speed":50,"duration":1000}}'
```

---

## Deployment Checklist

- [x] Motor control working without crashes
- [x] Audio playback working (browser and server-side)
- [x] Webcam streaming functional
- [x] Microphone input working
- [x] AI agent configured
- [x] System stable (no reboots during operation)
- [x] All GPIO pins valid and tested
- [x] Hardware properly wired with snubber protection

---

## Known Issues / Notes

1. **GPIO Pin Range**: Raspberry Pi 4 only supports GPIO 0-27. Any configuration using GPIO 28+ will cause system crashes.

2. **BTS7960 Control**: Currently using simple digital HIGH/LOW control. Speed control via PWM can be added later if needed using hardware PWM pins (GPIO 12, 13, 18, 19).

3. **Audio Backend**: Must use MediaElement backend for MP3 support. WebAudio backend only supports WAV/OGG.

---

## Maintenance

### If Motor Stops Working
1. Check GPIO pin configuration in `data/character-5/parts.json`
2. Verify pins are in valid range (0-27)
3. Test with: `python3 python_wrappers/test_groundbreaker_motor_simple.py`

### If Audio Stops Working
1. Check WaveSurfer backend is set to 'MediaElement' in `public/js/audio-player.js`
2. Verify speaker volume in parts.json
3. Test with: `curl -X POST http://192.168.8.200:3000/conversation/api/say -H 'Content-Type: application/json' -d '{"text":"test"}'`

### If System Crashes
1. Check `sudo dmesg` for kernel errors
2. Verify no invalid GPIO pins are being accessed
3. Check power supply voltage: `vcgencmd measure_volts`
4. Check for undervoltage: `vcgencmd get_throttled`

---

## Ready for Roof Deployment

Groundbreaker is now fully operational and ready to be deployed on the roof. All core systems (motor, audio, webcam, AI) are working correctly and the system is stable.

**Last Tested**: 2025-10-16 13:38 CDT  
**Test Result**: ✅ ALL SYSTEMS OPERATIONAL

