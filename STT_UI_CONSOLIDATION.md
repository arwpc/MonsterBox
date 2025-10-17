# STT UI Consolidation & Real-Time Auto-Save

## Summary

Consolidated the STT settings interface by removing duplicate "Microphone Integration" panel and integrating all features into a single, unified STT Configuration panel with real-time auto-save for all settings.

---

## Problems Fixed

### 1. Navigation Bar Not Working on Conversation Page

**Problem**: Navigation bar was not visible/working on http://groundbreaker:3000/conversation

**Root Cause**: The conversation route used `includeMainWrapper: false`, which caused the page to render its own `<main>` tag, conflicting with the layout system.

**Fix**:
- Removed `includeMainWrapper: false` from `routes/conversation.js`
- Changed `views/conversation/index.ejs` to use `<div>` wrapper instead of `<main>`
- Navigation now renders correctly via the master layout

### 2. Duplicate Microphone Integration Panel

**Problem**: The STT settings page had two separate panels with overlapping settings:
- **STT Configuration** panel (main, left side)
- **Microphone Integration** panel (sidebar, right side)

**Duplicate Settings**:
- VAD Enabled checkbox (in both panels)
- VAD Threshold slider (different ranges: 0.05-0.95 vs 1-30%)
- Microphone Part selection
- Input Level VU meter
- Input Gain slider

**Fix**: Removed the entire "Microphone Integration" panel and integrated all unique features into the main STT Configuration panel.

### 3. Settings Not Saving Immediately

**Problem**: Many settings required manual "Save" button click and didn't apply in real-time.

**Fix**: Added auto-save event listeners to all form controls.

---

## New Unified STT Configuration Layout

The STT settings page now has a single, full-width panel organized into logical sections:

### 1. **Model & Language** (Top Row)
- STT Model dropdown (auto-saves)
- Language dropdown (auto-saves)
- Helpful hints for English-only transcription

### 2. **Sample Rate & VAD** (Second Row)
- Sample Rate dropdown (auto-saves)
- VAD Enabled checkbox (auto-saves)

### 3. **Microphone Hardware** (New Section)
- **Microphone Part** dropdown - Select hardware microphone
- **Input Level VU Meter** - Real-time audio level visualization (20px height, green progress bar)
- **Input Gain** slider (0-200%) - Applies immediately via PipeWire/PulseAudio
- **Test Microphone → STT** button - Test the complete audio pipeline

### 4. **VAD Tuning** (New Section)
- **VAD Threshold** slider (0.05-0.95, auto-saves)
  - Hint: "Tune while watching VU meter"
- **VAD Silence Duration** slider (100-2000ms, auto-saves)

### 5. **Audio Filtering** (Existing Section)
- **Audio Preprocessing** checkbox (auto-saves)
- **Highpass Filter** slider (50-500Hz, auto-saves)
- **Lowpass Filter** slider (1000-8000Hz, auto-saves)
- **Denoise Level** slider (-40 to 0dB, auto-saves)

### 6. **Sound Effects & Validation** (Existing Section)
- **Filter SFX** checkbox (auto-saves)
- **Validate English** checkbox (auto-saves)
- **Min Letter Ratio** slider (30-90%, auto-saves)
- **Require Vowels** checkbox (auto-saves)

### 7. **Real-time Transcription** (Bottom Panel)
- Start Listening button
- Stop Listening button
- 2s Test button
- Live transcription display area

---

## Real-Time Auto-Save Implementation

All settings now save immediately when changed:

### Dropdowns (Already Implemented)
```javascript
modelSelect.addEventListener('change', function () {
    self.savePartialConfig({ model: modelSelect.value });
});
```

### Range Sliders (Newly Added)
```javascript
vadThresholdEl.addEventListener('input', function () {
    var val = parseFloat(vadThresholdEl.value);
    vadThresholdValue.textContent = val.toFixed(2);
    self.savePartialConfig({ vadThreshold: val });
});
```

### Checkboxes (Newly Added)
```javascript
audioFilterEnabledEl.addEventListener('change', function () {
    self.savePartialConfig({ audioFilterEnabled: !!audioFilterEnabledEl.checked });
});
```

### Input Gain (Already Implemented)
```javascript
inputGain.addEventListener('input', function () {
    var pct = parseInt(inputGain.value, 10) || 100;
    inputGainLabel.textContent = pct + '%';
    fetch('/setup/audio/api/set-input-gain', {
        method: 'POST',
        body: JSON.stringify({ deviceId: devId, gainPercent: pct })
    });
});
```

---

## Debouncing for Performance

The `savePartialConfig()` function uses 500ms debouncing:
- Updates local config **immediately** for instant UI feedback
- Delays actual server save by 500ms
- Cancels previous pending saves
- Result: Smooth slider dragging without overwhelming the server

---

## Benefits

### For Users
1. **Single Unified Interface** - All STT tuning in one place
2. **Real-Time Feedback** - See VU meter while adjusting all settings
3. **Instant Saves** - No more "Save" button hunting
4. **Better Layout** - Full-width panel, more screen space
5. **Logical Organization** - Settings grouped by function

### For Developers
1. **No Duplication** - Single source of truth for each setting
2. **Consistent Behavior** - All controls auto-save the same way
3. **Easier Maintenance** - One panel instead of two
4. **Better UX** - Settings apply immediately for tuning

---

## Technical Details

### Files Modified

1. **routes/conversation.js**
   - Removed `includeMainWrapper: false`
   - Navigation now renders correctly

2. **views/conversation/index.ejs**
   - Changed `<main>` to `<div>` wrapper
   - Added closing `</div>` tag

3. **views/ai-settings/stt.ejs**
   - Removed entire "Microphone Integration" panel (lines 321-379)
   - Added "Microphone Hardware" section to main panel
   - Added "VAD Tuning" section header
   - Changed layout from `col-lg-8` to `col-12` (full width)
   - Improved VU meter styling (20px height, green color)

4. **public/js/ai-settings-stt.js**
   - Added auto-save for all range sliders:
     * vadThreshold
     * vadSilenceDuration
     * highpassFreq
     * lowpassFreq
     * denoiseLevel
     * minLetterRatio
   - Added auto-save for all checkboxes:
     * audioFilterEnabled
     * filterSfx
     * validateEnglish
     * requireVowels
   - VAD checkbox already had auto-save
   - Input gain already applied immediately

### Auto-Save Settings List

**Dropdowns** (already auto-saving):
- STT Model
- Language
- Sample Rate
- Microphone Part

**Range Sliders** (now auto-saving):
- VAD Threshold (0.05-0.95)
- VAD Silence Duration (100-2000ms)
- Highpass Frequency (50-500Hz)
- Lowpass Frequency (1000-8000Hz)
- Denoise Level (-40 to 0dB)
- Min Letter Ratio (30-90%)

**Checkboxes** (now auto-saving):
- VAD Enabled
- Audio Filter Enabled
- Filter SFX
- Validate English
- Require Vowels

**Special Controls**:
- Input Gain (0-200%) - Applies immediately via PipeWire API

---

## Testing

### Test Navigation Fix
1. Navigate to http://groundbreaker:3000/conversation
2. Verify navigation bar is visible at top
3. Click navigation links to verify they work

### Test Consolidated STT Settings
1. Navigate to http://groundbreaker:3000/ai-settings/stt
2. Verify single full-width panel (no sidebar)
3. Verify all sections are present:
   - Model & Language
   - Sample Rate & VAD
   - Microphone Hardware (with VU meter)
   - VAD Tuning
   - Audio Filtering
   - Sound Effects & Validation
   - Real-time Transcription

### Test Auto-Save
1. Change any dropdown → Check browser network tab for immediate save
2. Drag any slider → Check network tab for debounced save (500ms)
3. Toggle any checkbox → Check network tab for immediate save
4. Verify all changes persist after page refresh

### Test Real-Time Features
1. Select microphone part → VU meter should start updating
2. Adjust Input Gain slider → Audio level should change immediately
3. Watch VU meter while adjusting VAD Threshold
4. Click "Test Microphone → STT" → Should transcribe audio

---

## Migration Notes

**No Breaking Changes**: All existing functionality preserved, just reorganized.

**Config Compatibility**: All settings use the same config keys, no migration needed.

**API Compatibility**: All endpoints unchanged, just UI reorganization.

---

## Status

✅ **COMPLETE** - All changes deployed and tested

**Commit**: ededf71f  
**Deployed**: MonsterBox 5.3 (Groundbreaker)

**Pages Updated**:
- http://groundbreaker:3000/conversation (navigation fixed)
- http://groundbreaker:3000/ai-settings/stt (consolidated UI)

