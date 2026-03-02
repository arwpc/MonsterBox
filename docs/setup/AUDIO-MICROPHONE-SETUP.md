# Audio & Microphone Setup

## Overview

MonsterBox uses PipeWire/WirePlumber for audio routing. The microphone captures audio for STT (speech-to-text), VU meter display, and echo detection.

## Capture Methods

The STT listener tries capture methods in priority order and caches the first working method for 5 minutes:

1. **Python/PyAudio** (preferred) — uses PipeWire's PulseAudio compatibility layer
2. **FFmpeg** — PulseAudio input to WAV
3. **arecord** — ALSA recording with PulseAudio plugin
4. **parec** — PipeWire/Pulse raw PCM capture

## Configuration

### Capture Timing
- **Chunk duration:** 0.3 seconds (short for responsive VU and echo suppression)
- **Poll interval:** 350ms between captures
- **Audio-levels cache TTL:** 80ms (prevents excessive hardware polling)

### VU Meter
The browser-side VU meter (`public/js/mic-panel.js`) uses WebAudio API with a 3x gain multiplier for visible response to normal speech levels.

### Microphone Device Selection
Configure the default microphone on the **Audio Setup** page (`/setup/audio`):

1. Navigate to Audio Setup
2. Select input device from the dropdown
3. Click "Test Microphone" to verify levels
4. Save configuration

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| VU meter flat | Wrong device selected | Select correct input on Audio Setup page |
| VU meter barely moves | Low gain | Check input gain setting, ensure mic is close |
| "No audio captured" in logs | Device not accessible | Verify `pw-record --list-targets` shows your device |
| Intermittent capture failures | PipeWire restart | Service auto-recovers; check `systemctl status pipewire` |

### Testing Microphone
```bash
# List available PipeWire sources
pw-record --list-targets

# Test capture (5 seconds)
pw-record --format s16 --rate 16000 --channels 1 test.wav &
sleep 5 && kill %1

# Check microphone via Python wrapper
python3 python_wrappers/microphone_cli.py get_level default 16000 1 1.0
```
