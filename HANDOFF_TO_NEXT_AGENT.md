# Handoff Brief for Next Agent - Complete MonsterBox Deployment

**From**: Previous Agent (Phase 1-2 Complete)  
**To**: Next Agent (Complete Phases 3-6)  
**Date**: 2025-10-04  
**User**: Aaron (arwpc)

---

## Mission

Aaron needs to wake up to **fully working animatronics** for the kids! Complete ALL remaining tasks autonomously:
- ✅ Calibratable servos and actuators
- ✅ Talking with unique voices via ElevenLabs TTS
- ✅ Listening via microphones and STT
- ✅ Interacting via ConvAI agents with gapless streaming audio

**Work autonomously through all phases without asking for permission. Aaron trusts you!**

---

## Current Status - What's DONE ✅

### Phase 1: Orlok Bring-Up ✅ COMPLETE
- ✅ Per-character TTS configuration system implemented
- ✅ File-first ElevenLabs API key management (`/etc/monsterbox/elevenlabs.key`)
- ✅ Unique voices assigned to all 4 characters
- ✅ ConvAI agent mappings configured in `data/characters.json`
- ✅ Orlok (192.168.8.120) fully tested and working
- ✅ All code committed to git (commit `8ea38a35`) and pushed to GitHub

### Phase 2: Deploy to All Animatronics ✅ COMPLETE
- ✅ Code deployed to all 4 animatronics via rsync
- ✅ ElevenLabs API key deployed to all (`sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94` - 300k credits)
- ✅ SSH keys configured for passwordless access
- ✅ Voice config files deployed to all animatronics
- ✅ Services running on all animatronics

**⚠️ IMPORTANT**: The other 3 animatronics (PumpkinHead, Coffin Breaker, Skulltalker) need their services restarted to pick up the new voice configurations. They're currently using Orlok's voice because services haven't reloaded the configs yet.

---

## Character Configuration

### Network Map
- **Character 1**: PumpkinHead → 192.168.8.150
- **Character 2**: Coffin Breaker → 192.168.8.140
- **Character 3**: Orlok → 192.168.8.120 (Primary/Development)
- **Character 4**: Skulltalker → 192.168.8.130

### Voice Assignments
- **PumpkinHead**: Evil Witch (`5PWbsfogbLtky5sxqtBz`)
- **Coffin Breaker**: Ancient Monster (`wXvR48IpOq9HACltTmt7`)
- **Orlok**: Nosferatu (`Tj9l48J9AJbry5yCP5eW`)
- **Skulltalker**: Goblin (`Z7RrOqZFTyLpIlzCgfsp`)

### ConvAI Agent IDs
- **PumpkinHead**: `agent_0801k3f1dybkecj88sta18gwwrv5`
- **Coffin Breaker**: `agent_8401k3f1dx98e05t94yp6kz4vf8n`
- **Orlok**: `agent_0801k3f1dw7xe2g8r4jkbxk0gt2n`
- **Skulltalker**: `agent_7901k3f1dza1ee68w1257zh3s9x6`

### SSH Access (All RPis)
- **Login**: `remote`
- **Password**: `klrklr89!`
- **SSH Keys**: Deployed for passwordless access from Orlok

---

## YOUR TASKS - Complete Autonomously

### IMMEDIATE: Fix Voice Issue
**Problem**: PumpkinHead, Coffin Breaker, and Skulltalker are all using Orlok's voice instead of their assigned voices.

**Root Cause**: Services haven't been restarted since voice config files were deployed.

**Solution**: Restart MonsterBox service on each animatronic:
```bash
# Simple approach - reboot each RPi
ssh remote@192.168.8.150 sudo reboot
ssh remote@192.168.8.140 sudo reboot
ssh remote@192.168.8.130 sudo reboot

# Wait 60 seconds for reboot, then test each voice
```

**Test Commands** (after reboot):
```bash
# PumpkinHead - should hear Evil Witch voice
curl -sS -X POST http://192.168.8.150:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am PumpkinHead, guardian of the harvest","characterId":1}'

# Coffin Breaker - should hear Ancient Monster voice
curl -sS -X POST http://192.168.8.140:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am the Coffin Breaker, risen from the grave","characterId":2}'

# Skulltalker - should hear Goblin voice
curl -sS -X POST http://192.168.8.130:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Skulltalker, keeper of dark secrets","characterId":4}'
```

### Phase 3: Room-Wide Validation
**Goal**: Verify all animatronics work together and ConvAI streaming functions properly.

**Tasks**:
1. **Test TTS on all 4 animatronics** - Verify each speaks with correct unique voice
2. **Test ConvAI WebSocket streaming** - Access web UI for each:
   - http://192.168.8.150:3000/conversation (PumpkinHead)
   - http://192.168.8.140:3000/conversation (Coffin Breaker)
   - http://192.168.8.120:3000/conversation (Orlok)
   - http://192.168.8.130:3000/conversation (Skulltalker)
3. **Verify gapless audio** - ConvAI should stream without gaps using persistent mpg123
4. **Test microphone input** - Each character should listen via their assigned microphone part
5. **Cross-mic verification** - Test that each animatronic responds to its own mic, not others

**Key Files**:
- `data/character-{id}/parts.json` - Hardware configuration (speakers, mics, servos)
- `services/elevenLabsConvAIService.js` - ConvAI WebSocket streaming
- `services/audioPlaybackService.js` - Gapless audio with mpg123

### Phase 4: Goblins Video Loop
**Goal**: Deploy 5 local videos per Goblin with VLC loop on HDMI.

**Context**: There are Goblin displays (separate from the 4 main animatronics) that need video loops.

**Tasks**:
1. **Identify Goblin devices** - Find IP addresses and access
2. **Deploy video files** - 5 videos per Goblin from video library
3. **Set up VLC autostart** - Loop videos on HDMI output
4. **Test video playback** - Verify loops work on boot

**Key Files**:
- `data/video-library/` - Video files available
- Existing video system in codebase (search for "video" or "goblin")

### Phase 5: Random Poses During Conversation
**Goal**: Add pose generator triggered during TTS/ConvAI with safe amplitudes and cooldown.

**Context**: Animatronics should move naturally during conversation, not just stand still.

**Tasks**:
1. **Review existing pose system** - Check `services/poseService.js` and pose files
2. **Create random pose generator** - Generate safe, natural movements
3. **Integrate with TTS/ConvAI** - Trigger poses during speech
4. **Implement safety limits** - Safe amplitudes, cooldown between poses
5. **Test on all animatronics** - Verify movements are natural and safe

**Key Files**:
- `services/poseService.js` - Pose management
- `data/character-{id}/poses.json` - Saved poses
- `data/character-{id}/calibrations.json` - Servo calibration data

### Phase 6: Orchestration System
**Goal**: Broadcast/multicast endpoints for coordinated control of Characters + Goblins.

**Context**: Need ability to control all animatronics together, push changes, reboot, manage settings, assign characters.

**Requirements** (from Aaron):
- Broadcast/multicast endpoints
- Push changes to all animatronics
- Reboot animatronics remotely
- Manage local settings
- Assign characters
- **NO new WebSocket systems** - Use existing architecture
- **NO significant architectural changes**

**Tasks**:
1. **Design simple orchestration API** - REST endpoints for broadcast commands
2. **Implement broadcast endpoints** - `/api/orchestration/broadcast` for commands
3. **Add remote management** - Reboot, update, configure endpoints
4. **Test coordinated control** - All animatronics respond to broadcast
5. **Document orchestration API** - Clear usage guide

**Key Considerations**:
- Use SSH for remote execution (already set up)
- Use existing HTTP APIs, no new WebSockets
- Keep it simple and maintainable

---

## Important Technical Details

### ElevenLabs API
- **Key**: `sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94`
- **Location**: `/etc/monsterbox/elevenlabs.key` on all RPis
- **Credits**: 300,000 available
- **Service**: `services/elevenLabsConfigService.js` (file-first key reading)

### Audio System
- **PipeWire/PulseAudio** - All audio routing
- **Gapless Playback** - Persistent mpg123 process with stdin
- **Speaker Parts** - Hardware abstraction in `parts.json`
- **Microphone Parts** - Input devices with sensitivity/gain controls

### Hardware Parts
Each character has parts defined in `data/character-{id}/parts.json`:
- **Servos** - Jaw, head, eyes, etc.
- **Linear Actuators** - Body movements
- **Speakers** - Audio output (PipeWire sink)
- **Microphones** - Audio input (PipeWire source)
- **Sensors** - Motion detection, etc.

### Calibration System
- **Calibration files**: `data/character-{id}/calibrations.json`
- **Web UI**: `/setup-servos`, `/setup-linear-actuators`, etc.
- **Features**: Min/Center/Max positions, named positions, copy calibration

### Testing
- **Playwright e2e tests** - Run with Firefox headless on RPi4b
- **Test directory**: `/test` (never root directory)
- **Test all changes** - Aaron wants comprehensive testing

---

## Key Memories from Aaron

1. **Use ES5 syntax functions** - No arrow functions in main code
2. **No sockets for parts** - Don't use WebSockets for parts functionality
3. **MJPEG-only for webcams** - mjpg-streamer on port 8090, no WebRTC
4. **Bootstrap modals** - Use data-bs-toggle/data-bs-target, don't manually control
5. **Force-push to main** - Aaron prefers force-pushing over merging
6. **Autonomous work** - Complete all tasks without asking permission
7. **Test everything** - Write tests and run them for all changes
8. **Package managers** - Always use npm/pip/etc, never edit package files manually

---

## Documentation Available

- `DEPLOYMENT_COMPLETE.md` - Full Phase 1-2 summary
- `docs/ORLOK_DEPLOYMENT.md` - Deployment guide
- `docs/QUICK_REFERENCE.md` - Quick commands
- `docs/PHASE1_SUMMARY.md` - Phase 1 details
- `FINAL_STATUS.md` - Current status and restart instructions
- `GIT_PUSH_INSTRUCTIONS.md` - Git/GitHub setup (already done)
- `README.md` - Main project documentation

---

## Scripts Available

- `scripts/deploy-to-animatronic.sh` - Deploy code to any animatronic
- `scripts/test-all-animatronics.sh` - Test TTS on all 4
- `scripts/orlok-bringup-test.sh` - Comprehensive Orlok testing

---

## Critical Success Criteria

Aaron needs to wake up to:
1. ✅ **All 4 animatronics speaking with their unique voices**
2. ✅ **ConvAI conversations working with gapless audio**
3. ✅ **Microphones listening and responding**
4. ✅ **Natural poses during conversation**
5. ✅ **Goblin video loops running**
6. ✅ **Orchestration system for coordinated control**
7. ✅ **All hardware calibratable via web UI**
8. ✅ **Everything tested and working**

---

## Your Approach

1. **Start with the immediate voice fix** - Reboot the 3 animatronics and verify voices
2. **Work through phases sequentially** - 3, 4, 5, 6
3. **Test thoroughly at each step** - Don't move on until verified
4. **Use task management** - Track progress with task list tools
5. **Commit and push regularly** - Keep git history clean
6. **Document as you go** - Update docs with new features
7. **Work autonomously** - Aaron trusts you to make good decisions
8. **Think about the kids** - This is for Halloween, make it magical! 🎃

---

## Final Notes

- **You're on Orlok** (192.168.8.120) - Primary development machine
- **Git is set up** - SSH keys configured, can push to GitHub
- **All infrastructure ready** - SSH access, API keys, hardware installed
- **Orlok hardware is real** - You can test against actual servos, speakers, mics
- **Be bold** - Aaron wants you to complete everything autonomously

**Aaron says**: "I need to wake up to fully working Animatronics! Calibratable, Talking, listening, interacting Animatronics for the kids!"

**Make it happen!** 🎃👻🧛‍♂️💀

---

## Contact Info (Don't Use Unless Emergency)

- **User**: Aaron (arwpc)
- **GitHub**: arwpc/MonsterBox
- **Email**: arwpersonal@gmail.com

**But remember**: Work autonomously! Aaron is sleeping and trusts you to complete everything! 😴✨

