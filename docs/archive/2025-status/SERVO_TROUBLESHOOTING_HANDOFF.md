# Servo Troubleshooting Handoff - Halloween 2025

## CRITICAL STATUS
**Date**: October 31, 2025 (Halloween Night)
**Priority**: URGENT - Trick-or-treaters arriving, animatronics need to work NOW

## What's Working
- ✅ Audio playback loops on all three animatronics (Coffin, Orlok, PumpkinHead)
- ✅ PCA9685 hardware responding to I2C commands (tested, verified)
- ✅ Python-level servo control working (`pca9685_control.py` functions correctly)
- ✅ Node.js API endpoints responding (`/api/calibration/:partId/goto` returns success)
- ✅ Linear actuators working (Coffin door, Orlok arms)
- ✅ LEDs on PCA9685 boards lit (power confirmed)

## The Problem
**Servos report success from API but DO NOT PHYSICALLY MOVE**

### What We Fixed Tonight
1. **Calibration Profile Bug**: Part 4 (Orlok elbow servo) had wrong capability type
   - Was: `"kind": "openloop-linear"` (linear actuator adapter)
   - Fixed to: `"kind": "absolute-servo"` (servo adapter)
   - File: `/home/remote/MonsterBox/data/calibration_profiles.json`
   - Deployed to all three hosts

2. **Hardware Control Flow Verified**:
   - Unified calibration UI calls → `/api/calibration/:partId/goto`
   - Router (`server/calibration/router.js`) → `AbsoluteServoAdapter.gotoNormalized()`
   - Adapter → `hardwareService.controlPart(partId, 'moveToAngle', {angleDeg})`
   - Hardware service → `servo_cli.py move_to_pca`
   - Python script → `pca9685_set_angle()` → I2C writes to PCA9685

### Test Results
```bash
# Direct Python test (WORKS - I2C confirmed)
python3 python_wrappers/pca9685_control.py set_pulse_width 4 1500

# API test (REPORTS SUCCESS)
curl -X POST 'http://localhost:3000/api/calibration/4/goto' \
  -H 'Content-Type: application/json' -d '{"p":0.75,"speedPct":50}'
# Response: {"success":true,"message":"Moved to 0.75","targetP":0.75}

# PCA9685 register readback (CORRECT VALUES STORED)
# MODE1: 0x20, PRESCALE: 121 (50Hz), PWM values read back match writes
```

## Affected Parts (All Three Animatronics)

### Coffin (192.168.8.140)
- Part 1: Jaw servo (channel 4, PCA9685) - Has correct profile
- Part 2: Neck servo (channel 0, PCA9685) - Has correct profile  
- Part 3: Eye servos (channel 2, PCA9685) - Has correct profile

### Orlok (192.168.8.120)
- Part 4: Elbow servo (channel 4, PCA9685) - **JUST FIXED** profile
- Part 5: Forearm rotation servo (channel 5, PCA9685) - Check profile
- Part 10: Jaw servo (channel 8, PCA9685) - Has correct profile
- Part 11: Head continuous servo (channel 0, PCA9685) - Has correct profile

### PumpkinHead (192.168.8.150)
- Check if any servos exist in parts.json

## Diagnostic Evidence
1. **PCA9685 I2C Communication**: Perfect
   - Responds to init, accepts register writes, readback matches
   - PWM registers being set correctly (verified via smbus reads)

2. **Software Stack**: Working
   - All API calls return success
   - Python functions execute without error
   - Adapters routing correctly after profile fix

3. **Power**: Confirmed
   - LEDs on PCA9685 boards are lit (user confirmed)
   - External 5-6V servo power must be connected (LEDs wouldn't work otherwise)

## Unanswered Questions
1. **Why do servos not move despite correct I2C commands?**
   - Hardware receives pulses (PCA9685 outputting PWM)
   - Software reports success
   - User says "this was working before calibration changes"

2. **Are ALL servo channels affected or just some?**
   - Need to test each channel individually
   - May be wiring issue on specific channels

3. **Did servo wiring get disconnected?**
   - Servos must be physically plugged into PCA9685 channels
   - Signal wires (yellow/white) must be on correct pins
   - Ground wires (brown/black) must be connected

4. **Is there a common mode failure?**
   - Both Coffin and Orlok have same issue simultaneously
   - Suggests common configuration bug (which we partially fixed)
   - OR physical issue affecting both (power rail, ground)

## Next Steps (URGENT)
1. **Test one servo channel end-to-end**:
   ```bash
   # On Orlok (192.168.8.120)
   curl -X POST 'http://localhost:3000/api/calibration/4/goto' \
     -H 'Content-Type: application/json' -d '{"p":0.0}'
   sleep 2
   curl -X POST 'http://localhost:3000/api/calibration/4/goto' \
     -H 'Content-Type: application/json' -d '{"p":1.0}'
   ```
   **Ask user: "Did the elbow servo move?"**

2. **If no movement, check physical wiring**:
   - Verify servo plugged into channel 4 on PCA9685
   - Check servo connector orientation (signal/power/ground)
   - Measure voltage at servo connector (should see ~5-6V on power pin)

3. **Verify calibration profiles for ALL servos**:
   ```bash
   # Check each servo part has "absolute-servo" capability
   for partId in 1 2 3 4 5 10 11; do
     curl "http://localhost:3000/api/calibration/$partId/profile" | \
       jq '{partId: .profile.partId, kind: .profile.capability.kind}'
   done
   ```

4. **Test continuous vs standard servo routing**:
   - Part 11 (Orlok head) is continuous servo - different code path
   - Test: `curl -X POST '.../api/calibration/11/goto' -d '{"p":0.5}'`

## Files Modified Tonight
- `/home/remote/MonsterBox/data/calibration_profiles.json` (Part 4 capability fixed)
- Deployed to: 192.168.8.120, 192.168.8.140, 192.168.8.150

## Key Code Locations
- Servo hardware control: `services/hardwareService/index.js` (line 496)
- Calibration router: `server/calibration/router.js` (line 94 - goto endpoint)
- Servo adapter: `server/calibration/adapters/AbsoluteServoAdapter.js`
- Python servo CLI: `python_wrappers/servo_cli.py`
- PCA9685 control: `python_wrappers/pca9685_control.py`

## Critical Context
- User has been working on this for a year
- Halloween night with trick-or-treaters coming
- Only audio is working, no animatronic movement
- User confirmed LEDs are lit (power exists)
- User insists this is NOT a hardware power issue

## What to Tell User
"I've fixed the calibration profile bug that was routing servo commands to the wrong adapter. The API now reports success and I've confirmed the PCA9685 is receiving and storing the correct PWM values. However, the servos still aren't moving physically. This suggests either: (1) servo signal wires aren't connected to the PCA9685 channels, (2) servos themselves are damaged/disconnected, or (3) there's another configuration issue I haven't found yet. Can you physically verify one servo is plugged into the PCA9685 board and we can test that specific channel?"
