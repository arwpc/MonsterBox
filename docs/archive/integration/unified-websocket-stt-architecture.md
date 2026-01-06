# Unified WebSocket STT Architecture

## Executive Summary

**Goal**: Replace duplicate STT implementations with a single, bulletproof WebSocket-based approach using ElevenLabs Conversational AI API.

**Current State**: 
- ❌ **serverSTTListener** (HTTP polling) - Used by STT settings page
- ❌ **elevenLabsWebSocketService** (WebSocket port 8795) - Used by conversation page
- ❌ **mic-panel.js** - Browser-side WebAudio capture
- ❌ Duplicate code, inconsistent behavior, different approaches

**Target State**:
- ✅ **Single WebSocket service** - ElevenLabs Conversational AI WebSocket API
- ✅ **Works on all animatronics** - Character-specific VAD/microphone configs
- ✅ **Hardened reliability** - Session cleanup, error recovery, comprehensive logging
- ✅ **No duplication** - One implementation, used everywhere

---

## ElevenLabs WebSocket STT API

### Connection Flow

1. **Get Signed URL**:
   ```
   GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=<agent_id>
   Headers: xi-api-key: <api_key>
   Response: { "signed_url": "wss://..." }
   ```

2. **Connect to WebSocket**:
   ```javascript
   const ws = new WebSocket(signed_url);
   ```

3. **Send Initiation**:
   ```javascript
   ws.send(JSON.stringify({
     type: "conversation_initiation_client_data"
   }));
   ```

4. **Stream Audio**:
   ```javascript
   ws.send(JSON.stringify({
     user_audio_chunk: base64AudioData  // PCM16 16kHz mono
   }));
   ```

### Events Received

- **`user_transcript`**: User's speech transcribed
  ```javascript
  {
    type: "user_transcript",
    user_transcription_event: {
      user_transcript: "hello world"
    }
  }
  ```

- **`agent_response`**: AI agent's text response
- **`audio`**: AI agent's audio response (base64)
- **`ping`**: Keep-alive (respond with `pong`)
- **`interruption`**: User interrupted agent

---

## Architecture Design

### Core Service: `unifiedSTTService.js`

**Responsibilities**:
- Manage WebSocket connections to ElevenLabs
- Capture server-side microphone audio (PipeWire/PulseAudio)
- Convert PCM to base64 and stream to WebSocket
- Receive and emit transcription events
- Handle session lifecycle (start/stop/cleanup)
- Apply character-specific VAD settings
- Comprehensive error recovery and logging

**Key Features**:
- ✅ Session cleanup (auto-expire after 1 hour)
- ✅ Error recovery (circuit breaker pattern)
- ✅ Comprehensive logging (all events logged)
- ✅ Character-aware (loads VAD/mic config per character)
- ✅ Multi-animatronic support (works on all devices)

### Client Integration

#### STT Settings Page (`ai-settings-stt.js`)
- Connect to local WebSocket server (port 8795)
- Display live transcription
- Show VU meter from audio levels
- Configure VAD threshold, microphone device
- Test transcription with real-time feedback

#### Conversation Page (`mic-panel.js`)
- Same WebSocket connection
- Same transcription display
- Parrot mode integration
- Jaw animation integration

---

## Implementation Plan

### Phase 1: Enhance Existing WebSocket Service ✅

**File**: `services/elevenLabsWebSocketService.js`

**Changes**:
1. Add session cleanup timer (every 60s)
2. Add error recovery (circuit breaker, max 10 consecutive errors)
3. Add comprehensive logging (all events, errors, state changes)
4. Add character-specific VAD loading
5. Add session timeout (1 hour max)

**Hardening from serverSTTListener**:
- Session Map cleanup
- Consecutive error tracking
- Auto-stop on persistent errors
- Full observability

### Phase 2: Update STT Settings Page

**File**: `public/js/ai-settings-stt.js`

**Changes**:
1. Remove HTTP polling (`/stt/listen/start`, `/stt/listen/stop`)
2. Connect to WebSocket (port 8795)
3. Send `set_mic_source: server` message
4. Listen for `user_transcript` events
5. Display transcription in real-time
6. Keep VU meter (from audio level API)

**Benefits**:
- Real-time transcription (no polling delay)
- Consistent with conversation page
- Better error handling
- Full ElevenLabs API compliance

### Phase 3: Verify Conversation Page

**File**: `public/js/mic-panel.js`

**Status**: Already uses WebSocket!

**Verify**:
- Uses same port 8795
- Receives `user_transcript` events
- Integrates with parrot mode
- Works with jaw animation

### Phase 4: Remove Duplicate Code

**Delete**:
- `services/serverSTTListener.js` (replaced by WebSocket)
- Routes: `/stt/listen/start`, `/stt/listen/stop`, `/stt/listen/status`
- Any other HTTP polling STT code

**Keep**:
- `services/elevenLabsSTTService.js` (used for one-shot transcription)
- `services/elevenLabsWebSocketService.js` (enhanced)
- `public/js/mic-panel.js` (already correct)

### Phase 5: Test on All Animatronics

**Devices**:
- Groundbreaker (character 5)
- Orlok
- Coffin
- Skulltalker
- Pumpkinhead

**Test Cases**:
1. Start listening → transcription appears
2. Stop listening → session cleanly terminated
3. Adjust VAD threshold → transcription sensitivity changes
4. Change microphone → uses new device
5. Run for 1 hour → no memory leaks, auto-cleanup works
6. Trigger 10 errors → session stops gracefully
7. Restart after errors → fresh session works

---

## Character-Specific Configuration

### STT Config Structure

**File**: `data/character-{id}/ai-config/stt-config.json`

```json
{
  "model": "scribe_english_v1",
  "language": "en",
  "microphonePartId": "4",
  "microphoneDeviceId": "alsa_input.usb-...",
  "vadEnabled": true,
  "vadThreshold": 0.02,
  "vadSilenceDuration": 500,
  "audioFilterEnabled": true,
  "highpassFreq": 200,
  "lowpassFreq": 4200,
  "denoiseLevel": -20,
  "filterSfx": true,
  "validateEnglish": true,
  "minLetterRatio": 55,
  "requireVowels": true
}
```

### VAD Threshold Guidelines

- **Quiet room**: 0.01-0.02 (very sensitive)
- **Normal room**: 0.02-0.05 (recommended)
- **Noisy room**: 0.05-0.10 (less sensitive)
- **Very noisy**: 0.10-0.20 (only loud speech)

**Current Settings**:
- Groundbreaker: 0.02 (quiet environment)
- Others: TBD (user will tune per animatronic)

---

## Migration Checklist

- [x] Fix Stop Listening button (CSS instead of disabled)
- [ ] Enhance elevenLabsWebSocketService with hardening
- [ ] Update ai-settings-stt.js to use WebSocket
- [ ] Verify mic-panel.js works correctly
- [ ] Remove serverSTTListener.js
- [ ] Remove HTTP polling routes
- [ ] Test on Groundbreaker
- [ ] Test on Orlok
- [ ] Test on Coffin
- [ ] Test on Skulltalker
- [ ] Test on Pumpkinhead
- [ ] Update documentation
- [ ] Final verification

---

## Benefits

### Reliability
- ✅ No memory leaks (auto cleanup)
- ✅ No session conflicts (proper lifecycle)
- ✅ Error recovery (circuit breaker)
- ✅ Full observability (comprehensive logging)

### Consistency
- ✅ One implementation (no duplication)
- ✅ Same behavior everywhere (STT page, conversation page)
- ✅ ElevenLabs API compliant (official WebSocket protocol)

### Maintainability
- ✅ Single source of truth
- ✅ Easier to debug (one codebase)
- ✅ Easier to enhance (one place to change)

### Performance
- ✅ Real-time transcription (WebSocket streaming)
- ✅ Lower latency (no HTTP polling overhead)
- ✅ Better resource usage (one connection vs polling)

---

## Next Steps

1. **Immediate**: Enhance `elevenLabsWebSocketService.js` with hardening
2. **Next**: Update `ai-settings-stt.js` to use WebSocket
3. **Then**: Remove duplicate code
4. **Finally**: Test on all animatronics

**Timeline**: 2-3 hours for full implementation and testing

