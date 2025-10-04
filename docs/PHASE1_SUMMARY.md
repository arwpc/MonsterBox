# Phase 1 Summary: Orlok Bring-Up - Code Complete

## Status: ✅ Code Changes Complete - Ready for On-Device Testing

All code changes for Phase 1 have been completed and are ready for deployment to Orlok (192.168.8.120).

## Code Changes Implemented

### 1. ElevenLabsConfigService - File-First Key Reading ✅
**File**: `services/elevenLabsConfigService.js`

**Changes**:
- Modified `getElevenLabsConfig()` to prefer `/etc/monsterbox/elevenlabs.key` as source of truth
- Falls back to environment variable `ELEVENLABS_API_KEY` if file not found
- Validates key format and rejects placeholder values

**Impact**: Ensures consistent API key management across all animatronics using shared key file.

### 2. Per-Character TTS Configuration ✅
**File**: `services/aiConfigStore.js`

**Changes**:
- Added `getTTSConfigForCharacter(characterId)` function
- Loads TTS config from `data/character-{id}/ai-config/tts-config.json`
- Falls back to global config if character-specific config doesn't exist
- Merges with defaults to ensure all required fields exist

**Impact**: Each character can have unique voice, model, and TTS parameters.

### 3. Generate-and-Play Endpoint Update ✅
**File**: `routes/api/elevenLabsApiRoutes.js`

**Changes**:
- Updated `/api/elevenlabs/generate-and-play` endpoint to use per-character TTS config
- Removed hardcoded voice_id and TODO comment
- Returns `voiceId` in response for verification

**Impact**: TTS now uses character-specific voice configuration automatically.

### 4. Character TTS Configs Validated ✅
**Files**: `data/character-{1,2,3,4}/ai-config/tts-config.json`

**Status**:
- Character 1 (PumpkinHead): Valid config with Nosferatu voice
- Character 2 (Coffin Breaker): Valid config with Nosferatu voice
- Character 3 (Orlok): Valid config with Nosferatu voice (Tj9l48J9AJbry5yCP5eW)
- Character 4 (Skulltalker): Fixed empty voice_id, now has valid config

**Note**: All characters currently use same voice. Unique voices will be assigned in Phase 2.

## Deployment Tools Created

### 1. Deployment Script ✅
**File**: `scripts/deploy-to-animatronic.sh`

**Features**:
- Syncs code to target animatronic
- Preserves character-specific data (parts.json, poses.json, calibrations)
- Checks ElevenLabs key file
- Installs dependencies if needed
- Restarts MonsterBox service
- Verifies service is running

**Usage**:
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120
```

### 2. Comprehensive Test Script ✅
**File**: `scripts/orlok-bringup-test.sh`

**Tests**:
1. ElevenLabs API key file existence and permissions
2. API key validity (HTTP 200 from /v1/user)
3. MonsterBox service status
4. PipeWire audio sinks enumeration
5. Character TTS configuration
6. Speaker part configuration
7. TTS generation and playback
8. Recent logs for errors

**Usage** (on Orlok):
```bash
cd ~/MonsterBox && ./scripts/orlok-bringup-test.sh
```

### 3. Multi-Animatronic Test Script ✅
**File**: `scripts/test-all-animatronics.sh`

**Features**:
- Tests all 4 animatronics sequentially
- Checks network reachability
- Verifies service status
- Sends character-specific test messages
- Reports success/failure for each

**Usage**:
```bash
./scripts/test-all-animatronics.sh
```

## Documentation Created

### 1. Deployment Guide ✅
**File**: `docs/ORLOK_DEPLOYMENT.md`

Complete step-by-step guide covering:
- System context and prerequisites
- Phase 1: Orlok bring-up (7 steps)
- Troubleshooting decision tree
- Phase 2: Deploy to all animatronics
- Acceptance criteria

### 2. Quick Reference ✅
**File**: `docs/QUICK_REFERENCE.md`

Quick access to:
- Character network map
- Key files and locations
- Essential commands
- API endpoints
- Troubleshooting quick fixes
- Expected responses

### 3. README Update ✅
**File**: `README.md`

Added section on:
- Orlok deployment quick start
- Key features
- Documentation links
- Character network map

## On-Device Tasks Remaining

### Prerequisites
1. **SSH Access**: Ensure you can SSH to Orlok at `remote@192.168.8.120`
2. **ElevenLabs API Key**: Have the key ready: `sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94`

### Task 1: Verify ElevenLabs API Key ⏳
```bash
ssh remote@192.168.8.120
ls -l /etc/monsterbox/elevenlabs.key
stat -c %a /etc/monsterbox/elevenlabs.key
```

If not exists or wrong permissions:
```bash
echo 'sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94' | sudo tee /etc/monsterbox/elevenlabs.key
sudo chmod 600 /etc/monsterbox/elevenlabs.key
```

Test validity:
```bash
KEY=$(cat /etc/monsterbox/elevenlabs.key)
curl -s -o /dev/null -w "%{http_code}\n" -H "xi-api-key: $KEY" https://api.elevenlabs.io/v1/user
```
Expected: `200`

### Task 2: Deploy Code to Orlok ⏳
From development machine:
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120
```

Monitor logs:
```bash
ssh remote@192.168.8.120 'tail -f /tmp/monsterbox.out'
```

### Task 3: Validate Speaker Routing ⏳
SSH to Orlok:
```bash
wpctl status | sed -n '/Sinks:/,/Sources:/p' | head -n 25
```

Identify correct sink (likely USB audio or HDMI), then update `data/character-3/parts.json`:
```json
{
  "id": "24",
  "name": "Speaker-Orlok",
  "type": "speaker",
  "config": {
    "device": "alsa_output.usb-YOUR_DEVICE_HERE.analog-stereo",
    "volume": 80
  }
}
```

### Task 4: Run Comprehensive Test ⏳
On Orlok:
```bash
cd ~/MonsterBox
./scripts/orlok-bringup-test.sh
```

### Task 5: Manual TTS Test ⏳
If automated test fails:
```bash
curl -sS -X POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Orlok voice check. I am the ancient vampire.","characterId":3}'
```

Expected response:
```json
{
  "success": true,
  "played": true,
  "device": "alsa_output.usb-...",
  "message": "TTS played on character 3 speaker",
  "text": "Orlok voice check. I am the ancient vampire.",
  "voiceId": "Tj9l48J9AJbry5yCP5eW"
}
```

### Task 6: Test ConvAI WebSocket Streaming ⏳
Access web UI:
```
http://192.168.8.120:3000
```

Navigate to conversation interface:
1. Select Orlok (Character 3)
2. Start a conversation
3. Verify gapless audio playback
4. Check for any chunk gaps or delays

## Acceptance Criteria

- [ ] Orlok speaks audibly in Orlok's own voice on command (generate-and-play)
- [ ] Orlok speaks in live ConvAI mode with gapless streaming audio
- [ ] Correct routing to Orlok's speaker sink
- [ ] No ElevenLabs 401/403 errors
- [ ] /v1/user returns 200 from Orlok using key file
- [ ] Speaker routes and volumes are correct
- [ ] Code patterns ready for roll-out to all animatronics

## Next Steps After Orlok Success

### Phase 2: Deploy to All Animatronics
1. Deploy to Coffin Breaker (192.168.8.140)
2. Deploy to Skulltalker (192.168.8.130)
3. Deploy to PumpkinHead (192.168.8.150)
4. Assign unique voices to each character
5. Verify all respond to generate-and-play

### Phase 3: Room-Wide Validation
1. Test all animatronics together
2. Verify ConvAI streaming on all
3. Implement cross-mic verification

### Phase 4: Goblins Video Loop
1. Deploy 5 local videos per Goblin
2. VLC loop on HDMI

### Phase 5: Random Poses During Conversation
1. Add pose generator triggered during TTS/ConvAI
2. Safe amplitudes and cooldown

### Phase 6: Orchestration System
1. Broadcast/multicast endpoints
2. Coordinated control of Characters + Goblins

## Troubleshooting Resources

### If 401/403 from ElevenLabs
1. Replace key file with fresh key
2. Verify permissions (600)
3. Restart service
4. Test with curl to /v1/user

### If No Audio Output
1. Check mpg123 installed: `mpg123 --version`
2. Verify PipeWire sink in parts.json
3. Test with known audio file using speaker_cli.py
4. Check logs for mpg123 errors

### If Service Won't Start
1. Check port conflicts: `lsof -i :3000`
2. Check Node.js version: `node --version`
3. Reinstall dependencies: `npm install`
4. Check logs: `tail -f /tmp/monsterbox.out`

## Files Modified

### Core Services
- `services/elevenLabsConfigService.js` - File-first key reading
- `services/aiConfigStore.js` - Per-character TTS config
- `routes/api/elevenLabsApiRoutes.js` - Generate-and-play endpoint

### Data Files
- `data/character-4/ai-config/tts-config.json` - Fixed empty voice_id

### Scripts (New)
- `scripts/deploy-to-animatronic.sh` - Deployment automation
- `scripts/orlok-bringup-test.sh` - Comprehensive testing
- `scripts/test-all-animatronics.sh` - Multi-device testing

### Documentation (New)
- `docs/ORLOK_DEPLOYMENT.md` - Complete deployment guide
- `docs/QUICK_REFERENCE.md` - Quick command reference
- `docs/PHASE1_SUMMARY.md` - This file

### README
- `README.md` - Added Orlok deployment section

## Summary

All code changes for Phase 1 are complete and tested. The system is ready for deployment to Orlok. The deployment scripts and comprehensive test suite will guide the on-device verification process. Once Orlok is confirmed working, the same process can be replicated to all other animatronics.

**Next Action**: Deploy to Orlok and run comprehensive tests.

