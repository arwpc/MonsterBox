# MonsterBox 5.2 - Master Development & Test Plan
## Exhaustive Handoff for Next Agent

**Version**: MonsterBox 5.2  
**Date**: 2025-10-05  
**Status**: Phases 1-2 Complete, Phases 3-9 Ready for Execution  
**Target**: Production-ready Halloween animatronic system

---

## 🎯 Executive Summary

This document consolidates all previous task lists and deployment plans into one exhaustive, actionable plan for completing MonsterBox 5.2. The next agent should execute this plan autonomously, working through each phase sequentially with comprehensive testing at every step.

### Mission
Deploy a fully operational 5-animatronic Halloween system with:
- ✅ Unique AI personalities via ElevenLabs agents
- ✅ Natural movement during conversation
- ✅ Coordinated multi-animatronic control
- ✅ Video displays on Goblin devices
- ✅ Production-ready documentation
- ✅ Comprehensive test coverage

### Work Style
- **Autonomous**: Complete all tasks without asking permission
- **Test-Driven**: Write and run tests for every change
- **Incremental**: Commit and push after each phase
- **Documented**: Update docs as you build
- **Hardware-Aware**: Orlok has real hardware for testing

---

## 🌐 Network Configuration (Authoritative)

**Source**: `config/animatronics.json` (DO NOT hardcode IPs in code)

### Animatronics (Full MonsterBox Installation)
- **Character 1**: PumpkinHead → 192.168.8.150:3000
- **Character 2**: Coffin Breaker → 192.168.8.140:3000
- **Character 3**: Orlok → 192.168.8.120:3000 (Primary/Development)
- **Character 4**: Skulltalker → 192.168.8.130:3000
- **Character 5**: Groundbreaker → 192.168.8.200:3000

### Goblin Displays (Lightweight Video Players Only)
- **Goblin1**: Chestwound → 192.168.8.160:3001
- **Goblin2**: Goblin2 → 192.168.8.161:3001

### SSH Access (All Devices)
- **Username**: `remote`
- **Password**: `klrklr89!`
- **Sudo**: Available on all devices
- **SSH Keys**: Deployed for passwordless access from Orlok

### ElevenLabs Configuration
- **API Key**: `sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94`
- **Location**: `/etc/monsterbox/elevenlabs.key` on all RPis
- **Credits**: 300,000 available
- **Service**: `services/elevenLabsConfigService.js`

### Character-Agent Assignments
- **PumpkinHead**: `agent_0801k3f1dybkecj88sta18gwwrv5` (Evil Witch voice)
- **Coffin Breaker**: `agent_8401k3f1dx98e05t94yp6kz4vf8n` (Ancient Monster voice)
- **Orlok**: `agent_0801k3f1dw7xe2g8r4jkbxk0gt2n` (Nosferatu voice)
- **Skulltalker**: `agent_7901k3f1dza1ee68w1257zh3s9x6` (Goblin voice)
- **Groundbreaker**: TBD (assign in Phase 4)

---

## 📋 Phase Status Overview

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ COMPLETE | Orlok Bring-Up & TTS Configuration |
| Phase 2 | ✅ COMPLETE | Deploy to All Animatronics |
| Phase 3 | 🔄 IN PROGRESS | MonsterBox 5.2 Core Features |
| Phase 4 | ⏳ NOT STARTED | Room-Wide Validation & AI Integration |
| Phase 5 | ⏳ NOT STARTED | Goblin Video Deployment |
| Phase 6 | ⏳ NOT STARTED | Random Poses During Conversation |
| Phase 7 | ⏳ NOT STARTED | Orchestration System |
| Phase 8 | ⏳ NOT STARTED | Documentation Consolidation |
| Phase 9 | ⏳ NOT STARTED | Final Integration & Live Demo |

---

## 🚀 PHASE 1: Orlok Bring-Up ✅ COMPLETE

### Completed Items
- ✅ Per-character TTS configuration system
- ✅ File-first ElevenLabs API key management
- ✅ Unique voices assigned to all 4 characters
- ✅ ConvAI agent mappings in `data/characters.json`
- ✅ Orlok (192.168.8.120) fully tested and working
- ✅ Code committed (commit `8ea38a35`) and pushed to GitHub

### Key Files
- `services/elevenLabsConfigService.js` - API key management
- `services/elevenLabsTTSService.js` - TTS generation
- `data/character-{id}/ai-config/tts-config.json` - Per-character voice config

---

## 🚀 PHASE 2: Multi-Animatronic Deployment ✅ COMPLETE

### Completed Items
- ✅ Code deployed to all 4 animatronics via rsync
- ✅ ElevenLabs API key deployed to all devices
- ✅ SSH keys configured for passwordless access
- ✅ Voice config files deployed
- ✅ Services running on all animatronics

### Known Issue
⚠️ **Voice Configuration**: PumpkinHead, Coffin Breaker, and Skulltalker may be using Orlok's voice if services haven't been restarted since deployment. Fix in Phase 4.

---

## 🚀 PHASE 3: MonsterBox 5.2 Core Features 🔄 IN PROGRESS

### Objectives
Complete the core 5.2 features including BTS7960 full control, passwordless deployment, first-run experience, and character images.

### Task 3.1: BTS7960 Full Control UI
**Priority**: HIGH  
**Estimated Time**: 2 hours

**Requirements**:
1. Update Add/Edit Part forms to show BTS7960 fields when `controlBoard === 'BTS7960'`:
   - `controlBoard` (dropdown: MDD10A/BTS7960)
   - `rpwmPin` (GPIO number)
   - `lpwmPin` (GPIO number)
   - `renPin` (GPIO number)
   - `lenPin` (GPIO number)
2. For MDD10A, show:
   - `directionPin` (GPIO number)
   - `pwmPin` (GPIO number)
3. Persist all fields to `data/character-{id}/parts.json`
4. Update validation to require appropriate fields based on controlBoard

**Files to Modify**:
- `views/setup/parts/add-part-modal.ejs`
- `views/setup/parts/edit-part-modal.ejs`
- `controllers/partsController.js`
- `services/hardwareService/linearActuatorService.js`

**Testing**:
```bash
# Manual test on Orlok
# 1. Navigate to /setup/parts
# 2. Add new Linear Actuator with BTS7960
# 3. Verify all 6 fields appear and save
# 4. Edit the part and verify fields load correctly
# 5. Test jog controls work with BTS7960 settings
```

**Acceptance Criteria**:
- [ ] BTS7960 fields visible when controlBoard is BTS7960
- [ ] MDD10A fields visible when controlBoard is MDD10A
- [ ] All fields persist to parts.json correctly
- [ ] Edit form loads existing values
- [ ] Jog controls work with both control boards
- [ ] Validation prevents invalid GPIO pins

### Task 3.2: Passwordless Deploy Script
**Priority**: HIGH  
**Estimated Time**: 1 hour

**Requirements**:
1. Update `scripts/deploy-to-animatronic.sh` to use non-interactive SSH:
   - Add `-o BatchMode=yes -o StrictHostKeyChecking=accept-new`
   - Apply to both `ssh` and `rsync` commands
2. Normalize process management:
   - Use consistent grep pattern: `node.*server.js`
   - Consider migrating to systemd service
3. Improve health check:
   - Try `/health` endpoint first
   - Fallback to `/` expecting 200
4. Add `--dry-run` option for testing
5. Add `--exclude` for logs/tmp directories

**Files to Modify**:
- `scripts/deploy-to-animatronic.sh`
- `scripts/deploy-to-all.sh`

**Testing**:
```bash
# Test dry-run mode
./scripts/deploy-to-animatronic.sh 3 192.168.8.120 --dry-run

# Test actual deployment
./scripts/deploy-to-animatronic.sh 3 192.168.8.120

# Verify no password prompts
# Verify service restarts correctly
# Verify health check passes
```

**Acceptance Criteria**:
- [ ] Deploy runs without password prompts
- [ ] Dry-run mode shows what would be done
- [ ] Service restarts reliably
- [ ] Health check validates deployment
- [ ] Logs excluded from rsync
- [ ] Works on all 5 animatronics

### Task 3.3: First-Run Skull-Themed Character Selection
**Priority**: MEDIUM  
**Estimated Time**: 3 hours

**Requirements**:
1. Create `/first-run` route and view
2. Skull-themed selection page with all 5 characters
3. Redirect from `/` when no `selectedCharacter` in config
4. POST to existing character selection API
5. Persist selection to `config/app-config.json`
6. Show character images (if available) or placeholder skulls

**Files to Create**:
- `routes/firstRun.js`
- `views/first-run/index.ejs`
- `public/css/first-run.css`
- `public/js/first-run.js` (ES5 syntax)

**Files to Modify**:
- `server.js` - Add first-run route
- `routes/index.js` - Add redirect logic
- `controllers/charactersController.js` - Ensure selection API works

**Testing**:
```bash
# Playwright test
npx playwright test -c playwright.config.ts tests/playwright/first-run.spec.js --project=firefox

# Manual test
# 1. Clear selectedCharacter from config
# 2. Navigate to /
# 3. Should redirect to /first-run
# 4. Select a character
# 5. Should redirect to / with character selected
```

**Acceptance Criteria**:
- [ ] First-run page displays all 5 characters
- [ ] Skull theme is visually appealing
- [ ] Redirect works when no character selected
- [ ] Character selection persists
- [ ] After selection, redirects to home
- [ ] Playwright test passes

### Task 3.4: Character Images CRUD
**Priority**: MEDIUM  
**Estimated Time**: 4 hours

**Requirements**:
1. Store images under `data/character-{id}/images/`
2. API endpoints:
   - `GET /api/characters/:id/images` - List images
   - `POST /api/characters/:id/images` - Upload image
   - `PUT /api/characters/:id/images/:imageId/active` - Set active image
   - `DELETE /api/characters/:id/images/:imageId` - Delete image
3. UI components:
   - Round thumbnail in navbar (active image)
   - Image selector in first-run page
   - Image management in character settings
   - Large tile on home page
4. Support PNG, JPG, GIF formats
5. Resize/optimize images on upload

**Files to Create**:
- `routes/api/characterImagesRoutes.js`
- `services/characterImageService.js`
- `views/components/character-image-thumbnail.ejs`
- `views/components/character-image-manager.ejs`

**Files to Modify**:
- `server.js` - Add image routes
- `views/partials/header.ejs` - Add thumbnail
- `views/first-run/index.ejs` - Show images
- `views/index.ejs` - Add large tile

**Testing**:
```bash
# Playwright test
npx playwright test -c playwright.config.ts tests/playwright/character-images.spec.js --project=firefox

# Manual test
# 1. Upload image for Orlok
# 2. Verify thumbnail appears in navbar
# 3. Set as active image
# 4. Verify appears on home page
# 5. Delete image
# 6. Verify removed from all locations
```

**Acceptance Criteria**:
- [ ] Images upload successfully
- [ ] Images stored in correct directory
- [ ] Active image shows in navbar
- [ ] Active image shows on home page
- [ ] Can delete images
- [ ] Can set active image
- [ ] Playwright test passes

### Task 3.5: Version Branding Update
**Priority**: LOW  
**Estimated Time**: 30 minutes

**Requirements**:
1. Update all references from "MonsterBox 4.0" to "MonsterBox 5.2"
2. Update all references from "MonsterBox 5.1" to "MonsterBox 5.2"
3. Check header, footer, about page, README
4. Update `package.json` version to 5.2.0
5. Update PCA9685 service header comment

**Files to Check**:
- `views/partials/header.ejs`
- `views/partials/footer.ejs`
- `views/index.ejs`
- `package.json`
- `services/hardwareService/pca9685.js`
- `README.md`

**Testing**:
```bash
# Search for old versions
grep -r "MonsterBox 4.0" --exclude-dir=node_modules --exclude-dir=.git
grep -r "MonsterBox 5.1" --exclude-dir=node_modules --exclude-dir=.git

# Verify UI shows 5.2
# Check header, footer, about page
```

**Acceptance Criteria**:
- [ ] All UI shows "MonsterBox 5.2"
- [ ] package.json version is 5.2.0
- [ ] No references to 4.0 or 5.1 remain
- [ ] README updated

### Phase 3 Completion Criteria
- [ ] All tasks 3.1-3.5 complete
- [ ] All Playwright tests pass
- [ ] Manual testing on Orlok successful
- [ ] Code committed and pushed to GitHub
- [ ] Deploy script tested on at least 2 devices

---

## 🚀 PHASE 4: Room-Wide Validation & AI Integration ⏳ NOT STARTED

### Objectives
Verify all 5 animatronics work together with unique AI personalities, proper voice characteristics, and functional ConvAI streaming.

### Task 4.1: Restart Services on All Animatronics
**Priority**: HIGH  
**Estimated Time**: 30 minutes

**Requirements**:
1. Restart MonsterBox service on all 5 animatronics
2. Verify services start successfully
3. Check logs for errors

**Commands**:
```bash
# Reboot all animatronics (simple approach)
ssh remote@192.168.8.150 sudo reboot  # PumpkinHead
ssh remote@192.168.8.140 sudo reboot  # Coffin Breaker
ssh remote@192.168.8.130 sudo reboot  # Skulltalker
ssh remote@192.168.8.200 sudo reboot  # Groundbreaker

# Wait 60 seconds for reboot
sleep 60

# Verify services running
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  echo "Checking $ip..."
  curl -s http://$ip:3000/health || echo "FAILED: $ip"
done
```

**Acceptance Criteria**:
- [ ] All 5 animatronics respond to health check
- [ ] No errors in service logs
- [ ] Web UI accessible on all devices

### Task 4.2: Test Unique Voices on All Animatronics
**Priority**: HIGH  
**Estimated Time**: 1 hour

**Requirements**:
1. Test TTS on each animatronic
2. Verify each uses correct voice
3. Verify voice characteristics match AI agent descriptions
4. Document any voice issues

**Testing Commands**:
```bash
# PumpkinHead - Evil Witch voice
curl -sS -X POST http://192.168.8.150:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am PumpkinHead, guardian of the harvest","characterId":1}'

# Coffin Breaker - Ancient Monster voice
curl -sS -X POST http://192.168.8.140:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am the Coffin Breaker, risen from the grave","characterId":2}'

# Orlok - Nosferatu voice
curl -sS -X POST http://192.168.8.120:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Count Orlok... the ancient one... [whispers] from the shadows","characterId":3}'

# Skulltalker - Goblin voice
curl -sS -X POST http://192.168.8.130:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Skulltalker, keeper of dark secrets","characterId":4}'

# Groundbreaker - TBD voice
curl -sS -X POST http://192.168.8.200:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Groundbreaker, emerging from the earth","characterId":5}'
```

**Acceptance Criteria**:
- [ ] Each animatronic speaks with unique voice
- [ ] Voice characteristics match expectations
- [ ] Audio plays through correct speaker
- [ ] No audio glitches or gaps
- [ ] Orlok's archaic speech patterns present

### Task 4.3: Verify ConvAI WebSocket Streaming
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Access ConvAI web UI for each animatronic
2. Test microphone input and STT
3. Verify AI agent personality in responses
4. Test gapless audio streaming
5. Verify barge-in functionality

**Testing**:
```bash
# Access web UIs
# PumpkinHead: http://192.168.8.150:3000/conversation
# Coffin Breaker: http://192.168.8.140:3000/conversation
# Orlok: http://192.168.8.120:3000/conversation
# Skulltalker: http://192.168.8.130:3000/conversation
# Groundbreaker: http://192.168.8.200:3000/conversation

# For each animatronic:
# 1. Open conversation page
# 2. Grant microphone access
# 3. Speak a question
# 4. Verify STT captures correctly
# 5. Verify AI agent responds with personality
# 6. Verify audio plays without gaps
# 7. Test barge-in (interrupt during response)
```

**Key Files**:
- `services/elevenLabsAgentService.js` - AI agent integration
- `services/elevenLabsWebSocketService.js` - WebSocket streaming
- `services/serverPlaybackService.js` - Gapless audio
- `views/conversation/index.ejs` - Conversation UI

**Acceptance Criteria**:
- [ ] ConvAI WebSocket connects on all devices
- [ ] Microphone input works on all devices
- [ ] STT processes speech correctly
- [ ] AI agent personality evident in responses
- [ ] Audio streams without gaps
- [ ] Barge-in works (can interrupt)
- [ ] Each character maintains unique personality

### Task 4.4: Cross-Device Microphone Validation
**Priority**: MEDIUM
**Estimated Time**: 1 hour

**Requirements**:
1. Verify each animatronic uses its own microphone
2. Test that speaking near one doesn't trigger others
3. Verify microphone sensitivity settings
4. Test VU meters on Setup Audio page

**Testing**:
```bash
# For each animatronic:
# 1. Navigate to /setup/audio
# 2. Verify microphone part is configured
# 3. Check VU meter shows levels
# 4. Adjust sensitivity slider
# 5. Verify changes apply immediately
# 6. Test that only local mic triggers responses
```

**Acceptance Criteria**:
- [ ] Each animatronic uses correct microphone
- [ ] VU meters show real-time levels
- [ ] Sensitivity adjustments work
- [ ] No cross-talk between devices
- [ ] Microphone settings persist

### Task 4.5: Assign Groundbreaker AI Agent
**Priority**: MEDIUM
**Estimated Time**: 30 minutes

**Requirements**:
1. Create or assign ElevenLabs AI agent for Groundbreaker
2. Update `data/character-5/ai-config/tts-config.json`
3. Update `data/characters.json` with agent ID
4. Test voice and personality

**Files to Modify**:
- `data/character-5/ai-config/tts-config.json`
- `data/characters.json`

**Acceptance Criteria**:
- [ ] Groundbreaker has unique AI agent assigned
- [ ] Voice is distinct from other characters
- [ ] Personality is appropriate for character
- [ ] Agent ID documented

### Phase 4 Completion Criteria
- [ ] All tasks 4.1-4.5 complete
- [ ] All 5 animatronics speaking with unique voices
- [ ] ConvAI working on all devices
- [ ] Microphones configured and tested
- [ ] AI personalities verified
- [ ] Documentation updated

---

## 🚀 PHASE 5: Goblin Video Deployment ⏳ NOT STARTED

### Objectives
Deploy video loops to Goblin display devices for ambient Halloween atmosphere.

### Task 5.1: Verify Goblin Device Status
**Priority**: HIGH
**Estimated Time**: 30 minutes

**Requirements**:
1. Check if Goblin1 (192.168.8.160) is online
2. Check if Goblin2 (192.168.8.161) is online
3. Verify goblin-pi.js service is running
4. Test video playback API

**Testing**:
```bash
# Check Goblin1 status
curl http://192.168.8.160:3001/status | jq '.'

# Check Goblin2 status
curl http://192.168.8.161:3001/status | jq '.'

# Test video playback
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.mp4","loop":true}'
```

**Acceptance Criteria**:
- [ ] Goblin1 responds to status check
- [ ] Goblin2 responds to status check
- [ ] Video playback API works
- [ ] Can stop video playback

### Task 5.2: Select and Deploy Videos
**Priority**: MEDIUM
**Estimated Time**: 1 hour

**Requirements**:
1. Select 5 Halloween-themed videos from video library
2. Copy videos to Goblin devices at `/home/remote/goblin/media/video/`
3. Verify videos play correctly
4. Configure looping

**Video Selection Criteria**:
- Halloween-themed
- Appropriate length (2-5 minutes)
- Good quality
- Loops seamlessly

**Deployment**:
```bash
# Copy videos to Goblin1
scp video1.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/
scp video2.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/
# ... etc

# Test playback
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename":"video1.mp4","loop":true}'
```

**Acceptance Criteria**:
- [ ] 5 videos selected
- [ ] Videos copied to Goblin1
- [ ] Videos copied to Goblin2 (if online)
- [ ] Videos play correctly
- [ ] Looping works

### Task 5.3: Create Goblin Deployment Script
**Priority**: LOW
**Estimated Time**: 1 hour

**Requirements**:
1. Create `scripts/deploy-goblin-videos.sh`
2. Automate video deployment
3. Support multiple Goblin devices
4. Handle offline devices gracefully

**Files to Create**:
- `scripts/deploy-goblin-videos.sh`

**Script Features**:
- Check device availability
- Copy videos if not present
- Start video playback
- Configure looping
- Log deployment status

**Acceptance Criteria**:
- [ ] Script created and tested
- [ ] Handles offline devices
- [ ] Logs deployment status
- [ ] Can deploy to multiple Goblins
- [ ] Documentation updated

### Phase 5 Completion Criteria
- [ ] All tasks 5.1-5.3 complete
- [ ] Videos playing on Goblin1
- [ ] Videos playing on Goblin2 (if online)
- [ ] Deployment script working
- [ ] System works without Goblins (non-blocking)

---

## 🚀 PHASE 6: Random Poses During Conversation ⏳ NOT STARTED

### Objectives
Implement natural movement system that triggers during speech with safety limits and pose filtering.

### Task 6.1: Create Random Pose Service
**Priority**: HIGH
**Estimated Time**: 3 hours

**Requirements**:
1. Create `services/randomPoseService.js`
2. Implement safety limits (20-60% amplitude)
3. Implement cooldown (3 seconds default)
4. Filter poses (only subtle/moderate)
5. Scale movements toward center positions
6. Trigger logic (50% probability, text > 50 chars)

**Files to Create**:
- `services/randomPoseService.js`

**Service Features**:
```javascript
// ES5 function syntax
function RandomPoseService() {
  this.enabled = false;
  this.cooldownMs = 3000;
  this.minAmplitude = 20;
  this.maxAmplitude = 60;
  this.lastPoseTime = 0;
}

RandomPoseService.prototype.enable = function(options) {
  // Enable with options
};

RandomPoseService.prototype.disable = function() {
  // Disable system
};

RandomPoseService.prototype.shouldTrigger = function(text) {
  // Check if should trigger (cooldown, probability, text length)
};

RandomPoseService.prototype.selectPose = function(characterId) {
  // Select random pose from available poses
  // Filter for subtle/moderate only
};

RandomPoseService.prototype.scalePose = function(pose, amplitude) {
  // Scale pose movements toward center
};

RandomPoseService.prototype.triggerPose = function(characterId) {
  // Trigger random pose with safety limits
};
```

**Acceptance Criteria**:
- [ ] Service created with all methods
- [ ] Safety limits enforced
- [ ] Cooldown prevents over-movement
- [ ] Pose filtering works
- [ ] Pose scaling works
- [ ] Unit tests pass

### Task 6.2: Create Random Pose API Routes
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Create `routes/api/randomPoseRoutes.js`
2. Implement all API endpoints
3. Add validation and error handling
4. Document API in comments

**Files to Create**:
- `routes/api/randomPoseRoutes.js`

**API Endpoints**:
- `GET /api/random-poses/config` - Get current configuration
- `POST /api/random-poses/enable` - Enable with options
- `POST /api/random-poses/disable` - Disable system
- `POST /api/random-poses/trigger` - Manual trigger for testing
- `GET /api/random-poses/status` - Get enabled status

**Acceptance Criteria**:
- [ ] All endpoints implemented
- [ ] Validation works
- [ ] Error handling works
- [ ] API documented
- [ ] Postman/curl tests pass

### Task 6.3: Integrate with TTS System
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Integrate with `routes/api/elevenLabsApiRoutes.js`
2. Trigger pose before audio playback
3. Non-blocking (don't wait for pose completion)
4. Graceful failure (log but continue)
5. Respect enabled/disabled state

**Files to Modify**:
- `routes/api/elevenLabsApiRoutes.js`
- `services/elevenLabsTTSService.js`

**Integration Points**:
```javascript
// In /generate-and-play endpoint
// Before playing audio:
if (randomPoseService.shouldTrigger(text)) {
  randomPoseService.triggerPose(characterId)
    .catch(function(err) {
      console.error('Pose trigger failed:', err);
      // Continue with audio playback
    });
}
// Play audio (don't wait for pose)
```

**Acceptance Criteria**:
- [ ] Poses trigger during TTS
- [ ] Non-blocking (audio plays immediately)
- [ ] Graceful failure handling
- [ ] Respects enabled/disabled state
- [ ] Works on all animatronics

### Task 6.4: Create Random Pose UI Controls
**Priority**: MEDIUM
**Estimated Time**: 2 hours

**Requirements**:
1. Add controls to orchestration page
2. Add controls to individual character pages
3. Show current status (enabled/disabled)
4. Allow configuration of cooldown and amplitude
5. Test button for manual trigger

**Files to Modify**:
- `views/orchestration/index.ejs`
- `views/setup/poses/index.ejs`
- `public/js/orchestration.js` (ES5)
- `public/js/poses.js` (ES5)

**UI Features**:
- Enable/Disable toggle
- Cooldown slider (1-10 seconds)
- Amplitude range sliders (20-60%)
- Test button
- Status indicator

**Acceptance Criteria**:
- [ ] UI controls work
- [ ] Settings persist
- [ ] Test button triggers pose
- [ ] Status updates in real-time
- [ ] Works on all pages

### Task 6.5: Test Random Poses on All Animatronics
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Enable random poses on each animatronic
2. Test with TTS
3. Verify safety limits
4. Verify cooldown works
5. Verify movements are natural
6. Document any issues

**Testing**:
```bash
# Enable on all animatronics
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  curl -X POST http://$ip:3000/api/random-poses/enable \
    -H "Content-Type: application/json" \
    -d '{"cooldownMs":3000,"minAmplitude":20,"maxAmplitude":60}'
done

# Test with TTS
curl -X POST http://192.168.8.120:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a longer test message to trigger random poses during speech","characterId":3}'

# Observe movements
# Verify safety limits
# Verify cooldown
```

**Acceptance Criteria**:
- [ ] Random poses work on all animatronics
- [ ] Movements are safe and natural
- [ ] Cooldown prevents over-movement
- [ ] Amplitude limits respected
- [ ] Can enable/disable per character
- [ ] No interference with audio

### Phase 6 Completion Criteria
- [ ] All tasks 6.1-6.5 complete
- [ ] Random pose service working
- [ ] API endpoints functional
- [ ] TTS integration complete
- [ ] UI controls working
- [ ] Tested on all animatronics
- [ ] Documentation updated

---

## 🚀 PHASE 7: Orchestration System ⏳ NOT STARTED

### Objectives
Create centralized control system for all animatronics with broadcast/multicast commands and web UI.

### Task 7.1: Create Orchestration Service
**Priority**: HIGH
**Estimated Time**: 4 hours

**Requirements**:
1. Create `services/orchestrationService.js`
2. Implement network map from `config/animatronics.json`
3. Implement SSH-based command execution
4. Implement HTTP-based API calls
5. Handle offline devices gracefully
6. Log all commands and responses

**Files to Create**:
- `services/orchestrationService.js`

**Service Features**:
```javascript
// ES5 function syntax
function OrchestrationService() {
  this.devices = []; // Load from config/animatronics.json
}

OrchestrationService.prototype.getStatus = function() {
  // Get status of all devices
  // Return: { device, online, health, lastSeen }
};

OrchestrationService.prototype.broadcast = function(command, params) {
  // Send command to all animatronics
  // Commands: reboot, restart-service, say, enable-poses, etc.
};

OrchestrationService.prototype.executeCommand = function(device, command, params) {
  // Execute command on specific device
  // Use SSH or HTTP based on command type
};

OrchestrationService.prototype.sayAll = function(text) {
  // Make all animatronics speak (each with their AI agent)
};
```

**Supported Commands**:
- `reboot` - Reboot device
- `restart-service` - Restart MonsterBox service
- `health-check` - Verify service responding
- `say` - Make animatronic speak
- `enable-random-poses` - Enable movement
- `disable-random-poses` - Disable movement
- `update-config` - Update configuration
- `deploy-code` - Deploy code updates

**Acceptance Criteria**:
- [ ] Service created with all methods
- [ ] Loads devices from config
- [ ] SSH commands work
- [ ] HTTP commands work
- [ ] Handles offline devices
- [ ] Logs all actions
- [ ] Unit tests pass

### Task 7.2: Create Orchestration API Routes
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Create `routes/api/orchestrationRoutes.js`
2. Implement all API endpoints
3. Add validation and error handling
4. Document API

**Files to Create**:
- `routes/api/orchestrationRoutes.js`

**API Endpoints**:
- `GET /api/orchestration/status` - Get status of all devices
- `POST /api/orchestration/broadcast` - Send command to all
- `POST /api/orchestration/say-all` - Make all speak
- `POST /api/orchestration/enable-random-poses` - Enable poses on all
- `POST /api/orchestration/disable-random-poses` - Disable poses on all
- `POST /api/orchestration/restart-services` - Restart all services
- `POST /api/orchestration/device/:id/command` - Send command to specific device

**Acceptance Criteria**:
- [ ] All endpoints implemented
- [ ] Validation works
- [ ] Error handling works
- [ ] API documented
- [ ] Postman/curl tests pass

### Task 7.3: Create Orchestration Web UI
**Priority**: HIGH
**Estimated Time**: 4 hours

**Requirements**:
1. Create `views/orchestration/index.ejs`
2. Create `public/js/orchestration.js` (ES5)
3. Create `public/css/orchestration.css`
4. Implement real-time status dashboard
5. Implement broadcast controls
6. Implement command log

**Files to Create**:
- `views/orchestration/index.ejs`
- `public/js/orchestration.js` (ES5 syntax)
- `public/css/orchestration.css`
- `routes/orchestration.js`

**UI Features**:
1. **System Status Dashboard**:
   - Card for each animatronic
   - Online/offline indicator
   - Last seen timestamp
   - Health status
   - Quick actions (reboot, restart)

2. **Broadcast Speech**:
   - Text input for message
   - Send to all button
   - Each uses their AI agent personality

3. **Random Pose Control**:
   - Enable/disable all button
   - Cooldown slider
   - Amplitude range sliders

4. **System Commands**:
   - Restart all services
   - Health check all
   - Deploy code to all

5. **Command Log**:
   - Live log of all actions
   - Timestamps
   - Success/failure indicators
   - Auto-scroll

6. **Auto-refresh**:
   - Status updates every 30 seconds
   - Manual refresh button

**Acceptance Criteria**:
- [ ] UI displays all animatronics
- [ ] Status updates work
- [ ] Broadcast speech works
- [ ] Each maintains unique personality
- [ ] Random pose controls work
- [ ] System commands work
- [ ] Command log updates
- [ ] Auto-refresh works
- [ ] UI is responsive

### Task 7.4: Test Orchestration System
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Test status endpoint
2. Test broadcast commands
3. Test say-all with AI agents
4. Test random pose controls
5. Test system commands
6. Verify each character maintains personality

**Testing**:
```bash
# Test status
curl http://192.168.8.120:3000/api/orchestration/status | jq '.'

# Test say-all (each uses their AI agent)
curl -X POST http://192.168.8.120:3000/api/orchestration/say-all \
  -H "Content-Type: application/json" \
  -d '{"text":"Happy Halloween!"}'

# Test enable random poses
curl -X POST http://192.168.8.120:3000/api/orchestration/enable-random-poses \
  -H "Content-Type: application/json" \
  -d '{"cooldownMs":3000}'

# Test restart services
curl -X POST http://192.168.8.120:3000/api/orchestration/restart-services

# Access UI
# http://192.168.8.120:3000/orchestration
```

**Acceptance Criteria**:
- [ ] Status endpoint returns all devices
- [ ] Broadcast commands work
- [ ] Say-all uses each AI agent
- [ ] Random pose controls work
- [ ] System commands execute
- [ ] UI is functional and intuitive
- [ ] Each character maintains personality

### Task 7.5: Create Orchestration Documentation
**Priority**: MEDIUM
**Estimated Time**: 1 hour

**Requirements**:
1. Document all API endpoints
2. Document UI features
3. Provide usage examples
4. Document troubleshooting

**Files to Create**:
- `docs/ORCHESTRATION_SYSTEM.md`

**Documentation Sections**:
- Overview
- API Reference
- UI Guide
- Usage Examples
- Troubleshooting
- Safety Considerations

**Acceptance Criteria**:
- [ ] Documentation complete
- [ ] All endpoints documented
- [ ] Examples provided
- [ ] Troubleshooting guide included

### Phase 7 Completion Criteria
- [ ] All tasks 7.1-7.5 complete
- [ ] Orchestration service working
- [ ] API endpoints functional
- [ ] Web UI accessible and functional
- [ ] Broadcast commands work
- [ ] Each character maintains personality
- [ ] Documentation complete
- [ ] Tested on all animatronics

---

## 🚀 PHASE 8: Documentation Consolidation ⏳ NOT STARTED

### Objectives
Review ALL existing .MD files, consolidate information into proper structure, archive old files, and create production-ready documentation for MonsterBox 5.2.

### Task 8.1: Audit All Markdown Files
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Find all .MD files in repository
2. Categorize by topic:
   - Setup/Installation
   - API Documentation
   - Hardware Integration
   - Testing
   - Deployment
   - Development
   - Troubleshooting
   - Release Notes
   - Obsolete/Duplicate
3. Create inventory spreadsheet or document
4. Identify duplicates and conflicts

**Commands**:
```bash
# Find all markdown files
find . -name "*.md" -o -name "*.MD" | grep -v node_modules | grep -v .git | sort

# Count by directory
find . -name "*.md" -o -name "*.MD" | grep -v node_modules | grep -v .git | cut -d/ -f2 | sort | uniq -c

# List root-level MD files
ls -1 *.md *.MD 2>/dev/null
```

**Deliverable**:
Create `DOCUMENTATION_AUDIT.md` with:
- Complete list of all .MD files
- Categorization by topic
- Duplicate identification
- Consolidation plan

**Acceptance Criteria**:
- [ ] All .MD files identified
- [ ] Categorized by topic
- [ ] Duplicates identified
- [ ] Audit document created

### Task 8.2: Design New Documentation Structure
**Priority**: HIGH
**Estimated Time**: 1 hour

**Requirements**:
1. Design clean, logical structure for /docs
2. Follow industry best practices
3. Support both new users and developers
4. Include clear navigation

**Proposed Structure**:
```
/docs/
├── README.md (Overview and navigation)
├── getting-started/
│   ├── installation.md
│   ├── first-run.md
│   ├── quick-start.md
│   └── network-setup.md
├── setup/
│   ├── animatronic-setup.md
│   ├── hardware-configuration.md
│   ├── audio-setup.md
│   ├── webcam-setup.md
│   └── ssh-setup.md
├── api/
│   ├── overview.md
│   ├── characters.md
│   ├── parts.md
│   ├── poses.md
│   ├── scenes.md
│   ├── audio.md
│   ├── elevenlabs.md
│   ├── orchestration.md
│   └── random-poses.md
├── hardware/
│   ├── overview.md
│   ├── servos.md
│   ├── linear-actuators.md
│   ├── sensors.md
│   ├── motors.md
│   ├── leds.md
│   ├── gpio-assignments.md
│   └── wiring-diagrams.md
├── features/
│   ├── characters.md
│   ├── poses-and-scenes.md
│   ├── conversation-mode.md
│   ├── random-poses.md
│   ├── orchestration.md
│   └── goblin-displays.md
├── testing/
│   ├── overview.md
│   ├── unit-tests.md
│   ├── integration-tests.md
│   ├── e2e-tests.md
│   └── hardware-tests.md
├── deployment/
│   ├── deployment-guide.md
│   ├── multi-device-deployment.md
│   ├── rollback-procedures.md
│   └── troubleshooting.md
├── development/
│   ├── architecture.md
│   ├── coding-standards.md
│   ├── contributing.md
│   └── release-process.md
└── troubleshooting/
    ├── common-issues.md
    ├── audio-issues.md
    ├── network-issues.md
    ├── hardware-issues.md
    └── faq.md
```

**Acceptance Criteria**:
- [ ] Structure designed
- [ ] Logical organization
- [ ] Clear navigation
- [ ] Supports all user types

### Task 8.3: Consolidate and Rewrite Documentation
**Priority**: HIGH
**Estimated Time**: 6 hours

**Requirements**:
1. Extract relevant information from old docs
2. Rewrite for clarity and accuracy
3. Update for MonsterBox 5.2
4. Remove obsolete information
5. Add missing information
6. Ensure consistency

**Process for Each Document**:
1. Read all related old docs
2. Extract key information
3. Verify accuracy against current code
4. Rewrite in clear, concise language
5. Add examples and screenshots
6. Cross-reference related docs
7. Review and edit

**Key Documents to Create**:
1. **README.md** (root) - Overview, quick start, links
2. **docs/README.md** - Documentation navigation
3. **docs/getting-started/installation.md** - Complete installation guide
4. **docs/setup/animatronic-setup.md** - Per-device setup
5. **docs/api/overview.md** - Complete API reference
6. **docs/hardware/overview.md** - Hardware integration guide
7. **docs/features/orchestration.md** - Orchestration system guide
8. **docs/deployment/deployment-guide.md** - Deployment procedures
9. **docs/troubleshooting/common-issues.md** - Troubleshooting guide

**Acceptance Criteria**:
- [ ] All key documents created
- [ ] Information accurate for 5.2
- [ ] Clear and concise writing
- [ ] Examples included
- [ ] Cross-references work
- [ ] No obsolete information

### Task 8.4: Archive Old Documentation
**Priority**: MEDIUM
**Estimated Time**: 1 hour

**Requirements**:
1. Create `/ARCHIVE/docs/` directory
2. Move all old .MD files from root to archive
3. Move old docs from /docs to archive
4. Keep only README.MD in root
5. Keep only new consolidated docs in /docs
6. Create archive index

**Files to Archive** (examples):
- DEPLOYMENT_COMPLETE.md
- DEPLOYMENT_STATUS.md
- DEPLOYMENT_SUMMARY.md
- FINAL_DEPLOYMENT_STATUS.md
- FINAL_STATUS.md
- GIT_PUSH_INSTRUCTIONS.md
- GOBLIN_VALIDATION_REPORT.md
- HALLOWEEN_DEPLOYMENT_COMPLETE.md
- HANDOFF_TO_NEXT_AGENT.md
- HANDOVER.md
- MEDIA_CONSOLIDATION_REPORT.md
- NEXT_AGENT_PROMPT.md
- ORLOK_ACTUATOR_SETUP_COMPLETE.md
- PURE-MJPG-STREAMER-INTEGRATION.md
- SECURITY_COMPLETION_REPORT.md
- SECURITY_FIXES_2025-09-29.md
- ConversationDesign.MD
- All old docs in /docs that are superseded

**Process**:
```bash
# Create archive directory
mkdir -p ARCHIVE/docs

# Move root-level MD files (except README.md and MONSTERBOX_5.2_MASTER_PLAN.md)
mv DEPLOYMENT*.md ARCHIVE/docs/
mv FINAL*.md ARCHIVE/docs/
mv HANDOFF*.md ARCHIVE/docs/
# ... etc

# Move old docs from /docs
mv docs/PHASE1_SUMMARY.md ARCHIVE/docs/
mv docs/TASK4-COMPLETION-SUMMARY.md ARCHIVE/docs/
# ... etc

# Create archive index
cat > ARCHIVE/docs/README.md << 'EOF'
# Archived Documentation

This directory contains historical documentation from previous versions
and development phases of MonsterBox. These files are kept for reference
but may contain outdated information.

For current documentation, see /docs/

## Archive Contents
- Deployment reports and status files
- Phase completion summaries
- Historical handoff documents
- Old API documentation
- Superseded guides

Last updated: 2025-10-05
EOF
```

**Acceptance Criteria**:
- [ ] Archive directory created
- [ ] Old files moved to archive
- [ ] Only README.MD in root
- [ ] Only new docs in /docs
- [ ] Archive index created

### Task 8.5: Update README.md
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Update root README.md for MonsterBox 5.2
2. Clear, concise overview
3. Quick start guide
4. Links to detailed documentation
5. Network map
6. Key features
7. Installation instructions
8. Troubleshooting quick links

**README.md Sections**:
1. **Title and Overview**
2. **Key Features**
3. **Quick Start**
4. **Network Configuration**
5. **Installation**
6. **Documentation Links**
7. **Testing**
8. **Deployment**
9. **Troubleshooting**
10. **Contributing**
11. **License**

**Acceptance Criteria**:
- [ ] README.md updated
- [ ] Accurate for 5.2
- [ ] Clear and concise
- [ ] All links work
- [ ] Quick start is helpful
- [ ] Professional appearance

### Task 8.6: Create Documentation Navigation
**Priority**: MEDIUM
**Estimated Time**: 1 hour

**Requirements**:
1. Create docs/README.md with navigation
2. Add navigation to each doc
3. Ensure all cross-references work
4. Add breadcrumbs where appropriate

**docs/README.md Structure**:
```markdown
# MonsterBox 5.2 Documentation

## Getting Started
- [Installation Guide](getting-started/installation.md)
- [First Run](getting-started/first-run.md)
- [Quick Start](getting-started/quick-start.md)
- [Network Setup](getting-started/network-setup.md)

## Setup Guides
- [Animatronic Setup](setup/animatronic-setup.md)
- [Hardware Configuration](setup/hardware-configuration.md)
- [Audio Setup](setup/audio-setup.md)
- [Webcam Setup](setup/webcam-setup.md)
- [SSH Setup](setup/ssh-setup.md)

## API Reference
- [API Overview](api/overview.md)
- [Characters API](api/characters.md)
- [Parts API](api/parts.md)
- [Poses API](api/poses.md)
- [Scenes API](api/scenes.md)
- [Audio API](api/audio.md)
- [ElevenLabs API](api/elevenlabs.md)
- [Orchestration API](api/orchestration.md)
- [Random Poses API](api/random-poses.md)

## Hardware Integration
- [Hardware Overview](hardware/overview.md)
- [Servos](hardware/servos.md)
- [Linear Actuators](hardware/linear-actuators.md)
- [Sensors](hardware/sensors.md)
- [Motors](hardware/motors.md)
- [LEDs](hardware/leds.md)
- [GPIO Assignments](hardware/gpio-assignments.md)
- [Wiring Diagrams](hardware/wiring-diagrams.md)

## Features
- [Characters](features/characters.md)
- [Poses and Scenes](features/poses-and-scenes.md)
- [Conversation Mode](features/conversation-mode.md)
- [Random Poses](features/random-poses.md)
- [Orchestration](features/orchestration.md)
- [Goblin Displays](features/goblin-displays.md)

## Testing
- [Testing Overview](testing/overview.md)
- [Unit Tests](testing/unit-tests.md)
- [Integration Tests](testing/integration-tests.md)
- [E2E Tests](testing/e2e-tests.md)
- [Hardware Tests](testing/hardware-tests.md)

## Deployment
- [Deployment Guide](deployment/deployment-guide.md)
- [Multi-Device Deployment](deployment/multi-device-deployment.md)
- [Rollback Procedures](deployment/rollback-procedures.md)
- [Troubleshooting](deployment/troubleshooting.md)

## Development
- [Architecture](development/architecture.md)
- [Coding Standards](development/coding-standards.md)
- [Contributing](development/contributing.md)
- [Release Process](development/release-process.md)

## Troubleshooting
- [Common Issues](troubleshooting/common-issues.md)
- [Audio Issues](troubleshooting/audio-issues.md)
- [Network Issues](troubleshooting/network-issues.md)
- [Hardware Issues](troubleshooting/hardware-issues.md)
- [FAQ](troubleshooting/faq.md)
```

**Acceptance Criteria**:
- [ ] Navigation document created
- [ ] All links work
- [ ] Easy to navigate
- [ ] Comprehensive coverage

### Phase 8 Completion Criteria
- [ ] All tasks 8.1-8.6 complete
- [ ] All .MD files audited
- [ ] New documentation structure created
- [ ] All key documents written
- [ ] Old files archived
- [ ] README.md updated
- [ ] Navigation working
- [ ] Documentation accurate for 5.2
- [ ] Professional and production-ready

---

## 🚀 PHASE 9: Final Integration & Live Demo ⏳ NOT STARTED

### Objectives
Bring all systems together for a comprehensive live demonstration with all 5 animatronics in Conversation mode talking to each other and 5 videos playing on Goblin1.

### Task 9.1: Configure Multi-Character Conversation
**Priority**: HIGH
**Estimated Time**: 3 hours

**Requirements**:
1. Configure all 5 animatronics for Conversation mode
2. Set up inter-animatronic communication
3. Configure conversation routing
4. Test multi-character conversations
5. Ensure each maintains unique personality

**Configuration Steps**:
1. **Enable Conversation Mode on All Devices**:
   ```bash
   # For each animatronic, ensure conversation service is running
   for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
     ssh remote@$ip "cd ~/MonsterBox && pm2 restart conversation-service || pm2 start services/conversationService.js --name conversation-service"
   done
   ```

2. **Configure Conversation Routing**:
   - Update `services/conversationService.js` to support multi-character mode
   - Implement round-robin or intelligent routing
   - Ensure each character uses their AI agent

3. **Test Inter-Character Communication**:
   - Start conversation on one character
   - Verify response triggers on another character
   - Verify each maintains unique personality
   - Test conversation flow

**Files to Modify**:
- `services/conversationService.js`
- `config/conversation-config.json` (create if needed)

**Acceptance Criteria**:
- [ ] All 5 animatronics in Conversation mode
- [ ] Inter-character communication works
- [ ] Each maintains unique personality
- [ ] Conversation flows naturally
- [ ] No cross-talk or conflicts

### Task 9.2: Deploy and Configure Goblin1 Videos
**Priority**: HIGH
**Estimated Time**: 1 hour

**Requirements**:
1. Select 5 Halloween-themed videos
2. Deploy to Goblin1 (192.168.8.160)
3. Configure playlist for continuous loop
4. Start video playback
5. Verify videos loop seamlessly

**Video Selection**:
Choose 5 videos from video library that:
- Are Halloween-themed
- Loop seamlessly
- Are 2-5 minutes each
- Have good visual quality
- Create appropriate atmosphere

**Deployment**:
```bash
# Copy videos to Goblin1
scp video1.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/halloween/
scp video2.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/halloween/
scp video3.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/halloween/
scp video4.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/halloween/
scp video5.mp4 remote@192.168.8.160:/home/remote/goblin/media/video/halloween/

# Create playlist
cat > /tmp/playlist.json << 'EOF'
{
  "videos": [
    "halloween/video1.mp4",
    "halloween/video2.mp4",
    "halloween/video3.mp4",
    "halloween/video4.mp4",
    "halloween/video5.mp4"
  ],
  "loop": true,
  "shuffle": false
}
EOF

scp /tmp/playlist.json remote@192.168.8.160:/home/remote/goblin/config/

# Start playlist
curl -X POST http://192.168.8.160:3001/play-playlist \
  -H "Content-Type: application/json" \
  -d @/tmp/playlist.json
```

**Acceptance Criteria**:
- [ ] 5 videos selected
- [ ] Videos deployed to Goblin1
- [ ] Playlist configured
- [ ] Videos playing in loop
- [ ] Seamless transitions
- [ ] Good visual quality

### Task 9.3: Enable Random Poses on All Animatronics
**Priority**: HIGH
**Estimated Time**: 30 minutes

**Requirements**:
1. Enable random poses on all 5 animatronics
2. Configure appropriate settings
3. Verify poses trigger during conversation
4. Verify safety limits

**Configuration**:
```bash
# Enable random poses on all animatronics
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  echo "Enabling random poses on $ip..."
  curl -X POST http://$ip:3000/api/random-poses/enable \
    -H "Content-Type: application/json" \
    -d '{
      "cooldownMs": 3000,
      "minAmplitude": 20,
      "maxAmplitude": 60,
      "probability": 0.5
    }'
done

# Verify status
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  echo "Status for $ip:"
  curl -s http://$ip:3000/api/random-poses/status | jq '.'
done
```

**Acceptance Criteria**:
- [ ] Random poses enabled on all 5
- [ ] Settings configured appropriately
- [ ] Poses trigger during conversation
- [ ] Safety limits respected
- [ ] Movements are natural

### Task 9.4: Comprehensive System Test
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Start all systems
2. Initiate multi-character conversation
3. Verify all animatronics participate
4. Verify random poses trigger
5. Verify Goblin1 videos playing
6. Monitor for 30+ minutes
7. Document any issues

**Test Procedure**:
1. **Pre-Test Checklist**:
   - [ ] All 5 animatronics online
   - [ ] All services running
   - [ ] Goblin1 online and playing videos
   - [ ] Random poses enabled
   - [ ] Microphones configured
   - [ ] Speakers configured

2. **Start Conversation**:
   ```bash
   # Use orchestration to start conversation
   curl -X POST http://192.168.8.120:3000/api/orchestration/say-all \
     -H "Content-Type: application/json" \
     -d '{"text":"Welcome to our Halloween gathering! Let us introduce ourselves."}'
   ```

3. **Monitor Systems**:
   - Watch all animatronics
   - Listen for unique voices
   - Observe random poses
   - Check Goblin1 videos
   - Monitor logs for errors

4. **Test Scenarios**:
   - Multi-character conversation (5+ exchanges)
   - Individual character questions
   - Simultaneous speech (orchestration)
   - Barge-in (interrupt during speech)
   - Long conversation (10+ minutes)

5. **Performance Metrics**:
   - Response latency
   - Audio quality
   - Pose smoothness
   - Video playback stability
   - System resource usage

**Acceptance Criteria**:
- [ ] All 5 animatronics participate
- [ ] Each maintains unique personality
- [ ] Random poses trigger appropriately
- [ ] Goblin1 videos play continuously
- [ ] No system crashes or errors
- [ ] Stable for 30+ minutes
- [ ] Performance is acceptable

### Task 9.5: Create Demo Script
**Priority**: MEDIUM
**Estimated Time**: 1 hour

**Requirements**:
1. Create script for demonstrating system
2. Include conversation starters
3. Include orchestration commands
4. Include troubleshooting steps
5. Document expected behavior

**Files to Create**:
- `scripts/demo-halloween-system.sh`
- `docs/DEMO_GUIDE.md`

**Demo Script Features**:
```bash
#!/bin/bash
# MonsterBox 5.2 Halloween Demo Script

echo "🎃 MonsterBox 5.2 Halloween Demo 🎃"
echo "===================================="
echo ""

# Check system status
echo "1. Checking system status..."
curl -s http://192.168.8.120:3000/api/orchestration/status | jq '.'

# Start Goblin videos
echo ""
echo "2. Starting Goblin1 videos..."
curl -X POST http://192.168.8.160:3001/play-playlist \
  -H "Content-Type: application/json" \
  -d '{"videos":["halloween/video1.mp4","halloween/video2.mp4","halloween/video3.mp4","halloween/video4.mp4","halloween/video5.mp4"],"loop":true}'

# Enable random poses
echo ""
echo "3. Enabling random poses on all animatronics..."
curl -X POST http://192.168.8.120:3000/api/orchestration/enable-random-poses \
  -H "Content-Type: application/json" \
  -d '{"cooldownMs":3000,"minAmplitude":20,"maxAmplitude":60}'

# Start conversation
echo ""
echo "4. Starting Halloween conversation..."
curl -X POST http://192.168.8.120:3000/api/orchestration/say-all \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome to our Halloween gathering!"}'

echo ""
echo "✅ Demo started! Visit http://192.168.8.120:3000/orchestration to monitor."
```

**Acceptance Criteria**:
- [ ] Demo script created
- [ ] Demo guide written
- [ ] Script works reliably
- [ ] Guide is clear and helpful
- [ ] Troubleshooting included

### Task 9.6: Final Documentation and Handoff
**Priority**: HIGH
**Estimated Time**: 2 hours

**Requirements**:
1. Update all documentation with final state
2. Create deployment summary
3. Document known issues
4. Create maintenance guide
5. Prepare handoff document

**Files to Create/Update**:
- `DEPLOYMENT_SUMMARY_5.2.md`
- `docs/MAINTENANCE_GUIDE.md`
- `docs/KNOWN_ISSUES.md`
- `HANDOFF_COMPLETE.md`

**Deployment Summary Contents**:
- What was completed
- System architecture
- Network configuration
- Key features
- Testing results
- Performance metrics
- Known issues
- Future enhancements

**Maintenance Guide Contents**:
- Daily checks
- Weekly maintenance
- Monthly maintenance
- Troubleshooting procedures
- Backup procedures
- Update procedures
- Emergency procedures

**Acceptance Criteria**:
- [ ] All documentation updated
- [ ] Deployment summary complete
- [ ] Maintenance guide created
- [ ] Known issues documented
- [ ] Handoff document ready

### Phase 9 Completion Criteria
- [ ] All tasks 9.1-9.6 complete
- [ ] All 5 animatronics in Conversation mode
- [ ] Inter-character conversations working
- [ ] 5 videos playing on Goblin1
- [ ] Random poses enabled and working
- [ ] System stable for 30+ minutes
- [ ] Demo script working
- [ ] All documentation complete
- [ ] Ready for production use

---

## 🧪 Testing Strategy

### Unit Tests
**Location**: `test/*.test.js`
**Framework**: Mocha + Chai
**Run**: `npm run test:unit`

**Coverage Areas**:
- Services (all business logic)
- Controllers (request handling)
- Utilities (helper functions)
- Data validation
- Error handling

**Requirements**:
- 80%+ code coverage
- All critical paths tested
- Edge cases covered
- Mocks for external dependencies

### Integration Tests
**Location**: `test/*.test.js`
**Framework**: Mocha + Chai
**Run**: `npm run test:integration`

**Coverage Areas**:
- API endpoints
- Database operations
- File system operations
- Service interactions
- Hardware abstraction layer

**Requirements**:
- All API endpoints tested
- Success and error cases
- Authentication/authorization
- Data persistence

### End-to-End Tests
**Location**: `tests/playwright/*.spec.js`
**Framework**: Playwright
**Run**: `npm run test:e2e`

**Coverage Areas**:
- Complete user workflows
- Multi-page interactions
- Form submissions
- Navigation
- Character selection
- Part management
- Calibration workflows

**Requirements**:
- All critical user paths tested
- Cross-browser compatibility (Firefox)
- Headless mode for CI
- Screenshots on failure

### Hardware Tests
**Location**: `test/hardware/*.test.js`
**Framework**: Mocha + Chai
**Run**: `npm run test:hardware` (on device only)

**Coverage Areas**:
- Servo control
- Linear actuator control
- Sensor reading
- Motor control
- LED control
- Audio input/output
- Webcam streaming

**Requirements**:
- Only run on devices with hardware
- Safe test parameters
- Cleanup after tests
- Hardware state verification

### Performance Tests
**Location**: `test/performance/*.test.js`
**Framework**: Custom
**Run**: `npm run test:performance`

**Coverage Areas**:
- API response times
- Audio latency
- Pose execution time
- Memory usage
- CPU usage
- Network bandwidth

**Requirements**:
- Baseline metrics established
- Regression detection
- Load testing
- Stress testing

### Test Execution Order
1. **Unit Tests** - Fast, no dependencies
2. **Integration Tests** - Moderate speed, database required
3. **E2E Tests** - Slower, full system required
4. **Hardware Tests** - Only on devices with hardware
5. **Performance Tests** - After all functional tests pass

### Continuous Integration
**Platform**: GitHub Actions (future)
**Triggers**: Push to main, Pull requests
**Steps**:
1. Install dependencies
2. Run linting
3. Run unit tests
4. Run integration tests
5. Run E2E tests (headless)
6. Generate coverage report
7. Deploy to staging (if all pass)

---

## 🚀 Deployment Procedures

### Pre-Deployment Checklist
- [ ] All tests passing locally
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Version number updated
- [ ] Changelog updated
- [ ] Backup of current system
- [ ] Rollback plan ready

### Deployment to Single Device
```bash
# Use deployment script
./scripts/deploy-to-animatronic.sh <character_id> <ip_address>

# Example: Deploy to Orlok
./scripts/deploy-to-animatronic.sh 3 192.168.8.120

# Verify deployment
curl http://192.168.8.120:3000/health
```

### Deployment to All Devices
```bash
# Use multi-device deployment script
./scripts/deploy-to-all.sh

# Or use orchestration
curl -X POST http://192.168.8.120:3000/api/orchestration/deploy-code

# Verify all devices
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  echo "Checking $ip..."
  curl -s http://$ip:3000/health || echo "FAILED: $ip"
done
```

### Post-Deployment Verification
1. **Health Checks**: All devices respond to `/health`
2. **Service Status**: All services running
3. **Log Review**: No critical errors
4. **Smoke Tests**: Basic functionality works
5. **Performance**: Response times acceptable

### Rollback Procedure
```bash
# On each device
ssh remote@<device_ip>
cd ~/MonsterBox
git log -1 --pretty=%H  # Note current commit
git checkout <previous_commit>
pm2 restart all
# Or: sudo systemctl restart monsterbox

# Verify rollback
curl http://<device_ip>:3000/health
```

---

## 🔧 Critical Technical Constraints

### Code Style
- **Server Code**: ES6+ modules OK
- **Client Code**: ES5 function syntax ONLY (no arrow functions)
- **Consistency**: Follow existing patterns
- **Comments**: Document complex logic

### Hardware Integration
- **No Sockets for Parts**: Use HTTP/Python wrappers only
- **MJPEG Only**: No WebRTC or WebSocket for webcams
- **PipeWire Audio**: Use default/pulse/sysdefault devices
- **GPIO Safety**: Always validate pin assignments

### Bootstrap Modals
- **Trigger**: Use `data-bs-toggle` and `data-bs-target`
- **No Manual Control**: Don't use JS to show/hide
- **No Z-Index**: Don't manually control z-index
- **No Nesting**: Don't nest modals inside modals

### Audio System
- **PipeWire/WirePlumber**: All audio routing
- **Device Selection**: Hardware devices, not abstract sinks
- **VU Meters**: Above test buttons for real-time levels
- **Auto-Play**: TTS should auto-play without user intervention
- **Character Speaker**: Use speaker assigned to Character

### ElevenLabs Integration
- **API Key**: Stored in `/etc/monsterbox/elevenlabs.key`
- **AI Agents**: Always use full agent, not just voice_id
- **Voice Tuning**: Comes from agent description
- **Personality**: Maintained in agent configuration
- **Credits**: Monitor usage (300k available)

### Network Configuration
- **Authoritative Source**: `config/animatronics.json`
- **No Hardcoded IPs**: Always read from config
- **SSH Access**: Passwordless with keys
- **Port 3000**: MonsterBox on all animatronics
- **Port 3001**: Goblin displays
- **Port 8090**: MJPEG streamer

### Version Control
- **Force Push**: Preferred over merging
- **Commit Often**: After each phase
- **Clear Messages**: Describe what and why
- **Push Regularly**: Keep GitHub up to date

### Package Management
- **Use Package Managers**: npm, pip, etc.
- **Never Edit Manually**: Don't edit package.json, requirements.txt
- **Install Properly**: Use `npm install`, `pip install`
- **Lock Files**: Commit package-lock.json

---

## 📚 Quick Reference Commands

### System Status
```bash
# Check all animatronics
curl http://192.168.8.120:3000/api/orchestration/status | jq '.'

# Check individual device
curl http://192.168.8.120:3000/health

# Check Goblin1
curl http://192.168.8.160:3001/status | jq '.'
```

### Testing
```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run specific test
npx mocha test/specific-test.test.js

# Run Playwright test
npx playwright test -c playwright.config.ts tests/playwright/test.spec.js --project=firefox
```

### Deployment
```bash
# Deploy to single device
./scripts/deploy-to-animatronic.sh 3 192.168.8.120

# Deploy to all devices
./scripts/deploy-to-all.sh

# Restart service on device
ssh remote@192.168.8.120 "cd ~/MonsterBox && pm2 restart all"
```

### Voice Testing
```bash
# Test voice on Orlok
curl -X POST http://192.168.8.120:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Testing Orlok voice","characterId":3}'

# Test all voices
./scripts/test-all-voices.sh
```

### Orchestration
```bash
# Make all speak
curl -X POST http://192.168.8.120:3000/api/orchestration/say-all \
  -H "Content-Type: application/json" \
  -d '{"text":"Happy Halloween!"}'

# Enable random poses on all
curl -X POST http://192.168.8.120:3000/api/orchestration/enable-random-poses \
  -H "Content-Type: application/json" \
  -d '{"cooldownMs":3000}'

# Restart all services
curl -X POST http://192.168.8.120:3000/api/orchestration/restart-services
```

### Goblin Videos
```bash
# Play video on Goblin1
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename":"halloween/video1.mp4","loop":true}'

# Stop video
curl -X POST http://192.168.8.160:3001/stop-video

# Play playlist
curl -X POST http://192.168.8.160:3001/play-playlist \
  -H "Content-Type: application/json" \
  -d '{"videos":["video1.mp4","video2.mp4"],"loop":true}'
```

---

## 🎯 Success Criteria

### Technical Success
- ✅ All 9 phases complete
- ✅ All tests passing
- ✅ All 5 animatronics online and functional
- ✅ Each using unique AI agent with personality
- ✅ Random poses working safely
- ✅ Orchestration system functional
- ✅ Goblin videos playing
- ✅ Documentation complete and accurate
- ✅ System stable for extended periods

### User Experience Success
- ✅ Each animatronic has distinct personality
- ✅ Natural movements enhance immersion
- ✅ Conversations are engaging
- ✅ System is easy to control
- ✅ Troubleshooting is straightforward
- ✅ Documentation is helpful

### Production Readiness
- ✅ All systems tested and verified
- ✅ Documentation complete
- ✅ Deployment procedures documented
- ✅ Rollback procedures tested
- ✅ Maintenance guide available
- ✅ Known issues documented
- ✅ Emergency procedures in place

---

## 🚨 Known Issues and Limitations

### To Be Documented During Execution
- Document any issues encountered
- Document workarounds
- Document limitations
- Document future enhancements

---

## 🎃 Final Notes

### For the Next Agent

**You are empowered to**:
- Work autonomously through all phases
- Make technical decisions
- Commit and push code
- Deploy to all devices
- Test thoroughly
- Update documentation

**You should**:
- Follow this plan sequentially
- Test after each task
- Commit after each phase
- Document as you go
- Ask for help if stuck (but try to solve first)

**Remember**:
- This is for Halloween - make it magical! 🎃
- The kids are counting on you 👻
- Orlok has real hardware - test it! 🧛‍♂️
- Safety first - respect amplitude limits ⚠️
- Each character is unique - maintain personalities 🎭

### Contact Information
- **User**: Aaron (arwpc)
- **GitHub**: arwpc/MonsterBox
- **Email**: arwpersonal@gmail.com

**Work autonomously - Aaron trusts you to complete everything!** 😴✨

---

## 📋 Appendix: File Locations

### Key Configuration Files
- `config/animatronics.json` - Network configuration
- `config/app-config.json` - Application configuration
- `data/characters.json` - Character definitions
- `data/character-{id}/parts.json` - Hardware parts
- `data/character-{id}/ai-config/tts-config.json` - Voice configuration
- `/etc/monsterbox/elevenlabs.key` - API key

### Key Service Files
- `services/orchestrationService.js` - Orchestration
- `services/randomPoseService.js` - Random poses
- `services/elevenLabsAgentService.js` - AI agents
- `services/conversationService.js` - Conversations
- `services/hardwareService/` - Hardware integration

### Key Route Files
- `routes/api/orchestrationRoutes.js` - Orchestration API
- `routes/api/randomPoseRoutes.js` - Random pose API
- `routes/api/elevenLabsApiRoutes.js` - ElevenLabs API
- `routes/orchestration.js` - Orchestration UI

### Key View Files
- `views/orchestration/index.ejs` - Orchestration dashboard
- `views/first-run/index.ejs` - First-run selection
- `views/conversation/index.ejs` - Conversation UI

### Key Script Files
- `scripts/deploy-to-animatronic.sh` - Single device deployment
- `scripts/deploy-to-all.sh` - Multi-device deployment
- `scripts/test-all-voices.sh` - Voice testing
- `scripts/demo-halloween-system.sh` - Demo script

### Documentation Files
- `README.md` - Main documentation
- `docs/README.md` - Documentation navigation
- `MONSTERBOX_5.2_MASTER_PLAN.md` - This file
- `docs/ORCHESTRATION_SYSTEM.md` - Orchestration guide
- `docs/MAINTENANCE_GUIDE.md` - Maintenance procedures

---

**End of MonsterBox 5.2 Master Plan**

🎃 **Happy Halloween!** 🎃


