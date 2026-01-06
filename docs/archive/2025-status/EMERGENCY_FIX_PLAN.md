# EMERGENCY FIX PLAN - November 1, 2025

## Context
After a year of work, all 5 animatronics failed on Halloween night. System is completely non-functional:
- Hardware (servos, actuators) don't move AT ALL
- Audio loops don't loop
- Scenes don't complete
- AI responses never reach speakers
- Tests give false confidence

## Root Causes Identified

### 1. Hardware Control (CRITICAL)
- **Issue**: Test mode guards in `exec.js` short-circuit ALL hardware calls
- **Impact**: No servo, no actuator, no movement whatsoever
- **Fix**: Remove blanket test mode check, ensure Python wrappers execute

### 2. Calibration System Regression
- **Issue**: New calibration system broke existing hardware paths
- **Impact**: Commands don't reach hardware even when test mode is off
- **Fix**: Restore direct hardware command execution as in commit 49709b42

### 3. Audio Looping
- **Issue**: No persistent audio playback system
- **Impact**: "Loop" audio stops when page changes
- **Fix**: Create background audio manager with true looping

### 4. Scene Execution
- **Issue**: No error recovery, fails silently
- **Impact**: Scenes never complete, no feedback
- **Fix**: Add retries, timeouts, error handling

### 5. AI Audio Output
- **Issue**: ElevenLabs WebSocket audio never reaches speakers
- **Impact**: AI "works" but is completely inaudible
- **Fix**: Ensure AI audio bypasses queues and plays immediately

## Implementation Order
1. Hardware control restoration (IMMEDIATE)
2. Audio looping fix (IMMEDIATE)  
3. Scene execution robustness (HIGH)
4. AI audio output (HIGH)
5. Test suite cleanup (MEDIUM)

## Success Criteria
✅ All 5 animatronics respond to commands
✅ Audio marked as "loop" plays continuously
✅ Scenes complete or report clear errors
✅ AI responses are AUDIBLE through speakers
✅ Tests actually validate functionality

## Timeline
Target: Complete fixes within 4 hours for tonight's demonstration
