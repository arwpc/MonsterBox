# 🎃 MonsterBox Halloween Deployment - Complete Mission Brief

## Mission Overview
Deploy a fully operational 4-animatronic Halloween system with unique AI personalities, coordinated control, and natural movement. Each animatronic must use its assigned ElevenLabs AI Agent with complete personality, voice characteristics, and knowledge corpus.

---

## Phase 3: Room-Wide Validation & AI Agent Integration

### Objectives
1. **Verify Unique AI Agent Integration**
   - Each animatronic MUST use its assigned ElevenLabs AI Agent
   - AI Agents contain personality, voice tuning, knowledge corpus, and conversation style
   - Voice characteristics are defined in the agent description (pronunciation, inflection, cadence)
   - Test that each character speaks with their unique personality and voice tuning

2. **Character-Agent Assignments** (from `data/characters.json`)
   - **PumpkinHead** (Character 1): `agent_0801k3f1dybkecj88sta18gwwrv5`
   - **Coffin Breaker** (Character 2): `agent_8401k3f1dx98e05t94yp6kz4vf8n`
   - **Orlok** (Character 3): `agent_0801k3f1dw7xe2g8r4jkbxk0gt2n`
     - Agent URL: https://elevenlabs.io/app/talk-to?agent_id=agent_0801k3f1dw7xe2g8r4jkbxk0gt2n
     - Personality: COUNT ORLOK, Nosferatu - archaic, ceremonial, Romanian-tinged syntax
     - Voice tuning: Uses ellipses for breaths, audio tags [whispers], [slow breath], formal imperatives
     - Knowledge: Warner Castle (Iowa), Mina, the Knight, plague-portents, covenants
   - **Skulltalker** (Character 4): `agent_7901k3f1dza1ee68w1257zh3s9x6`

3. **Validation Tasks**
   - Verify each animatronic's `config/app-config.json` has correct `selectedCharacter` ID
   - Test TTS on each animatronic to confirm unique voice characteristics
   - Verify ConvAI WebSocket services running on port 8795
   - Test microphone input and STT configuration
   - Confirm AI agent personality comes through in responses

4. **Success Criteria**
   - All 4 animatronics respond with distinct personalities
   - Voice tuning from AI agent descriptions is applied (Orlok's archaic speech, breath pauses, etc.)
   - Each character uses their knowledge corpus appropriately
   - ConvAI conversations reflect agent personality, not generic responses

---

## Phase 4: Goblin Video Deployment

### Objectives
1. Deploy video loops to Goblin display device at 192.168.8.160
2. Create automated deployment script
3. Configure 5 Halloween-themed videos from video library

### Tasks
- Create `scripts/deploy-goblin-videos.sh`
- Use videos from `data/video-library/files/`
- Deploy to Goblin device when online
- Configure looping playback

### Success Criteria
- Deployment script created and tested
- Videos ready to deploy when Goblin device comes online
- Non-blocking (system works without Goblin)

---

## Phase 5: Random Poses During Conversation

### Objectives
1. Implement natural movement system that triggers during speech
2. Ensure safety limits and pose filtering
3. Integrate with TTS system for automatic triggering
4. Provide API control for enable/disable

### Implementation Requirements

#### Service: `services/randomPoseService.js`
- **Safety Limits**: 20-60% amplitude (configurable)
- **Cooldown**: 3 seconds default (configurable)
- **Pose Filtering**: Only subtle/moderate poses, exclude dramatic movements
- **Trigger Logic**: 
  - Automatically during TTS if text > 50 characters
  - 50% probability to avoid over-movement
  - Respects cooldown between poses
- **Pose Scaling**: Scale movements toward center positions for safety

#### API Routes: `routes/api/randomPoseRoutes.js`
- `GET /api/random-poses/config` - Get current configuration
- `POST /api/random-poses/enable` - Enable with options (cooldownMs, minAmplitude, maxAmplitude)
- `POST /api/random-poses/disable` - Disable system
- `POST /api/random-poses/trigger` - Manual trigger for testing

#### Integration Points
- Integrate with `routes/api/elevenLabsApiRoutes.js` `/generate-and-play` endpoint
- Trigger before audio playback starts
- Non-blocking (don't wait for pose completion)
- Graceful failure (log but continue if pose fails)

### Success Criteria
- Animatronics move naturally during speech
- Movements are safe and subtle
- System can be enabled/disabled per character or globally
- No interference with speech playback

---

## Phase 6: Orchestration System

### Objectives
1. Create centralized control system for all animatronics
2. Support broadcast/multicast commands
3. Provide both API and web UI interfaces
4. Enable coordinated Halloween experiences

### Implementation Requirements

#### Service: `services/orchestrationService.js`
- **Network Map**: All 4 animatronics + Goblin device
- **Communication**: SSH and HTTP-based (NO new WebSockets)
- **Supported Commands**:
  - `reboot` - Reboot device (use with caution)
  - `restart-service` - Restart MonsterBox service
  - `health-check` - Verify service is responding
  - `say` - Make animatronic speak using its AI agent
  - `enable-random-poses` - Enable movement system
  - `disable-random-poses` - Disable movement system
  - `update-config` - Update configuration files
  - `deploy-code` - Deploy code updates

#### API Routes: `routes/api/orchestrationRoutes.js`
- `GET /api/orchestration/status` - Get status of all devices
- `POST /api/orchestration/broadcast/animatronics` - Send command to all animatronics
- `POST /api/orchestration/say-all` - Make all animatronics speak (each with their AI agent)
- `POST /api/orchestration/enable-random-poses` - Enable poses on all
- `POST /api/orchestration/disable-random-poses` - Disable poses on all
- `POST /api/orchestration/restart-services` - Restart all services

#### Web UI: `views/orchestration/index.ejs`
- **System Status Dashboard**: Real-time monitoring of all 4 animatronics
- **Broadcast Speech**: Send messages to all (each uses their AI agent personality)
- **Random Pose Control**: Enable/disable system-wide with cooldown settings
- **System Commands**: Restart services, health checks
- **Command Log**: Live log of all actions with timestamps
- **Auto-refresh**: Status updates every 30 seconds

#### Web Route: `routes/orchestration.js`
- `GET /orchestration` - Main control interface

### Critical Requirement: AI Agent Integration
**IMPORTANT**: When orchestration sends speech commands, each animatronic MUST use its assigned AI agent, not just the voice ID. This means:
- The speech should go through the AI agent's processing
- Agent personality, knowledge, and voice tuning should be applied
- NOT just raw TTS with a voice ID

### Success Criteria
- All 4 animatronics controllable from single interface
- Broadcast commands work reliably
- Each animatronic maintains its unique AI personality in responses
- Web UI is responsive and intuitive
- System status accurately reflects device states

---

## Final Task: All Said and Done

### Comprehensive Testing
1. **Voice & Personality Test**
   - Test each animatronic individually
   - Verify AI agent personality comes through
   - Confirm voice characteristics match agent description
   - Example for Orlok: Should use archaic speech, ellipses, audio tags like [whispers]

2. **Coordinated Broadcast Test**
   - Use orchestration to send message to all
   - Verify each responds with their unique personality
   - Confirm random poses trigger during speech
   - Check that all 4 speak simultaneously

3. **Random Pose Validation**
   - Enable random poses on all animatronics
   - Trigger speech and observe natural movements
   - Verify safety limits are respected
   - Test enable/disable functionality

4. **System Health Check**
   - Verify all services running
   - Check ConvAI WebSocket connections
   - Confirm microphone and speaker configurations
   - Test orchestration status endpoint

### Deployment & Documentation
1. **Code Deployment**
   - Commit all changes with descriptive messages
   - Push to GitHub
   - Deploy to all 3 remote animatronics
   - Restart services and verify

2. **Documentation**
   - Create comprehensive deployment summary
   - Document all API endpoints
   - Provide quick start commands
   - Include troubleshooting guide

3. **Final Verification**
   - All 4 animatronics online
   - Unique AI personalities working
   - Random poses enabled and safe
   - Orchestration UI accessible
   - Ready for Halloween!

---

## Network Configuration

### Animatronic Network Map
- **PumpkinHead**: 192.168.8.150:3000 (Character 1)
- **Coffin Breaker**: 192.168.8.140:3000 (Character 2)
- **Orlok**: 192.168.8.120:3000 (Character 3) - Primary/Control Node
- **Skulltalker**: 192.168.8.130:3000 (Character 4)
- **Goblin**: 192.168.8.160:3001 (Video display)

### SSH Access
- Username: `remote`
- Password: `klrklr89!`
- All devices have sudo access

---

## Key Technical Requirements

### AI Agent Integration (CRITICAL)
- **DO NOT** use simple TTS with voice_id only
- **MUST** use ElevenLabs AI Agent for full personality
- Agent includes: personality, voice tuning, knowledge corpus, conversation style
- Voice characteristics defined in agent description (pronunciation, inflection, cadence)
- Example: Orlok's agent defines archaic speech patterns, breath pauses, audio tags

### Voice Configuration Files
- Per-character TTS config: `data/character-{id}/ai-config/tts-config.json`
- Contains voice_id, model, stability, similarity_boost
- Voice tuning comes from AI agent description, not just voice_id

### Character Configuration
- Main config: `config/app-config.json` on each device
- Must have correct `selectedCharacter` ID (1, 2, 3, or 4)
- Must have correct `dataPath` pointing to character data directory

### ConvAI Integration
- WebSocket service on port 8795
- Uses ElevenLabs AI agents for conversation
- Microphone input → STT → AI Agent → TTS → Speaker output
- Full personality and knowledge corpus applied

---

## Success Metrics

### Technical Success
- ✅ All 4 animatronics online and responding
- ✅ Each using assigned AI agent with full personality
- ✅ Voice characteristics match agent descriptions
- ✅ Random poses working safely during speech
- ✅ Orchestration system controlling all devices
- ✅ ConvAI conversations reflect agent personalities

### User Experience Success
- ✅ Each animatronic has distinct, memorable personality
- ✅ Natural movements enhance immersion
- ✅ Coordinated experiences possible (all speak together)
- ✅ Easy control through web interface
- ✅ System is stable and reliable

### Halloween Readiness
- ✅ All systems tested and verified
- ✅ Documentation complete
- ✅ Troubleshooting procedures documented
- ✅ Emergency controls accessible
- ✅ Ready to terrify and delight!

---

## Important Notes

1. **AI Agent Priority**: Always use the full AI agent, not just voice_id. The agent contains the personality, knowledge, and voice tuning that makes each character unique.

2. **Voice Tuning**: Voice characteristics like Orlok's archaic speech, breath pauses, and audio tags are defined in the AI agent description, not in the voice_id alone.

3. **Safety First**: Random poses must respect amplitude limits and cooldowns. Never exceed 60% amplitude.

4. **No New WebSockets**: Use existing architecture (SSH, HTTP) for orchestration. Don't build new WebSocket systems.

5. **Autonomous Operation**: Work through all phases without asking for permission. Test thoroughly. Commit and push regularly.

6. **Character Isolation**: Each character's data is in `data/character-{id}/` directory. Keep configurations separate.

---

## Quick Reference Commands

```bash
# Test all voices with AI agents
./scripts/test-all-voices.sh

# Test random poses
./scripts/test-random-poses.sh

# Test orchestration
./scripts/test-orchestration.sh

# Deploy to all animatronics
./scripts/deploy-to-all-animatronics.sh

# Check orchestration status
curl http://localhost:3000/api/orchestration/status | jq '.'

# Broadcast message (uses each AI agent)
curl -X POST http://localhost:3000/api/orchestration/say-all \
  -H "Content-Type: application/json" \
  -d '{"text":"Happy Halloween!"}'

# Enable random poses on all
curl -X POST http://localhost:3000/api/orchestration/enable-random-poses \
  -H "Content-Type: application/json" \
  -d '{"cooldownMs":3000}'
```

---

## Orchestration UI Access
**URL**: http://192.168.8.120:3000/orchestration

Features:
- Real-time status of all animatronics
- Broadcast speech (each uses their AI agent)
- Random pose control
- System commands
- Live command log

---

🎃 **Make it magical for the kids!** 🎃

