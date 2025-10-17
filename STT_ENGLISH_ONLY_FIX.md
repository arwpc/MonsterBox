# STT English-Only Transcription Fix

## Problem

The STT (Speech-to-Text) system was transcribing audio in multiple languages, including:
- Chinese: (背景噪音)
- Bengali: ওয়াই ডু ইজ স্পিকিং ইংলিশ? আই অলওস স্পিকিং।
- Other languages detected from background noise

This occurred even when speaking English, because the system was configured to auto-detect languages.

---

## Root Cause

The STT configuration was set to:
- **Model**: `scribe_v1` (Multilingual - supports 99 languages)
- **Language**: `auto` (Auto-detect any language)

When using auto-detect, the ElevenLabs Scribe model attempts to identify the language from audio, which can misinterpret:
- Background noise as foreign languages
- Ambient sounds as speech in other languages
- Unclear audio as non-English text

---

## Solution

### 1. Use English-Only Model

Changed STT configuration to:
- **Model**: `scribe_english_v1` (English-only optimization)
- **Language**: `en` (Force English)

This configuration:
- Forces the model to only transcribe in English
- Prevents misinterpretation of background noise as foreign languages
- Improves accuracy for English speech recognition

### 2. Backend Implementation

The `elevenLabsSTTService.js` already handles the `scribe_english_v1` model correctly:

```javascript
// Map English-only alias to actual model and enforce language
var modelToSend = options.model || 'scribe_v1';
var langToSend = options.language;
if (modelToSend === 'scribe_english_v1') {
    modelToSend = 'scribe_v1';
    if (!langToSend || langToSend === 'auto') langToSend = 'en';
}

// Required by ElevenLabs STT
formData.append('model_id', modelToSend);

// Only pass language if explicitly provided and not 'auto'
if (langToSend && langToSend !== 'auto') {
    formData.append('language', langToSend);
}
```

When `scribe_english_v1` is selected:
1. Sends `model_id: 'scribe_v1'` to ElevenLabs API
2. Forces `language: 'en'` parameter
3. ElevenLabs API constrains transcription to English only

### 3. UI Improvements

Updated the STT settings page (`views/ai-settings/stt.ejs`) to:
- Add helpful hint: "Use **Scribe English v1** for English-only transcription"
- Mark English as "(Recommended)" in language dropdown
- Add warning for Auto-detect: "May transcribe background noise as foreign languages"

---

## How to Configure

### Via UI (Recommended)

1. Navigate to: http://groundbreaker:3000/ai-settings/stt
2. Set **STT Model** to: `Scribe English v1`
3. Set **Language** to: `English (Recommended)`
4. Click **Save Configuration**

### Via API

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "model": "scribe_english_v1",
    "language": "en",
    "sampleRate": 16000,
    "vadEnabled": true,
    "vadThreshold": 0.95,
    "vadSilenceDuration": 500,
    "audioFilterEnabled": true,
    "highpassFreq": 200,
    "lowpassFreq": 4200,
    "denoiseLevel": -20,
    "filterSfx": true,
    "validateEnglish": true,
    "minLetterRatio": 55,
    "requireVowels": true,
    "microphonePartId": "4",
    "microphoneDeviceId": "default",
    "format": "mp3"
  }' \
  http://groundbreaker:3000/api/elevenlabs/stt/config
```

### Via Config File

Edit `data/character-{id}/ai-config/stt-config.json`:

```json
{
  "model": "scribe_english_v1",
  "language": "en",
  ...
}
```

---

## Verification

After applying the fix, test by speaking English near the microphone. The transcription should:
- ✅ Only show English text
- ✅ Not show foreign language characters
- ✅ Ignore background noise instead of transcribing it as other languages

---

## Technical Details

### ElevenLabs Scribe Models

| Model ID | Name | Languages | Use Case |
|----------|------|-----------|----------|
| `scribe_v1` | Scribe v1 (Multilingual) | 99 languages | Multi-language environments |
| `scribe_english_v1`* | Scribe English v1 | English only | English-only environments |

\* `scribe_english_v1` is an alias that sends `model_id: 'scribe_v1'` with `language: 'en'` to force English-only transcription.

### Language Parameter Behavior

- `language: 'en'` - Forces English transcription only
- `language: 'auto'` - Auto-detects language (can misinterpret noise)
- `language: 'es'`, `'fr'`, etc. - Forces specific language

### Why Auto-Detect Fails

Auto-detect uses acoustic patterns to identify languages. Background noise can have patterns similar to:
- Tonal languages (Chinese, Vietnamese)
- Syllabic languages (Japanese, Korean)
- Phonetic patterns from other languages

By forcing `language: 'en'`, the model only considers English phonemes and ignores patterns from other languages.

---

## Files Modified

1. **data/character-5/ai-config/stt-config.json** - Updated config to use English-only model
2. **views/ai-settings/stt.ejs** - Added UI hints and warnings
3. **STT_ENGLISH_ONLY_FIX.md** - This documentation

---

## Status

✅ **FIXED** - Groundbreaker (Character 5) now configured for English-only transcription

**Configuration**:
- Model: `scribe_english_v1`
- Language: `en`
- All other settings preserved

**Tested**: Configuration saved successfully via API

