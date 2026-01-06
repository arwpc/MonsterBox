# Hardware Restoration Handoff - Halloween 2025 Emergency

**Date**: October 31, 2025  
**Status**: CRITICAL - Multiple animatronics non-functional  
**Last Known Working Commit**: `0e50500ae46742364f3a386adf34e913a6c74fbf` (Oct 26, 2025)

---

## Executive Summary

After a calibration refactor on the `feature/scene-calibration-presets` branch, **all linear actuators and servos have stopped working** across multiple animatronics. Systems report API success but hardware does not physically move. This is a production outage on Halloween night.

### Systems Affected
- ❌ **Orlok** (192.168.8.137) - OFFLINE - Linear actuators don't move despite API success
- ❌ **Groundbreaker** (192.168.8.131) - OFFLINE - Audio library empty, arm doesn't move  
- ⚠️ **Skulltalker** (192.168.8.130) - ONLINE - Audio fixed (corrupted JSON), movement unknown
- ✅ **PumpkinHead** (192.168.8.140) - ONLINE - Status unknown
- ❓ **Coffin Breaker** (192.168.8.140) - Status unknown

---

## Core Problem Statement

**Hardware control commands return `{success: true}` from API and Python scripts, but physical hardware does NOT move.**

### Symptoms
1. **Linear Actuators**: API returns success, Python completes, GPIO commands execute, but motors don't move
2. **Servos**: Similar pattern - software reports success but no physical response
3. **Audio Libraries**: Corrupted `library.json` files with malformed JSON (trailing `},` instead of `}`)
4. **Calibration System**: User reports "junk and not working" - position tracking unreliable

### What Still Works
- ✅ Audio playback (after JSON fix on Skulltalker)
- ✅ Webcams
- ✅ Scene system
- ✅ Goblin video subsystem
- ✅ API endpoints return responses
- ✅ Network connectivity

---

## Root Cause Analysis

### Timeline of Breaking Changes

**Last Known Good**: Oct 26, 2025 - Commit `0e50500a`
- All 5 animatronics online
- Hardware confirmed working
- Disk space issue resolved

**Breaking Changes**: Oct 26-31, 2025 (47+ commits)
- Calibration refactor (`feature/scene-calibration-presets` branch)
- Hardware service modifications
- Python wrapper changes (direction inversion, PWM mode changes)
- Test mode guard changes

### Key File Changes Since Last Working

```
python_wrappers/linear_actuator_control_v2.py
  - Inverted direction logic (DIR=HIGH for forward, was LOW)
  - Changed to digital HIGH mode for speeds ≥80%
  - Increased default PWM frequency 100Hz → 1000Hz
  - Added longer initialization delays

services/hardwareService/index.js
  - Added 'jog' action for linear actuators
  - Removed MB_TEST_MODE guards from servo functions
  - Added console.log debugging throughout
  - Changed timeout from 8s → 30s
  - Modified controlPart() to filter by characterId

services/hardwareService/actuator.js
  - Switched MDD10A control from actuator_cli.py → linear_actuator_control_v2.py
  - Changed command structure entirely

server/calibration/adapters/OpenLoopLinearAdapter.js
  - Added logging
  - Calls hardwareService.controlPart() with 'jog' action

python_wrappers/pca9685_control.py
  - Added I2C bus auto-detection with fallbacks
  - Changed from fixed bus 1 to trying [1, 0, 20, 21]
```

---

## Diagnostic Evidence

### API Layer Test Results
```bash
# Orlok Right Arm (character 3, part 3-right-arm-actuator)
curl -X POST http://192.168.8.137:3000/api/parts/3-right-arm-actuator/operate \
  -H 'Content-Type: application/json' \
  -d '{"action":"extend","speed":100,"duration":5000}'

Response: {"success": true, ...}
Physical Result: NO MOVEMENT
```

### Python Layer Test Results
```bash
# Direct Python script execution
python3 linear_actuator_control_v2.py '{"controlBoard":"MDD10A","directionPin":23,"pwmPin":12,"direction":"forward","speed":100,"duration":5000}'

Logs:
- Direction set to forward (pin 23 = 1 - inverted)
- Using digital HIGH mode for speed 100%
- PWM pin 12 set HIGH
- Motor stopped, pins reset to LOW
Exit Code: 0 (SUCCESS)

Physical Result: NO MOVEMENT
```

### Hardware Configuration
```json
// Orlok Right Arm Actuator (from parts.json)
{
  "id": "3-right-arm-actuator",
  "characterId": 3,
  "name": "Right Arm",
  "type": "linear_actuator",
  "controlBoard": "MDD10A",
  "directionPin": 23,
  "pwmPin": 12,
  "enabled": true
}
```

### Audio Library Issue (RESOLVED on Skulltalker)
```bash
# Problem: library.json ended with },  instead of }
tail -3 data/audio-library/library.json
  ],
  "totalFiles": 80
},

# Solution:
sed -i '$ s/},$/}/' data/audio-library/library.json

# Result: API now returns 80 files successfully
```

---

## Hypotheses for Hardware Failure

### Theory 1: Direction Inversion Broken
The direction inversion change (DIR=HIGH for forward) may be incorrect:
- Original code: `dir_value = 0 if dir_norm == 'forward' else 1`
- New code: `dir_value = 1 if dir_norm == 'forward' else 0`
- **If wiring expects LOW=forward, motors won't move with HIGH**

### Theory 2: Digital HIGH Mode Incompatible
Changed from software PWM to digital HIGH for speeds ≥80%:
- MDD10A boards may need PWM signal, not constant HIGH
- Some motor controllers interpret constant HIGH as brake/coast
- **High-speed mode may be sending wrong signal**

### Theory 3: Power Supply Issues
- 12V power supply may be off/disconnected
- GPIO voltage levels insufficient to trigger motor drivers
- **Physical hardware issue, not software**

### Theory 4: I2C Bus Changes Broke Servos
PCA9685 initialization changed to auto-detect bus:
- May be selecting wrong bus (0, 20, 21 instead of 1)
- Bus conflicts if multiple devices respond
- **Servo commands going to wrong I2C device**

### Theory 5: Calibration Position Conflicts
New calibration system may be blocking movements:
- Safety bounds incorrectly set
- Position state tracking wrong
- **Software thinks actuator is at limit when it's not**

### Theory 6: GPIO Cleanup/Initialization Order
Added `lgpio.gpio_write(self.h, dir_pin, 0)` during stop:
- May be resetting GPIO mode incorrectly
- Initialization delays changed (0.05s → 0.1s)
- **GPIO pins in wrong state before movement starts**

---

## Restoration Strategy

### Phase 1: Systematic Rollback (RECOMMENDED)
**Goal**: Restore hardware control to last known working state while preserving non-hardware features

1. **Create Testing Branch**
   ```bash
   git checkout -b hardware-restoration-halloween-2025
   ```

2. **Identify Hardware-Only Files**
   ```
   services/hardwareService/index.js
   services/hardwareService/actuator.js
   services/hardwareService/exec.js
   python_wrappers/linear_actuator_control_v2.py
   python_wrappers/pca9685_control.py
   python_wrappers/actuator_cli.py
   server/calibration/adapters/OpenLoopLinearAdapter.js
   ```

3. **Selective Rollback**
   ```bash
   # Restore ONLY hardware control files to last working commit
   git checkout 0e50500a -- python_wrappers/linear_actuator_control_v2.py
   git checkout 0e50500a -- python_wrappers/pca9685_control.py
   git checkout 0e50500a -- services/hardwareService/actuator.js
   
   # DO NOT rollback these (preserve improvements):
   # - data/audio-library/* (keep fixed JSON)
   # - routes/scenes.js (keep scene improvements)
   # - goblin/* (keep goblin system)
   # - views/orchestration.ejs (keep webcam improvements)
   ```

4. **Test Immediately**
   ```bash
   # Test on Coffin Breaker (dev machine) first
   curl -X POST http://localhost:3000/api/parts/2-jaw/operate \
     -H 'Content-Type: application/json' \
     -d '{"action":"rotateContinuous","direction":"cw","speed":50,"duration":2000}'
   
   # Verify physical movement occurs
   ```

5. **Deploy to Remote Systems**
   ```bash
   # If Coffin test succeeds, deploy to Orlok
   scp -r python_wrappers/ remote@192.168.8.137:/home/remote/MonsterBox/
   scp -r services/hardwareService/ remote@192.168.8.137:/home/remote/MonsterBox/
   ssh remote@192.168.8.137 "systemctl restart monsterbox"
   ```

### Phase 2: Targeted Fixes (If Rollback Works)
Once hardware is moving again, reintroduce changes one at a time:

1. **Test Direction Logic**
   - Create test script that tries both HIGH and LOW for forward
   - Determine correct polarity for each actuator
   - Document in parts.json with `invertDirection: true/false`

2. **Test PWM vs Digital HIGH**
   - Compare software PWM vs digital HIGH at 100% speed
   - Measure with oscilloscope if available
   - Choose method that produces reliable movement

3. **Fix Calibration System**
   - User reports calibration system is "junk"
   - Position tracking unreliable
   - Consider moving to encoder-based absolute positioning

### Phase 3: Audio Library Fixes
**Groundbreaker Audio** (when system comes online):
```bash
ssh remote@192.168.8.131
cd /home/remote/MonsterBox
# Check for same JSON corruption
tail -3 data/audio-library/library.json
# If corrupted:
sed -i '$ s/},$/}/' data/audio-library/library.json
# Verify:
curl -s http://localhost:3000/audio-library/api/library | jq '{success, totalFiles}'
```

---

## Testing Protocol

### Minimal Movement Test
Test on **Coffin Breaker** (dev machine) first before deploying to remote Pis:

```bash
#!/bin/bash
# test-minimal-hardware.sh

echo "Testing Jaw Servo (Coffin Breaker)..."
curl -X POST http://localhost:3000/api/parts/2-jaw/operate \
  -H 'Content-Type: application/json' \
  -d '{"action":"rotateContinuous","direction":"cw","speed":50,"duration":2000}' | jq

echo -e "\nWaiting 3 seconds..."
sleep 3

echo "Testing Head Turn Servo..."
curl -X POST http://localhost:3000/api/parts/2-head-turn/operate \
  -H 'Content-Type: application/json' \
  -d '{"action":"moveToAngle","angleDeg":90,"duration":1000}' | jq

# IF AND ONLY IF servos work, test actuator
echo -e "\nIf servos worked, test actuator manually:"
echo "curl -X POST http://192.168.8.137:3000/api/parts/3-right-arm-actuator/operate \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"action\":\"extend\",\"speed\":100\",\"duration\":3000}'"
```

### Success Criteria
- ✅ Servo makes audible movement sound
- ✅ Actuator extends/retracts visibly
- ✅ API returns success AND hardware moves
- ✅ Movement stops after duration expires
- ✅ No GPIO errors in logs

---

## Files to Preserve (DO NOT ROLLBACK)

These files contain working improvements and should NOT be reverted:

### Audio System
- `data/audio-library/library.json` - Fixed JSON structure on Skulltalker
- `services/audioLibraryService.js` - Working audio catalog service
- `routes/audioLibrary.js` - Working API endpoints

### Scene System  
- `routes/scenes.js` - Scene improvements
- `data/scene-templates.json` - Template system
- `views/scenes/*.ejs` - Scene editor UI

### Goblin System
- `goblin/` - Video playback subsystem
- `goblin-system/` - Management interface
- `data/goblin-playlists.json` - Playlist data

### Webcam System
- `controllers/webcamController.js` - Webcam improvements
- `routes/webcam.js` - Working endpoints
- `views/orchestration.ejs` - Webcam toggle buttons

### Documentation
- `README.md` - Updated docs
- `.github/copilot-instructions.md` - Agent guidance
- All `*.md` status reports

---

## Environment Variables

Key environment flags that affect hardware:

```bash
# Test mode - simulates hardware calls (SHOULD BE OFF FOR REAL HARDWARE)
MB_TEST_MODE=0

# Hardware available flag - allows hardware in test mode
MONSTERBOX_HARDWARE_AVAILABLE=1

# Force specific I2C bus (if needed)
MB_I2C_BUS=1

# Disable MCP calls during tests
MB_NO_MCP=1
```

**CRITICAL**: Ensure `MB_TEST_MODE` is NOT set or is `0` on production systems!

---

## Known Issues (Pre-existing)

1. **Calibration System**: User reports it's "junk" - position tracking unreliable, consider refactor
2. **IP Address Conflicts**: Multiple animatronics using same IPs in different configs
3. **Offline Systems**: Orlok and Groundbreaker frequently offline (power/network issues?)
4. **JSON Corruption**: Audio library JSON files becoming corrupted (unknown cause)

---

## Agent Prompt for Next Session

```
MISSION: Restore hardware movement to MonsterBox animatronics for Halloween 2025.

CONTEXT:
- Last working commit: 0e50500ae46742364f3a386adf34e913a6c74fbf (Oct 26)
- Current state: APIs return success but hardware doesn't move (servos, linear actuators)
- Systems affected: Orlok, Groundbreaker (both offline), possibly others
- Audio library fixed on Skulltalker (JSON corruption resolved)

APPROACH:
1. Create branch: hardware-restoration-halloween-2025
2. Selective rollback of ONLY hardware control files to commit 0e50500a:
   - python_wrappers/linear_actuator_control_v2.py
   - python_wrappers/pca9685_control.py  
   - services/hardwareService/actuator.js
3. Test on Coffin Breaker (dev machine) FIRST before deploying
4. Verify physical movement occurs (not just API success)
5. Deploy to remote systems only after local test confirms movement

PRESERVE (do not rollback):
- data/audio-library/* (fixed JSON)
- routes/scenes.js (scene improvements)
- goblin/* (video system)
- views/orchestration.ejs (webcam toggles)
- All documentation

TEST SCRIPT:
```bash
# On Coffin Breaker (localhost)
curl -X POST http://localhost:3000/api/parts/2-jaw/operate \
  -H 'Content-Type: application/json' \
  -d '{"action":"rotateContinuous","direction":"cw","speed":50,"duration":2000}'
```

SUCCESS CRITERIA:
- Servo makes audible sound and moves
- Movement stops after 2 seconds
- No errors in logs

FILE: /home/remote/MonsterBox/HARDWARE_RESTORATION_HANDOFF.md has full details.

Start by creating the branch and checking git diff between 0e50500a and HEAD for the hardware files.
```

---

## Contact & Notes

- **User frustration level**: EXTREME - Halloween production outage
- **User quote**: "Thanks for ruining halloween. Fix it or not I don't care. Fail."
- **Time pressure**: Halloween night - need immediate resolution
- **Technical debt**: Calibration system needs complete refactor after emergency fix
- **Agent recommendation**: Take systematic, reversible approach - no cowboy fixes

---

## Appendix: Git Commit Summary

Recent commits between working state and now (truncated):

```
c5d9a2f3 fix: invert MDD10A direction logic for Right Arm
5566c3b9 fix: improve MDD10A timing and add direct test script  
78b882a8 fix: use digital HIGH for MDD10A at high speeds instead of software PWM
15b4858a debug: add detailed logging for actuator control timing
da307f2b docs: add Halloween 2025 emergency fix documentation
7cf63ea5 fix: restore hardware control - servo and actuator commands now work
8f751c07 debug: add logging to track character parts loading
6d96a3c1 fix: filter global parts.json by characterId to avoid cross-character part conflicts
58a987ca Fix test script for ES modules
f471a8c8 EMERGENCY FIX: Restore hardware control for Halloween - remove test mode guards
c2b2a717 Fucked Halloween  <-- USER COMMIT INDICATING BREAKAGE
```

Note commit `c2b2a717` with message "Fucked Halloween" - this is likely when user realized hardware was broken.

---

**END OF HANDOFF DOCUMENT**
