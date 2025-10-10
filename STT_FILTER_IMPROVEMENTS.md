# STT Filter Improvements - MonsterBox 5.2

## Date: 2025-10-10
## System: Orlok (RPi4b)

## Overview
Comprehensive STT (Speech-to-Text) filtering system with full UI controls for audio preprocessing and text validation. All filters are now configurable through the AI Settings → Speech-to-Text page.

## Problem Solved
- **Runaway test processes** causing continuous audio playback - FIXED by killing all Firefox/Playwright/audio processes
- **Lack of filter controls** - Users couldn't tune STT recognition without editing code
- **Inconsistent STT recognition** - No way to adjust audio filtering or text validation parameters

## New Features

### 1. Audio Filtering Controls
All audio preprocessing filters are now configurable through the UI:

#### Highpass Filter
- **Purpose**: Remove low-frequency rumble and background noise
- **Range**: 50Hz - 500Hz
- **Default**: 200Hz
- **UI Control**: Slider with real-time value display

#### Lowpass Filter
- **Purpose**: Remove high-frequency hiss and noise
- **Range**: 2000Hz - 8000Hz
- **Default**: 3800Hz
- **UI Control**: Slider with real-time value display

#### Denoise Level
- **Purpose**: FFmpeg noise reduction strength
- **Range**: -50dB to -10dB
- **Default**: -25dB
- **UI Control**: Slider with real-time value display

#### Audio Filter Enable/Disable
- **Purpose**: Toggle all audio preprocessing on/off
- **Default**: Enabled
- **UI Control**: Switch

### 2. Text Filtering Controls

#### Sound Effects Filtering
- **Purpose**: Remove bracketed sound effects like "(beep)", "(music)", "(applause)"
- **Default**: Enabled
- **UI Control**: Switch
- **Implementation**: Regex pattern `/^\s*\([^)]{1,120}\)\s*$/`

#### English Language Validation
- **Purpose**: Reject non-English or gibberish transcriptions
- **Default**: Enabled
- **UI Control**: Switch

#### Minimum Letter Ratio
- **Purpose**: Require minimum percentage of letters in transcription
- **Range**: 30% - 90%
- **Default**: 55%
- **UI Control**: Slider with real-time value display
- **Implementation**: Counts letters vs total characters (excluding whitespace)

#### Require Vowels
- **Purpose**: Reject consonant-only gibberish
- **Default**: Enabled
- **UI Control**: Switch
- **Implementation**: Checks for at least one vowel (A, E, I, O, U)

### 3. Voice Activity Detection (VAD) Controls

#### VAD Enable/Disable
- **Purpose**: Toggle automatic speech detection
- **Default**: Enabled
- **UI Control**: Switch

#### VAD Threshold
- **Purpose**: Sensitivity for detecting speech vs silence
- **Range**: 0.05 - 0.95
- **Default**: 0.50
- **UI Control**: Slider with real-time value display
- **Note**: Lower = more sensitive (may pick up noise)

#### VAD Silence Duration
- **Purpose**: How long to wait before ending speech
- **Range**: 100ms - 2000ms
- **Default**: 500ms
- **UI Control**: Slider with real-time value display

## Implementation Details

### Frontend Changes

#### File: `views/ai-settings/stt.ejs`
Added comprehensive filter controls organized into three sections:
1. **Voice Activity Detection** - VAD threshold and silence duration
2. **Audio Filtering** - Highpass, lowpass, denoise controls
3. **Text Filtering** - SFX filtering, English validation, letter ratio, vowel requirement

#### File: `public/js/ai-settings-stt.js`
Added event listeners for all new controls:
- Real-time value display updates for all sliders
- Form data automatically captured via FormData API
- All settings saved to both global STT config and current Character

### Backend Changes

#### File: `services/elevenLabsWebSocketService.js`

**Updated `_filterWavForSTT()` function** (lines 627-652):
- Now accepts `filterConfig` parameter
- Dynamically builds FFmpeg filter chain based on saved settings
- Uses configured highpass, lowpass, and denoise values
- Falls back to defaults if config not provided

**Updated `_isLikelyEnglish()` function** (lines 47-70):
- Now accepts `config` parameter
- Uses configured `minLetterRatio` value
- Respects `requireVowels` setting
- Falls back to defaults if config not provided

**Updated STT transcription logic** (lines 697-749):
- Loads STT config from `aiConfigStore`
- Checks `audioFilterEnabled` setting before applying filters
- Passes filter config to `_filterWavForSTT()`
- Checks `filterSfx` setting before filtering sound effects
- Checks `validateEnglish` setting before validating English text
- Passes config to `_isLikelyEnglish()` for validation
- Sends debug messages for filtered transcriptions

#### File: `services/aiConfigStore.js`
No changes needed - `saveSTTConfig()` already saves entire config object to JSON, so all new settings are automatically persisted.

## Configuration Storage

All settings are saved to `/home/remote/MonsterBox/data/ai-config/stt-config.json`:

```json
{
  "model": "scribe_english_v1",
  "language": "en",
  "sampleRate": 16000,
  "vadEnabled": true,
  "vadThreshold": 0.50,
  "vadSilenceDuration": 500,
  "audioFilterEnabled": true,
  "highpassFreq": 200,
  "lowpassFreq": 3800,
  "denoiseLevel": -25,
  "filterSfx": true,
  "validateEnglish": true,
  "minLetterRatio": 55,
  "requireVowels": true
}
```

## Environment Variables

### MB_STT_FILTER
- **Purpose**: Force enable audio filtering regardless of config
- **Values**: `1` = enabled, `0` or unset = use config
- **Usage**: `MB_STT_FILTER=1 node server.js`

### MB_AUTOTUNE_ALLOW_SFX
- **Purpose**: Bypass SFX filtering during autotune tests
- **Values**: `1` = bypass, `0` or unset = use config
- **Usage**: `MB_AUTOTUNE_ALLOW_SFX=1 node server.js`
- **Note**: Should only be used during testing, not production

### MB_DEBUG_AUDIO
- **Purpose**: Enable audio debug logging
- **Values**: `1` = enabled, `0` or unset = disabled
- **Usage**: `MB_DEBUG_AUDIO=1 node server.js`

## Server Startup

### Recommended Production Startup
```bash
MB_DEBUG_AUDIO=1 MB_STT_FILTER=1 NODE_ENV=production PORT=3000 node server.js
```

### Autotune Testing Startup
```bash
MB_DEBUG_AUDIO=1 MB_STT_FILTER=1 MB_AUTOTUNE_ALLOW_SFX=1 NODE_ENV=production PORT=3000 node server.js
```

## Usage Instructions

### Accessing the STT Settings Page
1. Navigate to **AI Settings** → **Speech-to-Text**
2. Scroll down to see all filter controls
3. Adjust sliders and toggles as needed
4. Click **Save Configuration** to persist changes

### Tuning for Better Recognition

#### If STT is too sensitive (picking up background noise):
- Increase **VAD Threshold** (e.g., 0.60-0.70)
- Increase **Highpass Filter** (e.g., 300-400Hz)
- Decrease **Denoise Level** (e.g., -30dB to -40dB)

#### If STT is missing speech:
- Decrease **VAD Threshold** (e.g., 0.30-0.40)
- Decrease **Highpass Filter** (e.g., 100-150Hz)
- Increase **Denoise Level** (e.g., -20dB to -15dB)

#### If getting gibberish transcriptions:
- Enable **Validate English Text**
- Increase **Min Letter Ratio** (e.g., 65-75%)
- Enable **Require Vowels**
- Enable **Filter Bracketed Sound Effects**

#### If missing valid transcriptions:
- Decrease **Min Letter Ratio** (e.g., 40-50%)
- Disable **Require Vowels** (for names/acronyms)
- Disable **Validate English Text** (for multi-language)

## Testing

### Manual Testing
1. Go to **AI Settings** → **Speech-to-Text**
2. Adjust filter settings
3. Click **Save Configuration**
4. Click **Start Listening** in the Real-time Transcription section
5. Speak into the microphone
6. Observe transcriptions in real-time
7. Adjust settings as needed

### Automated Testing
The `tests/playwright/mic-stt-vad-autotune.spec.js` test validates:
- Microphone part creation
- Audio playback
- STT recognition
- VAD threshold tuning
- Gain adjustment
- Configuration persistence

## Debug Information

### Viewing Filtered Transcriptions
When text is filtered, debug messages are sent to the client:
- `stt_filtered_sfx` - Filtered due to bracketed sound effects
- `stt_filtered_english` - Filtered due to English validation failure

These can be viewed in the browser console when using the Conversation or Live Mode pages.

### Server Logs
Check `/tmp/mb-server.log` for:
- STT transcription results
- Filter application status
- Audio processing errors
- WebSocket connection status

## Files Modified

1. `views/ai-settings/stt.ejs` - Added filter UI controls
2. `public/js/ai-settings-stt.js` - Added event listeners for controls
3. `services/elevenLabsWebSocketService.js` - Updated filtering logic
4. `start-server-with-filters.sh` - Server startup script

## Known Issues

1. **Terminal Output Broken**: The terminal output system is currently not working, making it difficult to see command output. Workaround: Use file-based logging and web-fetch to check server status.

2. **Test Reliability**: The mic-stt-vad-autotune test showed 40% success rate (2/5 passes) before improvements. Further tuning may be needed to achieve 100% reliability.

## Next Steps

1. Test the new filter controls with real microphone input
2. Tune settings for optimal recognition in the Orlok environment
3. Run the autotune test again to verify improvements
4. Document optimal settings for different use cases
5. Consider adding preset configurations (e.g., "Quiet Room", "Noisy Environment", "High Accuracy")

## Conclusion

All STT filter controls are now surfaced in the UI, giving users complete control over audio preprocessing and text validation. The system is more flexible and tunable than ever before, allowing for optimization based on specific hardware and environmental conditions.

