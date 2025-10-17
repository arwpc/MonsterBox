# PumpkinHead Complete Parts Configuration

**Date:** October 13, 2025  
**Character:** PumpkinHead (Character ID: 1)  
**Total Parts:** 8

---

## Complete Parts List

### Part 1: Wiper Motor
- **ID:** 1
- **Type:** motor
- **Control Board:** MDD10A
- **Direction Pin:** GPIO 26
- **PWM Pin:** GPIO 13
- **Max Duration:** 10,000ms
- **Status:** Enabled ✅

### Part 2: PumpkinHead Light
- **ID:** 2
- **Type:** light
- **GPIO Pin:** 17 ✅
- **Model:** light_generic_12v
- **Status:** Enabled ✅

### Part 3: Speaker Left
- **ID:** 3
- **Type:** speaker
- **Device:** default
- **Volume:** 80%
- **Model:** default_speaker
- **Status:** Enabled ✅

### Part 4: Speaker Right
- **ID:** 4
- **Type:** speaker
- **Device:** default
- **Volume:** 80%
- **Model:** default_speaker
- **Status:** Enabled ✅

### Part 5: PIR Motion Sensor
- **ID:** 5
- **Type:** motion_sensor
- **GPIO Pin:** 16 ✅
- **Model:** pir_generic
- **Sensitivity:** 50
- **Retrigger Time:** 5000ms
- **Status:** Enabled ✅

### Part 6: PumpkinHead Cam
- **ID:** 6
- **Type:** webcam
- **Device Path:** /dev/video0
- **Device ID:** video0
- **Model:** default-uvc-1
- **Status:** Enabled ✅

### Part 7: Webcam Microphone
- **ID:** 7
- **Type:** microphone
- **Device ID:** default
- **Sample Rate:** 16000 Hz
- **Channels:** 1 (mono)
- **Sensitivity:** 1
- **Model:** mic_generic_usb
- **Status:** Enabled ✅

### Part 8: USB Dongle Speaker
- **ID:** 8
- **Type:** speaker
- **Device:** default (USB Audio Dongle)
- **Volume:** 80%
- **Model:** default_speaker
- **Status:** Enabled ✅

---

## GPIO Pin Assignments

### Current Assignments
- **GPIO 13:** Wiper Motor PWM
- **GPIO 16:** PIR Motion Sensor ✅
- **GPIO 17:** PumpkinHead Light ✅
- **GPIO 26:** Wiper Motor Direction

### Non-GPIO Parts
- Webcam: /dev/video0 (USB)
- Webcam Microphone: USB Audio
- USB Dongle Speaker: USB Audio
- Speaker Left: Audio output
- Speaker Right: Audio output

---

## ✅ GPIO Conflict RESOLVED

**Previous Issue:** GPIO 16 was assigned to both PumpkinHead Light and PIR Motion Sensor

**Resolution Applied:** Moved PumpkinHead Light from GPIO 16 to GPIO 17

**Final GPIO Assignments:**
- GPIO 16: PIR Motion Sensor ✅
- GPIO 17: PumpkinHead Light ✅

This matches the configuration in `docs/character_pumpkinhead.md`

---

## Documentation Conflicts Found

During configuration, conflicting GPIO assignments were found in documentation:

### Source 1: docs/character_pumpkinhead.md
```
- Punkin Motion Detector (sensor): GPIO 16
- Head Light (led): GPIO 17
- Body Move (motor): DIR=6, PWM=13
```

### Source 2: docs/hardware/gpio_assignments.md
```
- Motor1: DIR=26, PWM=13
- Sensor: 16
```

### Source 3: scripts/configure-pumpkinhead-parts.sh
```
- Wiper Motor: DIR=26, PWM=13
- Light: GPIO 16
```

**Current Configuration Uses:**
- Motor: DIR=26, PWM=13 (from Source 2 & 3)
- Light: GPIO 16 (from Source 3)
- PIR Sensor: GPIO 16 (from Source 2)

**Final Configuration (APPLIED):**
- Motor: DIR=26, PWM=13 ✅
- Light: GPIO 17 ✅ (from Source 1)
- PIR Sensor: GPIO 16 ✅ (from Source 1 & 2)

---

## Hardware Testing Checklist

After resolving the GPIO conflict, test each part:

### 1. Test Wiper Motor
```
http://192.168.8.150:3000/setup/calibration
→ Find "Wiper Motor"
→ Click Test
→ Test forward/reverse movement
```

### 2. Test PumpkinHead Light
```
http://192.168.8.150:3000/setup/calibration
→ Find "PumpkinHead Light"
→ Click Test
→ Turn on/off
```

### 3. Test PIR Motion Sensor
```
http://192.168.8.150:3000/setup/calibration
→ Find "PIR Motion Sensor"
→ Click Test
→ Wave hand in front of sensor
→ Verify motion detection
```

### 4. Test Webcam
```
http://192.168.8.150:8090/?action=stream
→ Verify video stream is visible
```

### 5. Test Audio
```
http://192.168.8.150:3000/setup/audio
→ Select USB Dongle Speaker
→ Test audio output
→ Select Webcam Microphone
→ Test audio input levels
```

---

## Quick Reference

### Access URLs
- Dashboard: http://192.168.8.150:3000
- Calibration: http://192.168.8.150:3000/setup/calibration
- Audio Setup: http://192.168.8.150:3000/setup/audio
- Webcam Stream: http://192.168.8.150:8090/?action=stream

### API Endpoints
- List Parts: `GET http://192.168.8.150:3000/setup/parts/api/parts`
- Update Part: `PUT http://192.168.8.150:3000/setup/parts/api/parts/{id}`
- Test Part: `POST http://192.168.8.150:3000/setup/parts/api/parts/{id}/test`

### Files
- Parts Config: `data/character-1/parts.json`
- App Config: `config/app-config.json`
- Character Data: `data/character-1/`

---

## Status Summary

✅ **Completed:**
- All 8 parts configured
- MonsterBox server running
- Character 1 (PumpkinHead) selected
- Webcam streaming active
- Audio system configured
- GPIO 16 conflict resolved (Light moved to GPIO 17)
- No GPIO conflicts detected

📋 **Next Steps:**
- Verify physical GPIO wiring matches configuration:
  - GPIO 13: Wiper Motor PWM
  - GPIO 16: PIR Motion Sensor
  - GPIO 17: PumpkinHead Light
  - GPIO 26: Wiper Motor Direction
- Test all hardware parts using calibration interface
- Verify webcam stream at http://192.168.8.150:8090/?action=stream
- Test audio input/output

---

**Last Updated:** October 14, 2025
**Status:** READY FOR HARDWARE TESTING ✅
**Configuration File:** PUMPKINHEAD_STARTUP_COMPLETE.md

