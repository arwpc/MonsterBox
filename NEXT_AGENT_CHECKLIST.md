# MonsterBox 5.2 - Next Agent Quick Start Checklist

## 📋 Before You Start

- [ ] Read `MONSTERBOX_5.2_MASTER_PLAN.md` (complete plan)
- [ ] Read `MASTER_PLAN_SUMMARY.md` (executive summary)
- [ ] Review `README.md` (current system state)
- [ ] Check `config/animatronics.json` (network configuration)
- [ ] Verify SSH access to Orlok (192.168.8.120)

## 🎯 Your Mission

Complete MonsterBox 5.2 with:
1. Core 5.2 features (BTS7960, first-run, character images)
2. Multi-animatronic validation
3. Goblin video deployment
4. Random poses during conversation
5. Orchestration system
6. **Documentation consolidation** (NEW - clean up all .MD files)
7. **Final live demo** (NEW - all animatronics talking, 5 videos on Goblin1)

## 📊 Phase Checklist

### Phase 3: Core 5.2 Features (IN PROGRESS)
- [ ] Task 3.1: BTS7690 Full Control UI (2 hours)
- [ ] Task 3.2: Passwordless Deploy Script (1 hour)
- [ ] Task 3.3: First-Run Skull Selection (3 hours)
- [ ] Task 3.4: Character Images CRUD (4 hours)
- [ ] Task 3.5: Version Branding Update (30 min)
- [ ] All Playwright tests pass
- [ ] Code committed and pushed

### Phase 4: Validation & AI Integration
- [ ] Task 4.1: Restart Services on All Animatronics (30 min)
- [ ] Task 4.2: Test Unique Voices (1 hour)
- [ ] Task 4.3: Verify ConvAI WebSocket Streaming (2 hours)
- [ ] Task 4.4: Cross-Device Microphone Validation (1 hour)
- [ ] Task 4.5: Assign Groundbreaker AI Agent (30 min)
- [ ] All 5 animatronics speaking with unique voices
- [ ] ConvAI working on all devices

### Phase 5: Goblin Video Deployment
- [ ] Task 5.1: Verify Goblin Device Status (30 min)
- [ ] Task 5.2: Select and Deploy Videos (1 hour)
- [ ] Task 5.3: Create Goblin Deployment Script (1 hour)
- [ ] Videos playing on Goblin1
- [ ] Deployment script working

### Phase 6: Random Poses During Conversation
- [ ] Task 6.1: Create Random Pose Service (3 hours)
- [ ] Task 6.2: Create Random Pose API Routes (2 hours)
- [ ] Task 6.3: Integrate with TTS System (2 hours)
- [ ] Task 6.4: Create Random Pose UI Controls (2 hours)
- [ ] Task 6.5: Test on All Animatronics (2 hours)
- [ ] Random poses working safely
- [ ] TTS integration complete

### Phase 7: Orchestration System
- [ ] Task 7.1: Create Orchestration Service (4 hours)
- [ ] Task 7.2: Create Orchestration API Routes (2 hours)
- [ ] Task 7.3: Create Orchestration Web UI (4 hours)
- [ ] Task 7.4: Test Orchestration System (2 hours)
- [ ] Task 7.5: Create Orchestration Documentation (1 hour)
- [ ] Orchestration UI accessible
- [ ] Broadcast commands working

### Phase 8: Documentation Consolidation ⭐ NEW
- [ ] Task 8.1: Audit All Markdown Files (2 hours)
- [ ] Task 8.2: Design New Documentation Structure (1 hour)
- [ ] Task 8.3: Consolidate and Rewrite Documentation (6 hours)
- [ ] Task 8.4: Archive Old Documentation (1 hour)
- [ ] Task 8.5: Update README.md (2 hours)
- [ ] Task 8.6: Create Documentation Navigation (1 hour)
- [ ] All .MD files reviewed
- [ ] New docs in /docs
- [ ] Old files in /ARCHIVE
- [ ] Only README.MD in root

### Phase 9: Final Integration & Live Demo ⭐ NEW
- [ ] Task 9.1: Configure Multi-Character Conversation (3 hours)
- [ ] Task 9.2: Deploy and Configure Goblin1 Videos (1 hour)
- [ ] Task 9.3: Enable Random Poses on All Animatronics (30 min)
- [ ] Task 9.4: Comprehensive System Test (2 hours)
- [ ] Task 9.5: Create Demo Script (1 hour)
- [ ] Task 9.6: Final Documentation and Handoff (2 hours)
- [ ] All 5 animatronics talking to each other
- [ ] 5 videos playing on Goblin1
- [ ] System stable for 30+ minutes

## 🧪 Testing Checklist

### After Each Task
- [ ] Unit tests pass (if applicable)
- [ ] Integration tests pass (if applicable)
- [ ] Manual testing complete
- [ ] Acceptance criteria met

### After Each Phase
- [ ] All phase tests pass
- [ ] Code committed with clear message
- [ ] Code pushed to GitHub
- [ ] Documentation updated

### Before Final Handoff
- [ ] All unit tests pass: `npm run test:unit`
- [ ] All integration tests pass: `npm run test:integration`
- [ ] All E2E tests pass: `npm run test:e2e`
- [ ] Hardware tests pass on Orlok: `npm run test:hardware`
- [ ] All 5 animatronics online and functional
- [ ] Orchestration system working
- [ ] Documentation complete and accurate

## 🚀 Deployment Checklist

### Before Deploying
- [ ] All tests passing locally
- [ ] Code committed and pushed
- [ ] Documentation updated
- [ ] Backup of current system (if needed)

### Deploy to Orlok (Test)
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120
curl http://192.168.8.120:3000/health
```

### Deploy to All Animatronics
```bash
./scripts/deploy-to-all.sh
# Verify all devices
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  curl -s http://$ip:3000/health || echo "FAILED: $ip"
done
```

### Post-Deployment
- [ ] All devices respond to health check
- [ ] All services running
- [ ] No critical errors in logs
- [ ] Smoke tests pass

## 📚 Documentation Checklist

### Phase 8 Specific
- [ ] Find all .MD files: `find . -name "*.md" -o -name "*.MD" | grep -v node_modules`
- [ ] Create `DOCUMENTATION_AUDIT.md` with inventory
- [ ] Design new /docs structure
- [ ] Consolidate information from old docs
- [ ] Rewrite for clarity and accuracy
- [ ] Move old files to /ARCHIVE/docs
- [ ] Update root README.md
- [ ] Create docs/README.md with navigation
- [ ] Verify all links work

### Ongoing
- [ ] Update docs as you build
- [ ] Document any issues encountered
- [ ] Document workarounds
- [ ] Update API documentation
- [ ] Update troubleshooting guide

## 🎃 Final Demo Checklist (Phase 9)

### System Preparation
- [ ] All 5 animatronics online
- [ ] All services running
- [ ] Goblin1 online
- [ ] Random poses enabled
- [ ] Microphones configured
- [ ] Speakers configured

### Start Demo
```bash
# Run demo script
./scripts/demo-halloween-system.sh

# Or manually:
# 1. Check status
curl http://192.168.8.120:3000/api/orchestration/status | jq '.'

# 2. Start Goblin videos
curl -X POST http://192.168.8.160:3001/play-playlist \
  -H "Content-Type: application/json" \
  -d '{"videos":["video1.mp4","video2.mp4","video3.mp4","video4.mp4","video5.mp4"],"loop":true}'

# 3. Enable random poses
curl -X POST http://192.168.8.120:3000/api/orchestration/enable-random-poses \
  -H "Content-Type: application/json" \
  -d '{"cooldownMs":3000}'

# 4. Start conversation
curl -X POST http://192.168.8.120:3000/api/orchestration/say-all \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome to our Halloween gathering!"}'
```

### Verify Demo
- [ ] All 5 animatronics speaking
- [ ] Each with unique personality
- [ ] Random poses triggering
- [ ] 5 videos playing on Goblin1
- [ ] Inter-character conversations working
- [ ] System stable for 30+ minutes
- [ ] No errors in logs

## ⚠️ Critical Reminders

### Code Style
- [ ] Client code uses ES5 function syntax (no arrow functions)
- [ ] Server code can use ES6+ modules
- [ ] Follow existing patterns

### Hardware
- [ ] No WebSockets for parts (use HTTP/Python wrappers)
- [ ] MJPEG only for webcams (no WebRTC)
- [ ] PipeWire for all audio
- [ ] Validate GPIO pin assignments

### Bootstrap Modals
- [ ] Use data-bs-toggle and data-bs-target
- [ ] Don't manually control show/hide
- [ ] Don't nest modals

### ElevenLabs
- [ ] Always use full AI agent (not just voice_id)
- [ ] API key in /etc/monsterbox/elevenlabs.key
- [ ] Monitor credit usage

### Network
- [ ] Read IPs from config/animatronics.json
- [ ] Never hardcode IPs in code
- [ ] Use SSH keys for passwordless access

### Version Control
- [ ] Commit after each phase
- [ ] Push regularly to GitHub
- [ ] Force push preferred over merging
- [ ] Clear commit messages

## 📞 Quick Reference

### Network
- **Orlok**: 192.168.8.120:3000 (Primary/Control)
- **PumpkinHead**: 192.168.8.150:3000
- **Coffin Breaker**: 192.168.8.140:3000
- **Skulltalker**: 192.168.8.130:3000
- **Groundbreaker**: 192.168.8.200:3000
- **Goblin1**: 192.168.8.160:3001
- **Goblin2**: 192.168.8.161:3001

### SSH
- **Username**: remote
- **Password**: klrklr89!
- **Keys**: Deployed for passwordless access

### ElevenLabs
- **API Key**: sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94
- **Location**: /etc/monsterbox/elevenlabs.key
- **Credits**: 300,000 available

### Key Commands
```bash
# Test all voices
./scripts/test-all-voices.sh

# Deploy to all
./scripts/deploy-to-all.sh

# Run tests
npm test

# Check orchestration status
curl http://192.168.8.120:3000/api/orchestration/status | jq '.'
```

## ✅ Success Criteria

When you're done, the system will have:
- ✅ All 5 animatronics with unique AI personalities
- ✅ Natural movement during conversation
- ✅ Multi-character conversations working
- ✅ Orchestration system for coordinated control
- ✅ Goblin videos playing continuously
- ✅ Clean, professional documentation
- ✅ Comprehensive test coverage
- ✅ Production-ready for Halloween

## 🎯 Final Deliverables

- [ ] All 9 phases complete
- [ ] All tests passing
- [ ] All documentation updated
- [ ] Demo script working
- [ ] System stable and tested
- [ ] Handoff document created
- [ ] Ready for production use

---

**Remember**: Work autonomously, test thoroughly, commit regularly, and make it magical for the kids! 🎃

**When you return, Aaron wants to see**:
- All animatronics talking to each other in Conversation mode
- 5 videos playing on Goblin1
- Clean, professional documentation
- Production-ready Halloween system

**You've got this!** 🚀👻🧛‍♂️💀🎃

