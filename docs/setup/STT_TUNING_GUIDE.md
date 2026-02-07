# Speech-to-Text Tuning Guide

## MonsterBox 5.5 - STT Filter Configuration

This guide will help you optimize speech-to-text recognition for your specific environment and use case.

## Table of Contents

1. [Quick Start with Presets](#quick-start-with-presets)
2. [Understanding the Filters](#understanding-the-filters)
3. [Tuning for Your Environment](#tuning-for-your-environment)
4. [Troubleshooting Common Issues](#troubleshooting-common-issues)
5. [Advanced Configuration](#advanced-configuration)

---

## Quick Start with Presets

The easiest way to get started is to use one of the built-in presets:

### Available Presets

1. **Quiet Room** - For quiet environments with minimal background noise
   - Best for: Home use, quiet workshops, testing
   - Characteristics: Sensitive, fast response, permissive text filtering

2. **Noisy Environment** - For environments with significant background noise
   - Best for: Parties, outdoor events, busy workshops
   - Characteristics: Less sensitive, aggressive filtering, strict text validation

3. **High Accuracy** - Maximum filtering for best transcription quality
   - Best for: Important conversations, data collection, demonstrations
   - Characteristics: Balanced sensitivity, strict text validation

4. **Permissive** - Minimal filtering for maximum recognition
   - Best for: Testing, debugging, multi-language support
   - Characteristics: Very sensitive, minimal filtering (may include noise)

5. **Animatronic Show** - Optimized for performances with music and sound effects
   - Best for: Halloween displays, theme park attractions, performances
   - Characteristics: High threshold to avoid triggering on show audio

6. **Conversation** - Optimized for natural back-and-forth conversation
   - Best for: Interactive characters, customer service, Q&A
   - Characteristics: Quick response, balanced filtering

7. **Testing/Debug** - Minimal filtering for testing and debugging
   - Best for: Development, troubleshooting, system testing
   - Characteristics: All filters disabled

### How to Apply a Preset

1. Navigate to **AI Settings** → **Speech-to-Text**
2. Look for the "Quick Presets" section at the top
3. Click on the preset that matches your environment
4. The configuration will be applied immediately
5. Test by clicking "Start Listening" and speaking into the microphone

---

## Understanding the Filters

### Audio Filtering

Audio filters process the raw audio before sending it to the STT engine.

#### Highpass Filter
- **What it does**: Removes low-frequency sounds below the specified frequency
- **Range**: 50Hz - 500Hz
- **Default**: 200Hz
- **Use cases**:
  - Remove rumble from HVAC systems, traffic, or machinery
  - Reduce bass from music or speakers
  - Clean up microphone handling noise

#### Lowpass Filter
- **What it does**: Removes high-frequency sounds above the specified frequency
- **Range**: 2000Hz - 8000Hz
- **Default**: 3800Hz
- **Use cases**:
  - Remove hiss from poor-quality microphones
  - Reduce high-frequency noise from electronics
  - Filter out ultrasonic interference

#### Denoise Level
- **What it does**: Applies FFmpeg's noise reduction algorithm
- **Range**: -50dB to -10dB (more negative = more aggressive)
- **Default**: -25dB
- **Use cases**:
  - Remove constant background noise (fans, air conditioning)
  - Clean up recordings in noisy environments
  - Improve clarity of distant speech

#### Audio Filter Enable/Disable
- **What it does**: Toggles all audio preprocessing on/off
- **Default**: Enabled
- **When to disable**: Testing, debugging, or when audio is already clean

### Text Filtering

Text filters validate the transcription results before accepting them.

#### Sound Effects Filtering
- **What it does**: Removes transcriptions that look like sound effects
- **Examples**: "(beep)", "(music)", "(applause)", "(laughter)"
- **Default**: Enabled
- **When to disable**: If you need to capture these descriptions

#### English Language Validation
- **What it does**: Rejects transcriptions that don't look like English text
- **Checks**:
  - Non-ASCII characters (emojis, other scripts)
  - Letter-to-character ratio
  - Presence of vowels
- **Default**: Enabled
- **When to disable**: Multi-language support, names/acronyms

#### Minimum Letter Ratio
- **What it does**: Requires a minimum percentage of letters in the text
- **Range**: 30% - 90%
- **Default**: 55%
- **Examples**:
  - "hello world" = 91% letters (passes)
  - "h3ll0 w0r1d" = 55% letters (passes at default)
  - "123 456" = 0% letters (fails)

#### Require Vowels
- **What it does**: Rejects text without at least one vowel (A, E, I, O, U)
- **Default**: Enabled
- **When to disable**: Capturing acronyms, abbreviations, or non-English names

### Voice Activity Detection (VAD)

VAD automatically detects when speech starts and stops.

#### VAD Threshold
- **What it does**: Sets the sensitivity for detecting speech vs silence
- **Range**: 0.05 - 0.95
- **Default**: 0.50
- **Lower values**: More sensitive (picks up quieter speech, may trigger on noise)
- **Higher values**: Less sensitive (only loud/clear speech, may miss quiet speech)

#### VAD Silence Duration
- **What it does**: How long to wait before considering speech ended
- **Range**: 100ms - 2000ms
- **Default**: 500ms
- **Shorter durations**: Faster response, may cut off speech
- **Longer durations**: More complete sentences, slower response

### Buffer Timing & Capture Settings

These settings control how audio is captured and buffered before being sent to the STT service.

#### Capture Chunk Duration
- **What it does**: Duration of each audio capture chunk
- **Range**: 0.25s - 1.0s
- **Default**: 0.5s
- **Recommended**: 0.5s (reduces process spawning overhead)
- **Use cases**:
  - Smaller chunks (0.25s): Lower latency, more CPU overhead
  - Larger chunks (1.0s): Higher latency, less CPU overhead

#### STT Throttle Interval
- **What it does**: How often to send accumulated audio to the STT service
- **Range**: 1000ms - 5000ms
- **Default**: 2500ms
- **Recommended**: 2500ms for full sentence capture
- **Use cases**:
  - Shorter intervals (1500ms): Faster response, may fragment sentences
  - Longer intervals (3500ms): Complete sentences, slower response

#### Minimum Buffer Duration
- **What it does**: Minimum audio duration before sending to STT
- **Range**: 1.0s - 5.0s
- **Default**: 2.5s
- **Recommended**: 2.5s (captures full sentences)
- **Use cases**:
  - Shorter duration (1.5s): Faster response, may miss words
  - Longer duration (3.5s): Complete long phrases, slower response

#### Maximum Buffer Duration
- **What it does**: Maximum audio buffer size before forcing transcription
- **Range**: 3.0s - 10.0s
- **Default**: 6.0s
- **Recommended**: 6.0s (allows long phrases without truncation)
- **Use cases**:
  - Shorter duration (4.0s): Prevents very long buffers
  - Longer duration (8.0s): Captures very long sentences

#### Microphone Input Gain
- **What it does**: System-level microphone volume control
- **Range**: 25% - 100%
- **Default**: 70%
- **Recommended**: 70% (prevents audio clipping while maintaining good levels)
- **Use cases**:
  - Lower gain (50-60%): Very loud environments or sensitive microphones
  - Higher gain (80-90%): Quiet environments or distant microphones
  - **Warning**: Gain above 75% may cause audio clipping (distortion)

---

## Tuning for Your Environment

### Step 1: Choose a Starting Preset

Select the preset that most closely matches your environment:
- Quiet indoor space → **Quiet Room**
- Busy/noisy area → **Noisy Environment**
- Need best quality → **High Accuracy**
- Testing/debugging → **Testing/Debug**

### Step 2: Test and Observe

1. Click "Start Listening"
2. Speak normally into the microphone
3. Observe the transcription results
4. Note any issues:
   - Missing words?
   - Gibberish appearing?
   - Delayed response?
   - Cutting off sentences?

### Step 3: Fine-Tune

Based on the issues you observed, adjust the settings:

#### If STT is missing speech:
- **Decrease** VAD Threshold (e.g., from 0.50 to 0.35)
- **Decrease** Highpass Filter (e.g., from 200Hz to 150Hz)
- **Increase** Denoise Level (e.g., from -25dB to -20dB)
- **Decrease** Min Letter Ratio (e.g., from 55% to 45%)

#### If STT is picking up too much noise:
- **Increase** VAD Threshold (e.g., from 0.50 to 0.65)
- **Increase** Highpass Filter (e.g., from 200Hz to 300Hz)
- **Decrease** Denoise Level (e.g., from -25dB to -35dB)
- **Increase** Min Letter Ratio (e.g., from 55% to 65%)

#### If getting gibberish transcriptions:
- **Enable** Validate English Text
- **Enable** Filter Bracketed Sound Effects
- **Enable** Require Vowels
- **Increase** Min Letter Ratio (e.g., to 65-75%)

#### If cutting off sentences:
- **Increase** VAD Silence Duration (e.g., from 500ms to 800ms)

#### If response is too slow:
- **Decrease** VAD Silence Duration (e.g., from 500ms to 300ms)

### Step 4: Save and Test Again

1. Click "Save Configuration"
2. Stop and restart listening
3. Test again with the new settings
4. Repeat steps 2-4 until satisfied

---

## Troubleshooting Common Issues

### Issue: No transcription appearing

**Possible causes:**
- Microphone not selected or not working
- VAD threshold too high
- Audio filters too aggressive

**Solutions:**
1. Check microphone selection in "Microphone Integration" section
2. Lower VAD threshold to 0.30
3. Temporarily disable audio filtering
4. Check microphone input level (should show activity in VU meter)

### Issue: Transcription is gibberish

**Possible causes:**
- Picking up background noise
- Music or sound effects being transcribed
- Poor audio quality

**Solutions:**
1. Enable all text filters
2. Increase Min Letter Ratio to 65%
3. Enable Require Vowels
4. Increase VAD threshold to 0.60
5. Increase Highpass filter to 300Hz

### Issue: Missing words or partial sentences

**Possible causes:**
- VAD threshold too high
- Silence duration too short
- Audio filters removing speech

**Solutions:**
1. Lower VAD threshold to 0.35
2. Increase Silence Duration to 700ms
3. Lower Highpass filter to 150Hz
4. Increase Lowpass filter to 4500Hz

### Issue: Delayed transcription

**Possible causes:**
- Silence duration too long
- Network latency to ElevenLabs API

**Solutions:**
1. Decrease Silence Duration to 300ms
2. Check network connection
3. Use "Conversation" preset for faster response

### Issue: Transcription cuts off mid-sentence

**Possible causes:**
- Silence duration too short
- VAD threshold too high during pauses

**Solutions:**
1. Increase Silence Duration to 800ms
2. Lower VAD threshold slightly
3. Speak more continuously without long pauses

---

## Advanced Configuration

### Creating Custom Configurations

You can create your own optimized configuration by:

1. Start with the closest preset
2. Fine-tune each parameter
3. Document your settings
4. Save the configuration

### Recommended Settings by Use Case

#### Interactive Character (Conversation)
```
VAD Threshold: 0.40
Silence Duration: 450ms
Highpass: 180Hz
Lowpass: 4200Hz
Denoise: -22dB
Min Letter Ratio: 55%
Capture Chunk Duration: 0.5s
STT Throttle Interval: 2500ms
Min Buffer Duration: 2.5s
Max Buffer Duration: 6.0s
Microphone Input Gain: 70%
```

#### Haunted House (Noisy, Music)
```
VAD Threshold: 0.70
Silence Duration: 800ms
Highpass: 300Hz
Lowpass: 3500Hz
Denoise: -35dB
Min Letter Ratio: 65%
Capture Chunk Duration: 0.5s
STT Throttle Interval: 3000ms
Min Buffer Duration: 3.0s
Max Buffer Duration: 6.0s
Microphone Input Gain: 65%
```

#### Museum Guide (Quiet, Accurate)
```
VAD Threshold: 0.35
Silence Duration: 600ms
Highpass: 150Hz
Lowpass: 4000Hz
Denoise: -20dB
Min Letter Ratio: 60%
Capture Chunk Duration: 0.5s
STT Throttle Interval: 2500ms
Min Buffer Duration: 2.5s
Max Buffer Duration: 6.0s
Microphone Input Gain: 70%
```

### Understanding the Audio Pipeline

```
Microphone Input
    ↓
PipeWire/PulseAudio (Gain Control - 70% default)
    ↓
Audio Capture (0.5s chunks)
    ↓
Audio Filtering (if enabled)
    ├─ Highpass Filter
    ├─ Lowpass Filter
    └─ Denoise
    ↓
Voice Activity Detection
    ↓
Buffer Accumulation (2.5s min, 6.0s max)
    ↓
STT Throttle (2.5s interval)
    ↓
ElevenLabs STT API
    ↓
Text Filtering (if enabled)
    ├─ SFX Filter
    ├─ English Validation
    ├─ Letter Ratio Check
    └─ Vowel Check
    ↓
Transcription Output
```

### Performance Considerations

- **Audio capture** uses 0.5s chunks to reduce process spawning overhead
- **Buffer accumulation** waits for 2.5s minimum before sending to STT
- **STT throttle** limits requests to every 2.5s to capture full sentences
- **Audio filtering** adds ~50-100ms latency (FFmpeg processing)
- **Text filtering** adds <1ms latency (regex checks)
- **VAD** affects response time based on Silence Duration setting
- **Network latency** to ElevenLabs API is typically 100-300ms
- **Total latency**: Typically 2.5-3.5 seconds from speech start to transcription

### Best Practices

1. **Start with presets** - Don't manually configure unless needed
2. **Test in real conditions** - Configure in the actual environment
3. **Document your settings** - Save successful configurations
4. **Iterate gradually** - Change one parameter at a time
5. **Monitor performance** - Watch for latency or quality issues

---

## Support

For additional help:
- Check server logs: `/tmp/mb-server.log`
- Enable debug mode: `MB_DEBUG_AUDIO=1`
- Review STT configuration: `/home/remote/MonsterBox/data/ai-config/stt-config.json`
- Test with minimal filtering: Use "Testing/Debug" preset

---

**Last Updated**: 2025-10-17
**MonsterBox Version**: 5.5 (Gold Release)

