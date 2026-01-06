# MonsterBox Hardware Independence Configuration Prompt

## Critical Requirements for Autonomous RPi4B Operation

### 1. Hardware Audio/Microphone Independence

**PROBLEM**: The system is incorrectly trying to use the local browser's microphone and speakers instead of the Character's RPi4B hardware.

**SOLUTION REQUIREMENTS**:
- **Microphone Input**: Must use the physical microphone connected to the Character's RPi4B GPIO/USB ports
- **Speaker Output**: Must use the physical speakers/audio output connected to the Character's RPi4B audio jack/HDMI/USB
- **STT Processing**: Speech-to-Text must process audio from the RPi4B's local microphone hardware
- **TTS Playback**: Text-to-Speech must play through the RPi4B's local speaker hardware
- **Port Configuration**: Each Character must use their assigned microphone service port (8776) and audio hardware

### 2. Critical Browser vs RPi Hardware Audio Issue

**ROOT CAUSE IDENTIFIED**: The frontend JavaScript code is using `navigator.mediaDevices.getUserMedia()` which accesses the **browser's local microphone** (development machine) instead of the **RPi4B's hardware microphone**.

**SPECIFIC PROBLEM LOCATIONS**:
- `public/js/EnhancedMicrophoneComponent.js` line 621: `navigator.mediaDevices.getUserMedia()`
- `public/js/enhanced-test-chat.js` line 1133: `navigator.mediaDevices.getUserMedia()`
- `public/js/MediaCaptureService.js` line 97: `navigator.mediaDevices.getUserMedia()`

**SOLUTION REQUIREMENTS**:
- **Replace browser microphone access** with WebSocket calls to RPi hardware microphone service (port 8776)
- **Modify frontend JavaScript** to use existing WebSocket infrastructure instead of `getUserMedia()`
- **Route audio through** `scripts/hardware/microphone_websocket_service.py` on the RPi4B
- **Use existing microphone configuration** from `data/microphones.json` and `data/character-audio-config.json`
- **Preserve all audio settings** (sample rate, channels, echo cancellation) but apply them to RPi hardware

### 3. Missing API Endpoints (Causing 404 Errors) - ✅ FIXED

**PROBLEM**: Frontend is calling API routes that don't exist, causing these errors:
```
Route /ai-management/api/vad/test-levels not found
Route /ai-management/api/test/stt not found
Route /ai-management/api/vad/test-performance not found
Route /ai-management/api/health not found
```

**STATUS**: ✅ **COMPLETED** - All missing API routes have been added to `routes/aiManagementRoutes.js`

### 4. ElevenLabs Authentication Issues - ✅ FIXED

**PROBLEM**: ElevenLabs Conversational Service failing with HTTP 401 errors:
```
Failed to get signed URL: HTTP 401
```

**STATUS**: ✅ **COMPLETED** - ElevenLabs API key has been added to `.env` file
- Added `ELEVENLABS_API_KEY` to environment variables
- API key will be loaded by existing `utils/elevenlabsKey.js` utility
- Authentication should now work properly

### 5. Character-Specific Hardware Configuration

**SOLUTION REQUIREMENTS**:
- Each Character's RPi4B must operate independently using their specific hardware configuration
- Hardware assignments from `data/characters.json` must be respected
- Microphone service must bind to Character's specific microphone hardware ID
- Audio output must route to Character's specific speaker configuration
- WebSocket services (8765-8780) must run locally on each RPi4B
- No dependency on external browser or development machine hardware

### 6. Autonomous Operation Requirements

**CRITICAL**: Each Character must operate completely autonomously without human intervention:

- **Hardware Services**: All WebSocket hardware services must auto-start with `npm start`
- **Error Recovery**: System must handle and recover from hardware errors automatically
- **Service Monitoring**: Hardware services must self-monitor and restart if needed
- **Configuration Persistence**: All settings must persist across reboots
- **Network Independence**: Must work even if development machine is offline
- **Local Processing**: All AI, STT, TTS processing must happen locally on the RPi4B

### 7. Implementation Checklist

**Phase 1: Fix Missing API Routes** - ✅ **COMPLETED**
- [x] Add `/ai-management/api/vad/test-levels` endpoint
- [x] Add `/ai-management/api/test/stt` endpoint
- [x] Add `/ai-management/api/vad/test-performance` endpoint
- [x] Add `/ai-management/api/health` endpoint
- [x] Test all endpoints return proper JSON responses

**Phase 2: Fix ElevenLabs Authentication** - ✅ **COMPLETED**
- [x] Add ElevenLabs API key to `.env` file
- [x] API key loading via existing `utils/elevenlabsKey.js`
- [x] Fix HTTP 401 authentication errors
- [x] Test conversational AI functionality

**Phase 3: Fix Hardware Audio Routing** - 🚨 **CRITICAL PRIORITY**
- [ ] **Replace `navigator.mediaDevices.getUserMedia()` calls** in frontend JavaScript
- [ ] **Modify `public/js/EnhancedMicrophoneComponent.js`** to use WebSocket microphone service
- [ ] **Modify `public/js/enhanced-test-chat.js`** to use WebSocket microphone service
- [ ] **Modify `public/js/MediaCaptureService.js`** to use WebSocket microphone service
- [ ] **Route audio through RPi4B hardware** via port 8776 WebSocket service
- [ ] **Configure speaker output** to use RPi4B hardware (not browser)
- [ ] **Test STT uses local RPi microphone** input
- [ ] **Test TTS uses local RPi speaker** output

**Phase 4: Validate Autonomous Operation**
- [ ] Test complete system startup with `npm start`
- [ ] Verify all WebSocket services start automatically
- [ ] Test Character operates without development machine connection
- [ ] Verify hardware independence (microphone, speakers, servos, etc.)
- [ ] Test error recovery and self-healing capabilities

### 8. Testing Requirements

**Hardware Independence Tests**:
- Disconnect development machine and verify Character still operates
- Test microphone input using only RPi4B hardware
- Test speaker output using only RPi4B hardware
- Verify STT/TTS processing works locally
- Test all WebSocket services respond correctly

**API Endpoint Tests**:
- Test each missing API endpoint returns proper responses
- Verify VAD testing functionality works
- Verify STT testing functionality works
- Verify health check endpoint works

**Authentication Tests**:
- Test ElevenLabs API authentication succeeds
- Verify conversational AI starts without errors
- Test token validation and refresh

### 9. Success Criteria

The MonsterBox system will be considered properly configured when:

1. **Zero 404 API errors** - All frontend API calls succeed
2. **Zero authentication errors** - ElevenLabs services authenticate successfully  
3. **Hardware independence** - Each Character operates using only their RPi4B hardware
4. **Autonomous operation** - Characters work without development machine connection
5. **Complete functionality** - STT, TTS, jaw animation, and all hardware services work seamlessly
6. **Error-free startup** - `npm start` completes without errors and all services are operational

### 10. Technical Implementation Details

**Frontend JavaScript Modifications Required**:

1. **Replace getUserMedia() calls** with WebSocket microphone service calls:
   ```javascript
   // WRONG (current code):
   const stream = await navigator.mediaDevices.getUserMedia({audio: {...}});

   // CORRECT (needed):
   const microphoneWS = new WebSocket('ws://127.0.0.1:8776');
   microphoneWS.send(JSON.stringify({
       type: 'start_microphone',
       microphone_id: 'microphone_1',
       config: audioSettings
   }));
   ```

2. **Audio data flow should be**:
   ```
   RPi Microphone Hardware → PyAudio → WebSocket Service (8776) → Node.js → STT Processing
   ```
   **NOT**:
   ```
   Browser Microphone → getUserMedia() → WebSocket → Node.js → STT Processing
   ```

3. **Speaker output should route through**:
   ```
   TTS Service → RPi Audio Hardware → Physical Speakers
   ```
   **NOT**:
   ```
   TTS Service → Browser Audio API → Development Machine Speakers
   ```

**Configuration Files to Verify**:
- `data/microphones.json` - Contains RPi microphone hardware definitions
- `data/character-audio-config.json` - Character-specific audio routing
- `scripts/hardware/microphone_websocket_service.py` - RPi microphone service
- Port 8776 - Microphone WebSocket service on each RPi4B

**Key Services Architecture**:
```
Character RPi4B:
├── Microphone Hardware Service (Port 8776)
├── Audio Stream Service (Built-in)
├── ElevenLabs STT Service
├── ElevenLabs TTS Service
└── Jaw Animation Service (Port 8765)
```

This configuration ensures each MonsterBox Character operates as a truly independent animatronic system.

---

## ✅ COMPLETED WORK SUMMARY

### 1. Missing API Endpoints - ✅ FIXED
- **Added** `/ai-management/api/health` endpoint - Returns system health status
- **Added** `/ai-management/api/test/stt` endpoint - Tests STT functionality
- **Added** `/ai-management/api/vad/test-levels` endpoint - Tests VAD audio levels
- **Added** `/ai-management/api/vad/test-performance` endpoint - Tests VAD performance
- **Verified** All endpoints return proper JSON responses and are operational

### 2. ElevenLabs Authentication - ✅ FIXED
- **Added** `ELEVENLABS_API_KEY` to `.env` file
- **Verified** API key is loaded properly (length: 67 characters)
- **Confirmed** ElevenLabs services initialize without HTTP 401 errors
- **Tested** System startup shows "ElevenLabs API key loaded" successfully

### 3. System Status - ✅ OPERATIONAL
- **MonsterBox server** starts successfully on ports 80 (HTTP) and 8080 (HTTPS)
- **WebSocket services** are running on ports 8770-8780 range
- **ElevenLabs services** operational on ports 8771 (Conversational) and 8778 (STT)
- **Hardware services** initialized for Character 1 (Orlok)

---

## 🚨 CRITICAL REMAINING WORK

### Frontend JavaScript Browser Audio Issue
**STATUS**: 🔴 **NOT STARTED** - This is the core problem causing browser vs RPi hardware confusion

**PROBLEM**: Frontend JavaScript files are using `navigator.mediaDevices.getUserMedia()` which accesses the development machine's browser microphone instead of the Character's RPi4B hardware microphone.

**FILES REQUIRING MODIFICATION**:
1. `public/js/EnhancedMicrophoneComponent.js` (line 621)
2. `public/js/enhanced-test-chat.js` (line 1133)
3. `public/js/MediaCaptureService.js` (line 97)

**SOLUTION REQUIRED**: Replace all `getUserMedia()` calls with WebSocket connections to the RPi's microphone hardware service (port 8776).

**IMPACT**: Until this is fixed, STT will continue using the wrong microphone source, preventing true hardware independence.
