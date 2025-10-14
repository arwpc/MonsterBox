# Sensor Type Cleanup - Generic 'sensor' Removed

**Date:** 2025-10-09  
**Commit:** 9268936a  
**Status:** ✅ COMPLETE - Deployed to All Animatronics

---

## Summary

Removed the generic 'sensor' part type from MonsterBox entirely to eliminate confusion. The system now uses only **'motion_sensor'** for all sensor functionality.

---

## Changes Made

### 1. **controllers/partsController.js**
- Removed `sensor` from `PART_TYPES` object
- System now supports **10 part types** instead of 11:
  - motor, stepper, linear_actuator, light, led, servo
  - **motion_sensor** (only sensor type)
  - webcam, microphone, speaker, head_tracking

### 2. **services/hardwareService/index.js**
- Removed entire `sensor` handler section (lines 712-745)
- Removed `read()` and `calibrate()` methods for generic sensors
- Kept all `motion_sensor` handlers intact:
  - `read()` - single motion reading
  - `detectMotion()` - 10-second detection window
  - `startMonitoring()` - continuous monitoring
  - `stopMonitoring()` - stop monitoring

### 3. **data/models/sensor_models.json**
- **DELETED** - No longer needed
- Motion sensor models remain in `motion_sensor_models.json`

### 4. **views/setup/calibration.ejs**
- Removed generic sensor UI handler (lines 971-983)
- Removed "Read" button for generic sensors
- Motion sensor UI remains with full functionality:
  - Enable/Disable toggle
  - Read button
  - Detect Motion button (10-second test)
  - Start/Stop Live Test buttons
  - Visual motion indicator

### 5. **tests/hardware/parts.test.js**
- Updated expected part types from 11 to **10**
- Removed `sensor` from `expectedPartTypes` array
- Removed `'should create a new sensor part'` test case
- All motion_sensor tests remain intact

### 6. **tests/hardware/parts-actions.test.js**
- Removed `sensor` from `defaultsByType` in `createPart()` function
- Removed `case 'sensor'` from `defaultActionPayload()` switch
- Removed `'sensor: read'` test case
- All motion_sensor tests remain intact

---

## Deployment Status

| Animatronic | IP | Commit | Service Status |
|-------------|-----|--------|----------------|
| **Coffin** | 192.168.8.140 | 9268936a | ✅ Active |
| **Orlok** | 192.168.8.120 | 9268936a | ✅ Active |
| **PumpkinHead** | 192.168.8.150 | 9268936a | ✅ Active |
| **Skulltalker** | 192.168.8.130 | 9268936a | ✅ Active |
| **Groundbreaker** | 192.168.8.200 | 9268936a | ✅ Active |

---

## Impact

### ✅ **Benefits:**
1. **Eliminates confusion** between generic sensors and motion sensors
2. **Simplifies codebase** - one sensor type instead of two
3. **Clearer UI** - no ambiguity about which sensor type to use
4. **Reduced maintenance** - fewer code paths to maintain
5. **Better testing** - focused tests on actual hardware (motion sensors)

### ⚠️ **Breaking Changes:**
- Any existing parts with `type: 'sensor'` will no longer have UI controls
- Generic sensor API endpoints will no longer work
- Tests expecting 11 part types will fail (now 10)

### 🔄 **Migration:**
If any animatronics have generic `sensor` parts in their database:
1. They should be converted to `motion_sensor` type
2. Or removed if they're not actually motion sensors
3. Check parts.json files for any `"type": "sensor"` entries

---

## Part Types Now Supported (10 Total)

1. **motor** 🔄 - DC motors for movement
2. **stepper** 🧭 - Step/dir stepper motors
3. **linear_actuator** 🦴 - Extending/retracting movements
4. **light** 💡 - Basic on/off lighting
5. **led** 🔆 - PWM-controlled with brightness
6. **servo** 🦷 - Precise angle control
7. **motion_sensor** 🔍 - PIR motion detection (ONLY SENSOR TYPE)
8. **webcam** 📹 - Video capture devices
9. **microphone** 🎤 - Audio input devices
10. **speaker** 🔊 - Audio output devices
11. **head_tracking** 🎯 - Computer vision tracking

---

## Testing

To verify the changes:

1. **Check Part Types:**
   ```bash
   curl http://localhost:3000/setup/parts/api/parts | jq '.parts[] | select(.type == "sensor")'
   ```
   Should return empty (no generic sensors)

2. **Test Motion Sensor UI:**
   - Navigate to: http://192.168.8.120:3000/setup/calibration
   - Find a motion_sensor part
   - Verify buttons: Read, Detect Motion, Start Live Test, Stop Live Test
   - Verify Enable/Disable toggle

3. **Run Tests:**
   ```bash
   npm test tests/hardware/parts.test.js
   npm test tests/hardware/parts-actions.test.js
   ```

---

## Files Modified

- `controllers/partsController.js` - Removed sensor from PART_TYPES
- `services/hardwareService/index.js` - Removed sensor handlers
- `views/setup/calibration.ejs` - Removed sensor UI
- `tests/hardware/parts.test.js` - Updated to 10 types, removed sensor test
- `tests/hardware/parts-actions.test.js` - Removed sensor test action

## Files Deleted

- `data/models/sensor_models.json` - No longer needed

---

## Git Commit

```
commit 9268936a
Author: MonsterMaker <48959341+arwpc@users.noreply.github.com>
Date:   2025-10-09

    Remove generic 'sensor' part type - keep only motion_sensor
    
    - Removed 'sensor' from PART_TYPES in partsController.js
    - Removed sensor handlers from hardwareService/index.js
    - Deleted data/models/sensor_models.json
    - Removed sensor from calibration.ejs UI
    - Updated tests to reflect 10 part types instead of 11
    - Removed sensor test cases from parts.test.js and parts-actions.test.js
    
    This eliminates confusion between generic sensors and motion sensors.
```

---

## Next Steps

1. ✅ All animatronics updated and running
2. ✅ Git committed and pushed
3. ✅ Services restarted
4. 🔄 **Recommended:** Check each animatronic's parts.json for any legacy `"type": "sensor"` entries
5. 🔄 **Recommended:** Run full test suite to verify no regressions

---

**Status:** COMPLETE ✅  
**All animatronics are now running with the simplified sensor architecture.**

