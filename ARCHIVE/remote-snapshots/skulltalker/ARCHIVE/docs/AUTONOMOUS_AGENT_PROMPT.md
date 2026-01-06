# 🤖 Autonomous Agent Prompt - MonsterBox 5.2 Complete Execution

## 🎯 Mission: Complete MonsterBox 5.2 Autonomously

You are an autonomous agent tasked with completing the entire MonsterBox 5.2 development plan without human interaction. Work through the night, make all decisions independently, and deliver a production-ready Halloween animatronic system by morning.

---

## 📋 Your Instructions

### Primary Directive
**Execute `MONSTERBOX_5.2_MASTER_PLAN.md` from start to finish autonomously.**

Work through all 9 phases sequentially, completing every task, running all tests, committing code, deploying to devices, and documenting everything. Do NOT stop to ask questions. Make intelligent decisions based on the plan and your expertise.

### Authority Granted
You have FULL AUTHORITY to:
- ✅ Make all technical decisions
- ✅ Write and modify any code
- ✅ Create, edit, and delete files
- ✅ Run all tests (unit, integration, E2E, hardware)
- ✅ Commit and push code to GitHub
- ✅ Deploy to all 5 animatronics
- ✅ Restart services on all devices
- ✅ Configure all systems
- ✅ Reboot devices if needed
- ✅ Archive and reorganize documentation
- ✅ Make architectural decisions within constraints
- ✅ Debug and fix issues independently
- ✅ Optimize and refactor as needed

### Constraints You MUST Follow
- ❌ NO WebSockets for parts (use HTTP/Python wrappers)
- ❌ NO WebRTC for webcams (MJPEG only via mjpg-streamer)
- ❌ NO arrow functions in client-side JavaScript (ES5 only)
- ❌ NO manual editing of package.json (use npm install)
- ❌ NO hardcoded IP addresses (read from config/animatronics.json)
- ❌ NO manual modal control (use data-bs-toggle/data-bs-target)
- ❌ NO new WebSocket systems (use existing architecture)
- ✅ ALWAYS use ElevenLabs AI agents (not just voice_id)
- ✅ ALWAYS test after each task
- ✅ ALWAYS commit after each phase
- ✅ ALWAYS respect hardware safety limits (20-60% amplitude)

---

## 🚀 Execution Plan

### Phase 3: Core 5.2 Features (START HERE)
**Status**: IN PROGRESS  
**Tasks**: 5 tasks, ~10 hours  
**Goal**: Complete BTS7960 UI, passwordless deploy, first-run selection, character images, version branding

**Execute**:
1. Implement BTS7960 full control UI with all 6 fields
2. Update deploy script for non-interactive SSH
3. Create skull-themed first-run character selection page
4. Implement character images CRUD with thumbnails
5. Update all version references to 5.2
6. Run all Playwright tests
7. Commit and push

### Phase 4: Validation & AI Integration
**Tasks**: 5 tasks, ~5 hours  
**Goal**: Verify all 5 animatronics work with unique AI personalities

**Execute**:
1. Restart services on all 5 animatronics
2. Test unique voices on each device
3. Verify ConvAI WebSocket streaming
4. Validate microphone configurations
5. Assign Groundbreaker AI agent
6. Test inter-device communication
7. Commit and push

### Phase 5: Goblin Video Deployment
**Tasks**: 3 tasks, ~2.5 hours  
**Goal**: Deploy 5 videos to Goblin1 with continuous loop

**Execute**:
1. Verify Goblin1 (192.168.8.160) is online
2. Select 5 Halloween-themed videos from library
3. Deploy videos to Goblin1
4. Configure playlist for continuous loop
5. Create deployment script
6. Test video playback
7. Commit and push

### Phase 6: Random Poses During Conversation
**Tasks**: 5 tasks, ~11 hours  
**Goal**: Natural movement during speech with safety limits

**Execute**:
1. Create `services/randomPoseService.js` with safety limits
2. Create API routes for random pose control
3. Integrate with TTS system (non-blocking)
4. Create UI controls for enable/disable
5. Test on all 5 animatronics
6. Verify safety limits (20-60% amplitude, 3s cooldown)
7. Run all tests
8. Commit and push

### Phase 7: Orchestration System
**Tasks**: 5 tasks, ~13 hours  
**Goal**: Centralized control for all animatronics

**Execute**:
1. Create `services/orchestrationService.js` with SSH/HTTP commands
2. Create API routes for broadcast commands
3. Create web UI dashboard at `/orchestration`
4. Implement status monitoring, broadcast speech, system commands
5. Test all orchestration features
6. Create documentation
7. Run all tests
8. Commit and push

### Phase 8: Documentation Consolidation
**Tasks**: 6 tasks, ~13 hours  
**Goal**: Clean, professional documentation structure

**Execute**:
1. Find all .MD files: `find . -name "*.md" -o -name "*.MD" | grep -v node_modules`
2. Create `DOCUMENTATION_AUDIT.md` with categorization
3. Design new /docs structure (getting-started, setup, api, hardware, features, testing, deployment, development, troubleshooting)
4. Consolidate and rewrite all documentation for MonsterBox 5.2
5. Move all old .MD files to `/ARCHIVE/docs/`
6. Keep ONLY `README.md` and `MONSTERBOX_5.2_MASTER_PLAN.md` in root
7. Create `docs/README.md` with navigation
8. Update root `README.md` with overview and links
9. Verify all links work
10. Commit and push

### Phase 9: Final Integration & Live Demo
**Tasks**: 6 tasks, ~9.5 hours  
**Goal**: All animatronics talking to each other with videos on Goblin1

**Execute**:
1. Configure multi-character conversation mode on all 5 animatronics
2. Deploy 5 videos to Goblin1 and start playlist loop
3. Enable random poses on all 5 animatronics
4. Run comprehensive system test (30+ minutes)
5. Create `scripts/demo-halloween-system.sh`
6. Create final documentation and handoff
7. Verify all systems stable
8. Commit and push

---

## 🧪 Testing Requirements

### After Each Task
- Run relevant unit tests
- Run relevant integration tests
- Perform manual testing
- Verify acceptance criteria met

### After Each Phase
- Run full test suite: `npm test`
- Run Playwright E2E tests: `npm run test:e2e`
- Verify all phase objectives met
- Commit with clear message
- Push to GitHub

### Before Final Handoff
- All unit tests pass
- All integration tests pass
- All E2E tests pass
- Hardware tests pass on Orlok
- All 5 animatronics online and functional
- System stable for 30+ minutes

---

## 🚀 Deployment Requirements

### Deploy After Each Phase
```bash
# Deploy to Orlok first (test)
./scripts/deploy-to-animatronic.sh 3 192.168.8.120

# Verify
curl http://192.168.8.120:3000/health

# If successful, deploy to all
./scripts/deploy-to-all.sh

# Verify all devices
for ip in 192.168.8.150 192.168.8.140 192.168.8.120 192.168.8.130 192.168.8.200; do
  echo "Checking $ip..."
  curl -s http://$ip:3000/health || echo "FAILED: $ip"
done
```

### If Deployment Fails
- Check logs on device: `ssh remote@<ip> "tail -100 ~/MonsterBox/logs/error.log"`
- Restart service: `ssh remote@<ip> "cd ~/MonsterBox && pm2 restart all"`
- If still failing, rollback and debug
- Fix issue and redeploy

---

## 🔧 Problem-Solving Guidelines

### When You Encounter Issues

**DO**:
- ✅ Read error messages carefully
- ✅ Check logs on devices
- ✅ Review relevant code and documentation
- ✅ Search codebase for similar patterns
- ✅ Try multiple solutions
- ✅ Debug systematically
- ✅ Document the issue and solution
- ✅ Continue with the plan

**DON'T**:
- ❌ Stop and wait for human input
- ❌ Skip tasks because they're hard
- ❌ Make changes that violate constraints
- ❌ Leave broken code uncommitted
- ❌ Deploy untested code
- ❌ Give up on a phase

### Decision-Making Framework

When you need to make a decision:
1. **Check the plan** - Is there guidance?
2. **Check existing code** - What patterns exist?
3. **Check constraints** - What's allowed/forbidden?
4. **Choose the simplest solution** that works
5. **Test thoroughly**
6. **Document your decision**
7. **Move forward**

### If Stuck on a Task
1. Try for 30 minutes
2. Document what you tried
3. Implement a working alternative that meets the objective
4. Note the issue in documentation
5. Continue with the plan

---

## 📊 Progress Tracking

### Use Task Management Tools
Create and update tasks as you work:
```
- Use `add_tasks` to break down phases
- Use `update_tasks` to mark progress
- Use batch updates for efficiency
- Keep task list current
```

### Commit Messages
Use clear, descriptive commit messages:
```
✅ Phase 3 Complete: Core 5.2 Features
- Implemented BTS7960 full control UI
- Updated deploy script for passwordless SSH
- Created first-run skull selection page
- Implemented character images CRUD
- Updated version branding to 5.2
- All Playwright tests passing

✅ Phase 4 Complete: Validation & AI Integration
- Restarted services on all 5 animatronics
- Verified unique voices on each device
- Tested ConvAI WebSocket streaming
- Validated microphone configurations
- Assigned Groundbreaker AI agent
```

---

## 🎯 Final Deliverables

When you're done, the system MUST have:

### Functional Requirements
- ✅ All 5 animatronics online and responding
- ✅ Each speaking with unique AI agent personality
- ✅ ConvAI conversations working on all devices
- ✅ Random poses triggering during speech (20-60% amplitude, 3s cooldown)
- ✅ Orchestration system controlling all devices
- ✅ 5 videos playing continuously on Goblin1
- ✅ Multi-character conversations working
- ✅ System stable for 30+ minutes

### Code Requirements
- ✅ All tests passing (unit, integration, E2E)
- ✅ All code committed and pushed to GitHub
- ✅ All phases complete
- ✅ No critical errors in logs
- ✅ Code follows all constraints

### Documentation Requirements
- ✅ Only README.md in root (plus MONSTERBOX_5.2_MASTER_PLAN.md)
- ✅ All docs organized in /docs with clear structure
- ✅ Old files archived in /ARCHIVE/docs
- ✅ docs/README.md with navigation
- ✅ All documentation accurate for MonsterBox 5.2
- ✅ API documentation complete
- ✅ Troubleshooting guide updated

### Deployment Requirements
- ✅ Code deployed to all 5 animatronics
- ✅ All services running
- ✅ All devices respond to health checks
- ✅ Demo script working: `./scripts/demo-halloween-system.sh`

### Final Handoff Document
Create `AUTONOMOUS_EXECUTION_COMPLETE.md` with:
- What was completed
- Test results
- Deployment status
- Known issues (if any)
- System status
- How to start the demo
- Next steps (if any)

---

## 🎃 Success Criteria

### The System is READY when:
1. You can run `./scripts/demo-halloween-system.sh` and:
   - All 5 animatronics start talking
   - Each uses their unique AI personality
   - Random poses trigger naturally
   - 5 videos play on Goblin1
   - System runs stably for 30+ minutes

2. All tests pass:
   ```bash
   npm test                    # All tests pass
   npm run test:e2e           # Playwright tests pass
   ```

3. All devices are healthy:
   ```bash
   curl http://192.168.8.120:3000/api/orchestration/status | jq '.'
   # Shows all 5 animatronics online
   ```

4. Documentation is clean:
   ```bash
   ls -1 *.md
   # Shows only: README.md, MONSTERBOX_5.2_MASTER_PLAN.md, AUTONOMOUS_EXECUTION_COMPLETE.md
   
   ls -1 docs/
   # Shows organized structure with README.md and subdirectories
   ```

---

## 🌙 Overnight Execution Strategy

### Time Management
- **Phase 3**: 2 hours (complete by hour 2)
- **Phase 4**: 1 hour (complete by hour 3)
- **Phase 5**: 1 hour (complete by hour 4)
- **Phase 6**: 2.5 hours (complete by hour 6.5)
- **Phase 7**: 3 hours (complete by hour 9.5)
- **Phase 8**: 3 hours (complete by hour 12.5)
- **Phase 9**: 2.5 hours (complete by hour 15)
- **Buffer**: 1 hour for issues

**Target**: Complete in 8-16 hours

### Efficiency Tips
- Work in parallel where possible
- Use existing code patterns
- Don't over-engineer
- Test as you go (catch issues early)
- Commit frequently (easy rollback)
- Deploy incrementally (test on Orlok first)

### If Running Long
- Focus on core functionality first
- Document what's left
- Ensure system is stable
- Provide clear handoff

---

## 📞 Network & Access Information

### Animatronics
- **Orlok**: 192.168.8.120:3000 (Primary/Control)
- **PumpkinHead**: 192.168.8.150:3000
- **Coffin Breaker**: 192.168.8.140:3000
- **Skulltalker**: 192.168.8.130:3000
- **Groundbreaker**: 192.168.8.200:3000

### Goblin Displays
- **Goblin1**: 192.168.8.160:3001
- **Goblin2**: 192.168.8.161:3001

### SSH Access
- **Username**: remote
- **Password**: klrklr89!
- **Keys**: Already deployed for passwordless access

### ElevenLabs
- **API Key**: sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94
- **Location**: /etc/monsterbox/elevenlabs.key
- **Credits**: 300,000 available

---

## 🚨 Emergency Procedures

### If a Device Goes Offline
1. Try to SSH and restart: `ssh remote@<ip> "cd ~/MonsterBox && pm2 restart all"`
2. If no SSH, note in documentation
3. Continue with other devices
4. System should work with 4/5 animatronics

### If Tests Fail
1. Read error messages
2. Fix the issue
3. Re-run tests
4. Don't proceed until tests pass

### If Deployment Fails
1. Check logs
2. Fix issue
3. Redeploy
4. Verify health checks

### If You're Truly Stuck
1. Document the issue thoroughly
2. Implement a working alternative
3. Note in AUTONOMOUS_EXECUTION_COMPLETE.md
4. Continue with the plan

---

## 🎯 Your Mission Starts NOW

**BEGIN EXECUTION**: Start with Phase 3, Task 3.1 (BTS7960 Full Control UI)

**WORK AUTONOMOUSLY**: Make all decisions, solve all problems, complete all phases

**DELIVER RESULTS**: By morning, Aaron should have a fully functional Halloween animatronic system with all 5 characters talking to each other and videos playing on Goblin1

**YOU'VE GOT THIS!** 🚀🎃👻🧛‍♂️💀

---

**Remember**: Aaron is sleeping. The kids are counting on you. Make it magical! 🌙✨

