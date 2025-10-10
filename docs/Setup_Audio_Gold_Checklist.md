# Setup Audio "Gold" Checklist

**MonsterBox 5.1 - Production-Ready Audio Configuration**

This document provides a comprehensive checklist for verifying the Setup Audio page is working correctly on your animatronic hardware (tested on Orlok, Raspberry Pi 4B).

---

## 🎯 Overview

The Setup Audio page (`http://orlok:3000/setup/audio`) provides real-time audio monitoring and configuration for PipeWire-based audio systems. This "Gold" version has been hardened for production use with:

- Real-time VU meters updating at ≥10 Hz
- Swapped panel layout (Input left, Output right)
- Robust error handling and user feedback
- Device selection persistence
- Comprehensive test coverage

---

## ✅ Pre-Flight Checks

### System Requirements

- [ ] Raspberry Pi 4B running Raspberry Pi OS (64-bit)
- [ ] PipeWire and WirePlumber installed and running
- [ ] MonsterBox 5.1 server running on port 3000
- [ ] At least one audio output device (HDMI, headphone jack, or USB)
- [ ] At least one audio input device (USB microphone or camera mic)

### Verify PipeWire Status

```bash
# Check PipeWire services are running
systemctl --user status pipewire pipewire-pulse wireplumber

# List available devices
wpctl status | sed -n '1,80p'

# Should show:
# - Audio sinks (outputs)
# - Audio sources (inputs)
# - Default sink and source marked with asterisk
```

### Verify MonsterBox Server

```bash
# Check server is running
curl -s http://orlok:3000/setup/audio | grep "MonsterBox 5.1"

# Should return HTML containing "MonsterBox 5.1"
```

---

## 🎨 Layout & UI Verification

### Panel Layout

- [ ] Navigate to `http://orlok:3000/setup/audio`
- [ ] **LEFT panel** displays "Default Audio Input (Microphones)"
- [ ] **RIGHT panel** displays "Default Audio Output (Speakers)"
- [ ] Layout persists after page reload
- [ ] Advanced Settings section also shows Inputs on left, Outputs on right

### System Status

- [ ] PipeWire status badge shows "Available" (green)
- [ ] WirePlumber status badge shows "Available" (green)
- [ ] Audio Outputs count shows number > 0
- [ ] Audio Inputs count shows number > 0

### Visual Elements

- [ ] VU meters visible in both Input and Output panels
- [ ] VU meter bars have green→yellow→orange→red gradient
- [ ] Test buttons present in both panels
- [ ] Monitor Start/Stop buttons present
- [ ] Refresh button in top-right corner
- [ ] Save Configuration button in top-right corner

---

## 🎛️ Device Selection

### Output Devices

- [ ] Click "System Default Sink" dropdown
- [ ] Dropdown contains "Auto (Let PipeWire decide)" option
- [ ] Dropdown contains actual hardware devices (e.g., "HDMI", "Headphones", "USB Audio")
- [ ] Select a specific device (not "auto")
- [ ] "Current Sink Details" updates to show selected device
- [ ] Selection persists after page reload

### Input Devices

- [ ] Click "System Default Source" dropdown
- [ ] Dropdown contains "Auto (Let PipeWire decide)" option
- [ ] Dropdown contains actual hardware devices (e.g., "USB Camera", "USB Microphone")
- [ ] Select a specific device (not "auto")
- [ ] "Current Source Details" updates to show selected device
- [ ] Selection persists after page reload

---

## 📊 VU Meter Monitoring

### Input VU Meter

- [ ] Select a specific input device
- [ ] Click "Start Input Monitoring" button
- [ ] Button text changes to "Stop Input Monitoring"
- [ ] VU meter bar starts moving (may be low if quiet)
- [ ] Make noise near microphone (clap, speak, tap)
- [ ] VU meter bar responds within 100ms
- [ ] Level percentage updates in real-time
- [ ] Bar color changes based on level (green→yellow→orange→red)
- [ ] Click "Stop Input Monitoring"
- [ ] VU meter stops updating and resets to 0%

### Output VU Meter

- [ ] Select a specific output device
- [ ] Click "Start Output Monitoring" button
- [ ] Button text changes to "Stop Output Monitoring"
- [ ] VU meter shows activity (may be low if no audio playing)
- [ ] Click "Stop Output Monitoring"
- [ ] VU meter stops updating and resets to 0%

### Real-Time Performance

- [ ] Start input monitoring
- [ ] Make continuous noise (speak, play music)
- [ ] VU meter updates smoothly without freezing
- [ ] No visible lag >250ms between sound and meter response
- [ ] No console errors in browser DevTools
- [ ] Monitoring continues for at least 30 seconds without errors

---

## 🔊 Test Audio Output

### Basic Test

- [ ] Select a specific output device (not "auto")
- [ ] Click "Test Audio Output" button
- [ ] Button shows "Playing..." with spinner
- [ ] Audio plays audibly through selected device within 250ms
- [ ] Audio is the monster howl sound (monster-howl-85304.mp3)
- [ ] Button returns to normal state after playback
- [ ] Success toast notification appears
- [ ] Test Results section shows success message with timestamp

### Error Handling

- [ ] Select "Auto (Let PipeWire decide)"
- [ ] Click "Test Audio Output"
- [ ] Error toast appears: "Please select a specific output device first"
- [ ] No audio plays
- [ ] Button remains enabled

### Per-Device Testing

- [ ] Scroll to "Available Audio Outputs (Sinks)" section
- [ ] Each device has a play button (▶)
- [ ] Click play button on a device
- [ ] Audio plays through that specific device
- [ ] Success notification appears

---

## 🎤 Test Audio Input

### Basic Test

- [ ] Select a specific input device (not "auto")
- [ ] Click "Test Audio Input" button
- [ ] Button shows "Testing..." with spinner
- [ ] Input VU meter starts monitoring automatically
- [ ] Make noise near microphone
- [ ] VU meter responds to input
- [ ] Success toast notification appears
- [ ] VU meter continues monitoring for 5 seconds
- [ ] Test Results section shows success message

### Error Handling

- [ ] Select "Auto (Let PipeWire decide)"
- [ ] Click "Test Audio Input"
- [ ] Error toast appears: "Please select a specific input device first"
- [ ] Button remains enabled

---

## 💾 Configuration Persistence

### Save Configuration

- [ ] Select specific input and output devices
- [ ] Click "Save Configuration" button
- [ ] Success toast appears: "Configuration saved successfully!"
- [ ] Page refreshes automatically
- [ ] Selected devices remain selected after refresh

### LocalStorage Persistence

- [ ] Select a specific output device
- [ ] Open browser DevTools → Application → Local Storage
- [ ] Verify `setupAudio.defaultSink` contains selected device ID
- [ ] Select a specific input device
- [ ] Verify `setupAudio.defaultSource` contains selected device ID
- [ ] Reload page
- [ ] Devices remain selected

---

## 🛡️ Error Handling

### Network Errors

- [ ] Open browser DevTools → Network tab
- [ ] Start input monitoring
- [ ] All API calls return HTTP 200
- [ ] No 4xx or 5xx errors
- [ ] If API fails, error toast appears with clear message

### Console Errors

- [ ] Open browser DevTools → Console tab
- [ ] Interact with all page features
- [ ] No unhandled JavaScript errors
- [ ] No unhandled promise rejections
- [ ] VU meter warnings (if any) are expected and non-blocking

### Device Unavailable

- [ ] Unplug a USB audio device
- [ ] Try to test that device
- [ ] Clear error message appears
- [ ] Page remains functional
- [ ] Other devices still work

---

## 🧪 Automated Testing

### Run Playwright Tests

```bash
# From MonsterBox root directory
BASE_URL=http://orlok:3000 MB_E2E=1 PW_CLEAN_SERVER=0 \
  npx playwright test -c playwright.config.ts --project=firefox \
  test/e2e/setup-audio-gold.spec.js
```

### Expected Results

- [ ] All tests pass (green checkmarks)
- [ ] No test failures or timeouts
- [ ] Test report shows:
  - Layout verification ✅
  - Device selection ✅
  - VU meter monitoring ✅
  - Test buttons ✅
  - Error handling ✅
  - Persistence ✅

---

## 🔍 Troubleshooting

### VU Meter Not Moving

**Symptoms:** VU meter stays at 0% even when making noise

**Solutions:**
1. Verify correct input device selected (not "auto")
2. Check microphone is not muted: `wpctl get-volume @DEFAULT_SOURCE@`
3. Test microphone directly: `arecord -d 2 -f cd test.wav && aplay test.wav`
4. Check browser console for API errors
5. Enable debug logging: `window.MONSTERBOX_DEBUG_AUDIO = true`

### Test Audio Not Playing

**Symptoms:** Click "Test Audio Output" but no sound

**Solutions:**
1. Verify correct output device selected (not "auto")
2. Check volume: `wpctl get-volume @DEFAULT_SINK@`
3. Test output directly: `pw-play public/sounds/monster-howl-85304.mp3`
4. Check Test Results section for error details
5. Verify file exists: `ls -lh public/sounds/monster-howl-85304.mp3`

### Devices Not Appearing

**Symptoms:** Dropdowns show only "Auto" option

**Solutions:**
1. Check PipeWire services: `systemctl --user status pipewire wireplumber`
2. Restart services: `systemctl --user restart pipewire wireplumber`
3. Check API endpoint: `curl -s http://orlok:3000/setup/audio/api/hardware-devices | jq`
4. Verify devices in system: `wpctl status`

### Page Freezing

**Symptoms:** VU meters freeze or page becomes unresponsive

**Solutions:**
1. Check browser console for errors
2. Stop all monitoring (click Stop buttons)
3. Reload page
4. Check server logs for errors
5. Verify server is not overloaded: `top` or `htop`

---

## 📈 Performance Benchmarks

### Expected Performance

- **VU Meter Update Rate:** ≥10 Hz (100ms intervals)
- **Test Audio Latency:** <250ms from click to sound
- **UI Response Time:** <100ms for all button clicks
- **API Response Time:** <200ms for audio-levels endpoint
- **Page Load Time:** <2 seconds on Raspberry Pi 4B

### Measuring Performance

```bash
# Test VU meter endpoint response time
time curl -s "http://orlok:3000/setup/audio/api/audio-levels?deviceId=default&deviceType=input" > /dev/null

# Should complete in <200ms

# Test audio playback
time curl -X POST -H "Content-Type: application/json" \
  -d '{"testType":"speaker","deviceId":"default"}' \
  http://orlok:3000/setup/audio/api/test-system

# Should return in <500ms (playback continues in background)
```

---

## ✅ Sign-Off Checklist

### Functional Requirements

- [ ] All panels display correctly
- [ ] Input panel on left, Output panel on right
- [ ] Device selection works for all devices
- [ ] VU meters update in real-time (≥10 Hz)
- [ ] Test audio plays audibly within 250ms
- [ ] Configuration persists across reloads
- [ ] Error handling provides clear feedback

### Performance Requirements

- [ ] VU meter updates ≥10 Hz
- [ ] No UI freezes >250ms
- [ ] Test audio latency <250ms
- [ ] API responses <200ms
- [ ] Zero console errors during normal operation

### Testing Requirements

- [ ] All Playwright tests pass
- [ ] Manual testing on all device types
- [ ] Error scenarios tested and handled
- [ ] Performance benchmarks met

### Documentation Requirements

- [ ] README updated with Setup Audio Gold section
- [ ] This checklist completed and verified
- [ ] Troubleshooting steps documented
- [ ] API endpoints documented

---

## 🎉 Production Ready

Once all items in this checklist are verified, the Setup Audio page is considered "Gold" and ready for production use on all animatronics.

**Tested on:** Orlok (Raspberry Pi 4B, Raspberry Pi OS 64-bit)  
**Date:** 2025-10-10  
**Version:** MonsterBox 5.1

