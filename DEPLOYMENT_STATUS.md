# MonsterBox Orlok Deployment - Status Report

**Date**: 2025-10-04  
**Mission**: Get Orlok speaking audibly via ElevenLabs TTS, then roll out to all animatronics  
**Status**: ✅ **Code Complete - Ready for On-Device Testing**

---

## Executive Summary

All code changes for Phase 1 (Orlok Bring-Up) have been completed and committed. The system now supports:

1. **File-First ElevenLabs API Key Management**: Reads from `/etc/monsterbox/elevenlabs.key` as source of truth
2. **Per-Character TTS Configuration**: Each character loads voice settings from `data/character-{id}/ai-config/tts-config.json`
3. **Automated Deployment**: Scripts for deploying to any animatronic and running comprehensive tests
4. **Complete Documentation**: Step-by-step guides, quick reference, and troubleshooting

**Next Step**: Deploy to Orlok (192.168.8.120) and run on-device tests.

---

## Code Changes Summary

### ✅ Core Services Modified

#### 1. ElevenLabsConfigService
**File**: `services/elevenLabsConfigService.js`  
**Change**: Modified `getElevenLabsConfig()` to prefer `/etc/monsterbox/elevenlabs.key` first, fall back to env  
**Impact**: Consistent API key management across all animatronics

#### 2. AI Config Store
**File**: `services/aiConfigStore.js`  
**Change**: Added `getTTSConfigForCharacter(characterId)` function  
**Impact**: Per-character voice configuration with global fallback

#### 3. Generate-and-Play Endpoint
**File**: `routes/api/elevenLabsApiRoutes.js`  
**Change**: Updated to use per-character TTS config, returns voiceId in response  
**Impact**: Automatic character-specific voice selection

#### 4. Character TTS Configs
**Files**: `data/character-{1,2,3,4}/ai-config/tts-config.json`  
**Change**: Fixed character 4 empty voice_id, validated all configs  
**Impact**: All characters have valid TTS configuration

---

## Deployment Tools Created

### ✅ Scripts

1. **`scripts/deploy-to-animatronic.sh`**
   - Syncs code to target animatronic
   - Preserves character-specific data
   - Checks ElevenLabs key file
   - Restarts service
   - Usage: `./scripts/deploy-to-animatronic.sh 3 192.168.8.120`

2. **`scripts/orlok-bringup-test.sh`**
   - Comprehensive 7-test suite
   - Tests key, service, audio, TTS, logs
   - Usage: `cd ~/MonsterBox && ./scripts/orlok-bringup-test.sh`

3. **`scripts/test-all-animatronics.sh`**
   - Tests all 4 animatronics sequentially
   - Reports success/failure for each
   - Usage: `./scripts/test-all-animatronics.sh`

### ✅ Documentation

1. **`docs/ORLOK_DEPLOYMENT.md`**
   - Complete step-by-step deployment guide
   - Troubleshooting decision tree
   - All 6 phases outlined

2. **`docs/QUICK_REFERENCE.md`**
   - Essential commands and endpoints
   - Quick troubleshooting fixes
   - Expected responses

3. **`docs/PHASE1_SUMMARY.md`**
   - Detailed code changes
   - On-device task checklist
   - Acceptance criteria

4. **`README.md`** (Updated)
   - Added Orlok deployment section
   - Quick start commands
   - Character network map

---

## Character Network Map

```
Character 1: PumpkinHead     → 192.168.8.150
Character 2: Coffin Breaker  → 192.168.8.140
Character 3: Orlok           → 192.168.8.120 ⭐ PRIMARY
Character 4: Skulltalker     → 192.168.8.130
```

---

## Phase 1: Orlok Bring-Up

### ✅ Completed (Code)
- [x] Fix generate-and-play to load per-character TTS config
- [x] Update ElevenLabsConfigService to prefer key file
- [x] Verify Orlok speaker part configuration (noted for on-device update)
- [x] Create per-character TTS configs for all characters

### ⏳ Remaining (On-Device)
- [ ] Test on Orlok: verify key file and HTTP status
- [ ] Test on Orlok: restart service and check logs
- [ ] Test on Orlok: validate speaker routing
- [ ] Test on Orlok: fire generate-and-play
- [ ] Test on Orlok: ConvAI WebSocket streaming

---

## Quick Start - Deploy to Orlok

### Step 1: Deploy Code
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120
```

### Step 2: SSH and Verify Key
```bash
ssh remote@192.168.8.120

# Check key file
ls -l /etc/monsterbox/elevenlabs.key
stat -c %a /etc/monsterbox/elevenlabs.key

# If not exists:
echo 'sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94' | sudo tee /etc/monsterbox/elevenlabs.key
sudo chmod 600 /etc/monsterbox/elevenlabs.key

# Test key
KEY=$(cat /etc/monsterbox/elevenlabs.key)
curl -s -o /dev/null -w "%{http_code}\n" -H "xi-api-key: $KEY" https://api.elevenlabs.io/v1/user
# Expected: 200
```

### Step 3: Run Comprehensive Test
```bash
cd ~/MonsterBox
./scripts/orlok-bringup-test.sh
```

### Step 4: Manual TTS Test (if needed)
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
  "voiceId": "Tj9l48J9AJbry5yCP5eW"
}
```

---

## Acceptance Criteria

- [ ] Orlok speaks audibly in Orlok's own voice on command
- [ ] Orlok speaks in live ConvAI mode with gapless streaming
- [ ] Correct routing to Orlok's speaker sink
- [ ] No ElevenLabs 401/403 errors
- [ ] /v1/user returns 200 using key file
- [ ] Speaker routes and volumes correct
- [ ] Code patterns ready for roll-out

---

## Phase 2-6 Overview

### Phase 2: Deploy to All Animatronics
- Deploy to Coffin Breaker (192.168.8.140)
- Deploy to Skulltalker (192.168.8.130)
- Deploy to PumpkinHead (192.168.8.150)
- Assign unique voices to each character
- Verify all respond to generate-and-play

### Phase 3: Room-Wide Validation
- Test all animatronics together
- Verify ConvAI streaming on all
- Implement cross-mic verification

### Phase 4: Goblins Video Loop
- Deploy 5 local videos per Goblin
- VLC loop on HDMI

### Phase 5: Random Poses During Conversation
- Add pose generator triggered during TTS/ConvAI
- Safe amplitudes and cooldown

### Phase 6: Orchestration System
- Broadcast/multicast endpoints
- Coordinated control of Characters + Goblins

---

## Troubleshooting Quick Reference

### 401/403 from ElevenLabs
```bash
echo 'sk_NEW_KEY' | sudo tee /etc/monsterbox/elevenlabs.key
sudo chmod 600 /etc/monsterbox/elevenlabs.key
cd ~/MonsterBox && pkill -f "node.*MonsterBox" && nohup npm start > /tmp/monsterbox.out 2>&1 &
```

### No Audio Output
```bash
# Check mpg123
mpg123 --version

# List sinks
wpctl status

# Test with known file
python3 ~/MonsterBox/python_wrappers/speaker_cli.py play \
  /usr/share/sounds/alsa/Front_Center.wav 80 --device <sink_name>
```

### Service Won't Start
```bash
# Check port
lsof -i :3000

# Check logs
tail -f /tmp/monsterbox.out

# Reinstall deps
cd ~/MonsterBox && npm install
```

---

## Files Modified/Created

### Modified
- `services/elevenLabsConfigService.js`
- `services/aiConfigStore.js`
- `routes/api/elevenLabsApiRoutes.js`
- `data/character-4/ai-config/tts-config.json`
- `README.md`

### Created
- `scripts/deploy-to-animatronic.sh`
- `scripts/orlok-bringup-test.sh`
- `scripts/test-all-animatronics.sh`
- `docs/ORLOK_DEPLOYMENT.md`
- `docs/QUICK_REFERENCE.md`
- `docs/PHASE1_SUMMARY.md`
- `DEPLOYMENT_STATUS.md` (this file)

---

## Next Actions

1. **Deploy to Orlok**: Run `./scripts/deploy-to-animatronic.sh 3 192.168.8.120`
2. **Verify Key**: SSH to Orlok and check `/etc/monsterbox/elevenlabs.key`
3. **Run Tests**: Execute `./scripts/orlok-bringup-test.sh` on Orlok
4. **Update Speaker**: Identify correct PipeWire sink and update `data/character-3/parts.json`
5. **Test TTS**: Verify audible output from generate-and-play
6. **Test ConvAI**: Verify gapless streaming via web UI

---

## Support Resources

- **Deployment Guide**: `docs/ORLOK_DEPLOYMENT.md`
- **Quick Reference**: `docs/QUICK_REFERENCE.md`
- **Phase 1 Summary**: `docs/PHASE1_SUMMARY.md`
- **Task List**: Run `view_tasklist` in agent

---

**Status**: Ready for deployment. All code changes complete. Awaiting on-device testing.

