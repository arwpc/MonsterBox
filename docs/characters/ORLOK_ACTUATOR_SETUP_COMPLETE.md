# Orlok Actuator Setup - COMPLETE ✅

## Summary
All three linear actuators have been configured for Orlok with proper board type support:

### 1. Left Arm (Cytron MDD10A)
- **Control Board**: MDD10A/Cytron
- **Direction Pin**: GPIO 18 (Board Pin 12)
- **PWM Pin**: GPIO 13 (Board Pin 33)
- **Status**: ✅ Configured in `data/character-3/parts.json`

### 2. Right Arm (Cytron MDD10A)
- **Control Board**: MDD10A/Cytron  
- **Direction Pin**: GPIO 23 (Board Pin 16)
- **PWM Pin**: GPIO 12 (Board Pin 32)
- **Status**: ✅ Configured in `data/character-3/parts.json`

### 3. Loom Over (BTS7960)
- **Control Board**: BTS7960
- **RPWM Pin**: GPIO 19 (Board Pin 35) - Forward PWM
- **LPWM Pin**: GPIO 21 (Board Pin 40) - Reverse PWM
- **R_EN Pin**: GPIO 5 (Board Pin 29) - Right Enable
- **L_EN Pin**: GPIO 22 (Board Pin 15) - Left Enable
- **Status**: ✅ Configured in `data/character-3/parts.json`

## What Was Done

### 1. Parts Configuration ✅
Updated `data/character-3/parts.json` with:
- Added `controlBoard` field to existing Left and Right Arm actuators (set to "MDD10A")
- Created new "Loom Over" actuator (Part ID 26) with BTS7960 configuration
- All parts properly configured with correct GPIO pins

### 2. Python Control Scripts ✅
Created `python_wrappers/linear_actuator_control_v2.py`:
- Supports multiple board types: MDD10A, Cytron, BTS7960
- Object-oriented design with `LinearActuatorController` class
- Proper GPIO initialization and cleanup
- Software PWM implementation for all board types
- JSON configuration input for flexibility

### 3. Documentation ✅
Created `docs/hardware/ORLOK_BTS7960_WIRING.md`:
- Complete BTS7960 vs MDD10A comparison
- Detailed wiring diagrams
- GPIO pin recommendations
- Control logic explanations
- Safety notes and troubleshooting

### 4. Test Script ✅
Created `scripts/test-orlok-actuators.sh`:
- Tests all three actuators (Left Arm, Right Arm, Loom Over)
- Tests both forward and backward directions
- Configurable speed and duration
- Clear pass/fail indicators

## Testing Instructions

### Option 1: Run Test Script on Orlok
SSH into Orlok and run:
```bash
cd ~/MonsterBox
sudo ./scripts/test-orlok-actuators.sh
```

This will test all three actuators in sequence with 2-second movements at 50% speed.

### Option 2: Manual Testing via Python
Test individual actuators:

**Left Arm (MDD10A):**
```bash
sudo python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "MDD10A",
  "directionPin": 18,
  "pwmPin": 13,
  "direction": "forward",
  "speed": 50,
  "duration": 2000
}'
```

**Right Arm (MDD10A):**
```bash
sudo python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "MDD10A",
  "directionPin": 23,
  "pwmPin": 12,
  "direction": "forward",
  "speed": 50,
  "duration": 2000
}'
```

**Loom Over (BTS7960):**
```bash
sudo python3 python_wrappers/linear_actuator_control_v2.py '{
  "controlBoard": "BTS7960",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "renPin": 5,
  "lenPin": 22,
  "direction": "forward",
  "speed": 50,
  "duration": 2000
}'
```

### Option 3: Test via MonsterBox UI
1. Navigate to http://192.168.8.120:3000/setup/calibration
2. Select "Orlok" character
3. Find each linear actuator in the parts list
4. Use the calibration controls to test movement

## Wiring Verification Checklist

### Left Arm (MDD10A)
- [ ] DIR wire connected to GPIO 18 (Board Pin 12)
- [ ] PWM wire connected to GPIO 13 (Board Pin 33)
- [ ] Motor power connected to MDD10A motor terminals
- [ ] MDD10A power supply connected (6-27V)
- [ ] Common ground between RPi and MDD10A

### Right Arm (MDD10A)
- [ ] DIR wire connected to GPIO 23 (Board Pin 16)
- [ ] PWM wire connected to GPIO 12 (Board Pin 32)
- [ ] Motor power connected to MDD10A motor terminals
- [ ] MDD10A power supply connected (6-27V)
- [ ] Common ground between RPi and MDD10A

### Loom Over (BTS7960)
- [ ] RPWM wire connected to GPIO 19 (Board Pin 35)
- [ ] LPWM wire connected to GPIO 21 (Board Pin 40)
- [ ] R_EN wire connected to GPIO 5 (Board Pin 29)
- [ ] L_EN wire connected to GPIO 22 (Board Pin 15)
- [ ] Motor M+/M- connected to BTS7960 motor terminals
- [ ] BTS7960 B+/B- connected to power supply (6-27V)
- [ ] BTS7960 VCC connected to 5V
- [ ] Common ground between RPi and BTS7960

## Troubleshooting

### No Movement
1. Check power supply to motor drivers
2. Verify GPIO pin connections
3. Check motor connections to driver
4. Verify common ground between RPi and drivers
5. Check if enable pins are HIGH (for BTS7960)

### Movement in Wrong Direction
1. Swap motor wires (M+ and M-)
2. For BTS7960: Swap RPWM and LPWM pins in configuration

### Stuttering or Weak Movement
1. Increase PWM frequency (modify cycle_time in Python script)
2. Check power supply capacity
3. Verify motor driver can handle motor current
4. Check for loose connections

### Only One Direction Works
1. For MDD10A: Check DIR pin connection
2. For BTS7960: Check both RPWM and LPWM connections
3. Verify enable pins are properly configured

## Next Steps

1. **Test the actuators** using one of the methods above
2. **Verify movement** in both directions for all three actuators
3. **Adjust speed/duration** if needed in the test script
4. **Calibrate positions** using the MonsterBox UI calibration page
5. **Create scenes** that use the actuators for coordinated movements

## Files Modified/Created

### Modified:
- `data/character-3/parts.json` - Added board types and new Loom Over part

### Created:
- `python_wrappers/linear_actuator_control_v2.py` - Multi-board actuator control
- `docs/hardware/ORLOK_BTS7960_WIRING.md` - Complete wiring guide
- `scripts/test-orlok-actuators.sh` - Automated test script
- `ORLOK_ACTUATOR_SETUP_COMPLETE.md` - This file

## Git Commit
All changes have been committed and pushed to GitHub:
```
commit 9eee888e
Add BTS7960 motor driver support and Orlok actuator configuration
```

## Support

For issues or questions:
1. Check the wiring guide: `docs/hardware/ORLOK_BTS7960_WIRING.md`
2. Review the test script output for error messages
3. Check GPIO assignments in `data/character-3/parts.json`
4. Verify Python script logs (stderr output shows detailed info)

---

**Status**: ✅ Configuration Complete - Ready for Testing
**Date**: 2025-10-04
**Character**: Orlok (192.168.8.120)

