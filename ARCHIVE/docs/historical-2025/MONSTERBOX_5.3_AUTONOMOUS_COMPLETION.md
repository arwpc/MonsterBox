# MonsterBox 5.3 - Autonomous Production Build Completion

**CRITICAL DIRECTIVE**: This document contains autonomous execution instructions for AI agents (Augment/ChatGPT-5). **NO HUMAN INPUT IS REQUIRED OR PERMITTED** until 100% test completion is achieved.

---

## 🎯 MISSION OBJECTIVE

Complete MonsterBox 5.3 production build to 100% operational status with full test suite passing (Mocha + Playwright) and all hardware parts functional on Orlok animatronic.

**Success Criteria**: All tests pass, all parts move correctly, all audio/video/AI systems operational.

---

## 📊 CURRENT STATUS SUMMARY

### ✅ Recently Completed (Last 3 Commits)

**Commit 622feae0** - "Significant Audio Improvements. Reliability improvements."
- ✅ STT filter presets with noise reduction (Noisy Environment preset)
- ✅ VAD autotune system with configurable thresholds
- ✅ Setup Audio Gold page with full CRUD for speakers/microphones
- ✅ ElevenLabs WebSocket service enhancements
- ✅ Comprehensive audio testing suite (Playwright + Mocha)
- ✅ STT tuning guide and documentation
- ✅ 51 files changed, 7,530 insertions, 457 deletions

**Commit c4e1841f** - "Decision needed section with MB_AUTOTUNE_ALLOW_SFX question"
- ✅ Documentation for autotune configuration decisions

**Commit ec5b1b4c** - "Orlok audio autotune findings and handoff"
- ✅ Optional denoise/bandpass filters for STT
- ✅ Parrot mode provisional support on stt_partial
- ✅ Orlok audio autotune findings documented
- ✅ 19 files changed, 1,874 insertions, 889 deletions

### 🔧 Hardware Status (Orlok - Character 3)
- ✅ Jaw servo (PCA9685) - configured and tested
- ✅ Webcam (MJPEG stream on port 8090) - working with 5-second latency
- ✅ Microphone (PulseAudio Input device 80) - configured
- ✅ Speaker (PulseAudio Output) - configured but **NOT FUNCTIONAL**
- ✅ ElevenLabs AI Agent assigned (agent_0801k3f1dw7xe2g8r4jkbxk0gt2n)
- ⚠️ Linear actuators, motors, steppers - need Simple Calibration UI

### 🐛 CRITICAL ISSUES IDENTIFIED

1. **Audio System Completely Non-Functional**
   - PipeWire/WirePlumber running but no sound output
   - Test endpoint `/setup/audio/api/test-system` returns 500 error
   - Audio input testing fails
   - VU meter monitoring fails
   - Root cause: Unknown server-side error in audio test endpoint

2. **Webcam 5-Second Latency**
   - MJPEG stream working but significant delay
   - Needs optimization or configuration adjustment

3. **Missing Simple Calibration UI**
   - All moving parts (linear actuators, servos, motors, steppers) need calibration panels
   - Must replace Markers panels
   - Must provide Min/Max guardrails for Jaw Animation and Head Tracking

4. **JavaScript Errors (FIXED in current session)**
   - ✅ Null-safe event listener removal added
   - ✅ WebSocket ready state checks added
   - Needs verification after page refresh

5. **Demo Page Issues**
   - Microphone/Speaker dropdowns show "Default Input/Output" and "PulseAudio Input/Output"
   - Should show actual hardware device names
   - Audio test buttons non-functional

---

## 🎯 AUTONOMOUS TASK LIST

**AGENT DIRECTIVE**: Complete ALL tasks sequentially. Mark each complete only after verification. Do NOT ask for human input.

### Phase 1: Critical Audio System Repair (PRIORITY 1)

- [ ] **Task 1.1**: Debug `/setup/audio/api/test-system` endpoint
  - Check server logs for actual error
  - Verify `runWrapper` function for speaker_cli.py and microphone_cli.py
  - Test CLI scripts directly on command line
  - Fix any Python script errors
  - Verify PipeWire device enumeration

- [ ] **Task 1.2**: Fix audio output (speaker) functionality
  - Verify PipeWire/PulseAudio routing
  - Test speaker playback with `paplay` command
  - Ensure speaker Part is correctly configured
  - Test TTS audio output through assigned speaker

- [ ] **Task 1.3**: Fix audio input (microphone) functionality
  - Verify microphone device access
  - Test microphone recording with `parecord` command
  - Ensure microphone Part is correctly configured
  - Test STT audio input through assigned microphone

- [ ] **Task 1.4**: Fix VU meter monitoring
  - Debug input level monitoring endpoint
  - Verify real-time audio level measurement
  - Test visual VU meter display on Setup Audio page

- [ ] **Task 1.5**: Verify hardware device selection
  - Ensure dropdowns show actual hardware names (not "Default Input")
  - Test device enumeration API
  - Verify device selection persistence

### Phase 2: Webcam Latency Optimization (PRIORITY 2)

- [ ] **Task 2.1**: Diagnose webcam latency
  - Check mjpg-streamer configuration
  - Test different resolution/framerate settings
  - Verify network bandwidth is not bottleneck

- [ ] **Task 2.2**: Optimize MJPEG stream
  - Adjust mjpg-streamer parameters for lower latency
  - Test with different buffer sizes
  - Document optimal settings

### Phase 3: Simple Calibration UI Implementation (PRIORITY 3)

- [ ] **Task 3.1**: Create Simple Calibration panel component
  - Design reusable calibration panel (Min/Center/Max)
  - Add Save Position functionality
  - Add CRUD for named positions
  - Add "Copy Calibration" feature

- [ ] **Task 3.2**: Implement for Linear Actuators
  - Replace Markers panel with Simple Calibration
  - Test Min/Max position saving
  - Verify guardrails prevent over-extension

- [ ] **Task 3.3**: Implement for Servos
  - Add Simple Calibration panel to servo forms
  - Support different orientations (jaw up/down, head left/right)
  - Test calibration copy between same-type servos

- [ ] **Task 3.4**: Implement for Motors
  - Add Simple Calibration panel to motor forms
  - Test speed/direction calibration

- [ ] **Task 3.5**: Implement for Steppers
  - Add Simple Calibration panel to stepper forms
  - Test step count calibration

- [ ] **Task 3.6**: Integrate calibration with Jaw Animation
  - Use Min/Max values as guardrails
  - Prevent jaw over-extension
  - Test with actual jaw servo movement

- [ ] **Task 3.7**: Integrate calibration with Head Tracking
  - Use Min/Max values as guardrails
  - Prevent head over-rotation
  - Test with actual head servo movement

### Phase 4: Demo Page Enhancements (PRIORITY 4)

- [ ] **Task 4.1**: Fix microphone/speaker dropdown labels
  - Show actual hardware device names
  - Remove generic "Default" labels
  - Test device selection

- [ ] **Task 4.2**: Verify JavaScript error fixes
  - Refresh page and check console
  - Confirm no null reference errors
  - Confirm no WebSocket timing errors

- [ ] **Task 4.3**: Test Press & Hold to Talk
  - Verify real-time STT
  - Test with Orlok's microphone
  - Verify transcription display

- [ ] **Task 4.4**: Test Parrot Mode
  - Enable Parrot Mode toggle
  - Verify STT → TTS loop
  - Test with actual audio hardware

### Phase 5: Comprehensive Testing (PRIORITY 5)

- [ ] **Task 5.1**: Run all Mocha unit tests
  ```bash
  npm test
  ```
  - Fix any failing tests
  - Achieve 100% pass rate

- [ ] **Task 5.2**: Run all Playwright e2e tests
  ```bash
  npx playwright test
  ```
  - Fix any failing tests
  - Achieve 100% pass rate

- [ ] **Task 5.3**: Run hardware integration tests
  - Test all part types with actual hardware
  - Verify servo movement (jaw)
  - Verify linear actuator movement (if configured)
  - Verify motor movement (if configured)
  - Verify stepper movement (if configured)

- [ ] **Task 5.4**: Run full system integration test
  - Test complete conversation flow
  - Verify webcam → AI → TTS → jaw animation pipeline
  - Test with multiple exchanges
  - Verify audio quality and timing

- [ ] **Task 5.5**: Create comprehensive test report
  - Document all test results
  - Include screenshots/videos of hardware movement
  - List any remaining issues
  - Provide performance metrics

---

## 🔬 TESTING REQUIREMENTS

### Test Coverage Required
1. **Unit Tests (Mocha)**: 100% pass rate
2. **E2E Tests (Playwright)**: 100% pass rate
3. **Hardware Tests**: All part types move correctly
4. **Integration Tests**: Full conversation pipeline functional

### Test Execution Commands
```bash
# Mocha unit tests
npm test

# Playwright e2e tests (headless Firefox on RPi4b)
npx playwright test --project=firefox

# Specific test suites
npx playwright test test/e2e/setup-audio-gold.spec.js
npx playwright test test/e2e/jaw-animation-ui.spec.js
npx playwright test test/e2e/navigation-complete.spec.js
npx playwright test test/e2e/parrot-mode.spec.js
npx playwright test test/e2e/webcam-mjpeg.spec.js

# Hardware integration
./test/orlok-post-reboot-test.sh
```

---

## 📝 COMPLETION CRITERIA

**The agent MUST achieve ALL of the following before marking work complete:**

1. ✅ All Mocha tests passing (100%)
2. ✅ All Playwright tests passing (100%)
3. ✅ Audio output functional (speaker plays sound)
4. ✅ Audio input functional (microphone records)
5. ✅ VU meters display real-time levels
6. ✅ Webcam latency < 1 second
7. ✅ Simple Calibration UI implemented for all moving parts
8. ✅ Jaw Animation uses calibration guardrails
9. ✅ Head Tracking uses calibration guardrails
10. ✅ Demo page fully functional (no console errors)
11. ✅ Full conversation test passes (webcam → STT → AI → TTS → jaw movement)
12. ✅ All hardware parts move within safe ranges

---

## 🚀 EXECUTION PROTOCOL

### Agent Instructions
1. **Read this entire document first**
2. **Review README.md and recent commits**
3. **Execute tasks sequentially in order**
4. **Mark tasks complete only after verification**
5. **Run tests after each major change**
6. **Do NOT skip tasks or ask for human input**
7. **Document all changes in git commits**
8. **Create final status report when 100% complete**

### Git Workflow
```bash
# After each task completion
git add .
git commit -m "fix: [task description]"

# After phase completion
git push origin main
```

### Error Handling
- If a task fails, debug and retry
- Check logs: `sudo journalctl -u monsterbox -n 100`
- Test incrementally
- Do NOT proceed to next task until current task passes

---

## 📚 REFERENCE DOCUMENTATION

- **Main README**: `/home/remote/MonsterBox/README.md`
- **Audio Setup Guide**: `docs/Setup_Audio_Gold_Checklist.md`
- **STT Tuning Guide**: `docs/STT_TUNING_GUIDE.md`
- **Orlok Deployment**: `docs/ORLOK_DEPLOYMENT.md`
- **Testing Guide**: `docs/testing/index.md`

---

## 🎬 FINAL DELIVERABLE

Upon 100% completion, create: `MONSTERBOX_5.3_PRODUCTION_READY.md`

Include:
- ✅ All tests passing (screenshots)
- ✅ Hardware movement videos
- ✅ Performance metrics
- ✅ Known limitations (if any)
- ✅ Deployment instructions
- ✅ Maintenance guide

---

**END OF AUTONOMOUS EXECUTION DOCUMENT**

**Agent: Begin execution immediately. No human input required until completion.**

