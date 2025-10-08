# BTS7960 Motor Driver - Complete Implementation Summary

## 🎉 Status: COMPLETE AND TESTED

This document summarizes the complete end-to-end implementation of BTS7960 motor driver support in MonsterBox 5.2, including the successful Groundbreaker Head motor integration.

---

## 🔧 What Was Fixed

### 1. Hardware Service - Character-Specific Parts Loading
**File:** `services/hardwareService/index.js`

**Problem:** The `controlPart` function was only loading parts from `data/parts.json`, not character-specific parts files like `data/character-5/parts.json`.

**Solution:** Modified the function to:
1. Load current character ID from `data/current-character.json`
2. Try loading from `data/character-{id}/parts.json` first
3. Fall back to global `data/parts.json` if not found

**Lines Changed:** 1296-1344

```javascript
// Now loads character-specific parts first
if (characterId) {
    const characterPartsPath = path.resolve(appRoot, dataDir, `character-${characterId}`, 'parts.json');
    const partsData = await fs.readFile(characterPartsPath, 'utf8');
    parts = JSON.parse(partsData);
    part = parts.find(p => String(p.id) === String(partId));
}
```

---

### 2. Hardware Service - BTS7960 Pin Normalization for Motors
**File:** `services/hardwareService/index.js`

**Problem:** The motor type normalization (lines 1361-1365) only handled MDD10A/Cytron pins (directionPin, pwmPin) but not BTS7960 pins (rpwmPin, lpwmPin, renPin, lenPin, controlBoard).

**Solution:** Added BTS7960 pin normalization for motors (similar to linear_actuator implementation):

**Lines Changed:** 1396-1408

```javascript
if (type === 'motor') {
    // MDD10A/Cytron pins
    if (part.directionPin != null) normalized.directionPin = Number(part.directionPin);
    if (part.pwmPin != null) normalized.pwmPin = Number(part.pwmPin);
    // BTS7960 pins (same as linear actuator)
    if (part.rpwmPin != null) normalized.rpwmPin = Number(part.rpwmPin);
    if (part.lpwmPin != null) normalized.lpwmPin = Number(part.lpwmPin);
    if (part.renPin != null) normalized.renPin = Number(part.renPin);
    if (part.lenPin != null) normalized.lenPin = Number(part.lenPin);
    // Board type and limits
    if (part.controlBoard != null) normalized.controlBoard = part.controlBoard;
    if (part.maxDuration != null) normalized.maxDuration = Number(part.maxDuration);
}
```

---

### 3. Groundbreaker Head Part Configuration
**File:** `data/character-5/parts.json`

**Changes:**
- Renamed "Groundbreaker Motor" → "Groundbreaker Head"
- Updated description to clarify it's for head movement
- Updated timestamp

**Configuration:**
```json
{
  "id": "1",
  "name": "Groundbreaker Head",
  "type": "motor",
  "description": "BTS7960 motor driver for Groundbreaker head movement - Jeep Wagoneer wiper motor (GPIO 17=EN, 27=RPWM, 22=LPWM)",
  "controlBoard": "BTS7960",
  "rpwmPin": 27,
  "lpwmPin": 22,
  "renPin": 17,
  "lenPin": 17,
  "maxDuration": 10000,
  "modelId": "motor_jeep_wagoneer_wiper"
}
```

---

## ✅ What Was Verified

### 1. Hardware Control (Python Wrapper)
**Test:** Direct Python script execution
```bash
python3 python_wrappers/linear_actuator_control_v2.py '{"controlBoard":"BTS7960","rpwmPin":27,"lpwmPin":22,"renPin":17,"lenPin":17,"direction":"forward","speed":50,"duration":2000}'
```
**Result:** ✅ SUCCESS - Motor moved forward for 2 seconds

---

### 2. API Control (HTTP Endpoint)
**Test:** Motor control via REST API
```bash
curl -X POST http://localhost:3000/setup/parts/api/parts/1/test \
  -H "Content-Type: application/json" \
  -d '{"action":"control","params":{"direction":"forward","speed":50,"duration":2000}}'
```
**Result:** ✅ SUCCESS
```json
{
  "success": true,
  "message": "✅ Test completed for Groundbreaker Head: Motor forward at 50%",
  "testResult": {
    "result": "HARDWARE_SUCCESS",
    "details": {
      "success": true,
      "partType": "motor",
      "rpwmPin": 27,
      "lpwmPin": 22,
      "controlBoard": "BTS7960",
      "direction": "forward",
      "speed": 50,
      "duration": 2000
    }
  }
}
```

---

### 3. CRUD Operations
All CRUD operations tested and verified:

#### CREATE
```bash
curl -X POST http://localhost:3000/setup/parts/api/parts \
  -H "Content-Type: application/json" \
  -d '{"name":"Test BTS7960 Motor","type":"motor","controlBoard":"BTS7960","rpwmPin":23,"lpwmPin":24,"renPin":25,"lenPin":25}'
```
**Result:** ✅ Part created with ID 2

#### READ
```bash
curl http://localhost:3000/setup/parts/api/parts/1
```
**Result:** ✅ Retrieved Groundbreaker Head with all BTS7960 pins

#### UPDATE
```bash
curl -X PUT http://localhost:3000/setup/parts/api/parts/2 \
  -H "Content-Type: application/json" \
  -d '{"rpwmPin":26,"lpwmPin":27,"renPin":28,"lenPin":28}'
```
**Result:** ✅ Pins updated successfully

#### DELETE
```bash
curl -X DELETE http://localhost:3000/setup/parts/api/parts/2
```
**Result:** ✅ Part deleted successfully

---

### 4. Comprehensive Test Suite
**File:** `tests/bts7960-motor-comprehensive.test.js`

**Test Results:** 12/12 tests passed ✅

```
BTS7960 Motor - Comprehensive CRUD & Control
  CREATE - BTS7960 Motor Part
    ✔ should create a BTS7960 motor with all required pins
    ✔ should create a BTS7960 motor with ganged enable pins
  READ - BTS7960 Motor Part
    ✔ should retrieve a BTS7960 motor by ID
    ✔ should list all parts including BTS7960 motors
  UPDATE - BTS7960 Motor Part
    ✔ should update BTS7960 motor pins
    ✔ should update BTS7960 motor name and description
    ✔ should update maxDuration setting
  CONTROL - BTS7960 Motor Hardware
    ✔ should test motor forward direction (1266ms)
    ✔ should test motor reverse direction (1251ms)
    ✔ should test motor stop (428ms)
    ✔ should test motor with different speeds (3080ms)
  DELETE - BTS7960 Motor Part
    ✔ should delete the BTS7960 motor part
  INTEGRATION - Groundbreaker Head
    ✔ should verify Groundbreaker Head part exists
```

---

## 🎯 BTS7960 Wiring Reference

### Groundbreaker Head Configuration
| Connection | Raspberry Pi | BTS7960 Board | Purpose |
|------------|--------------|---------------|---------|
| Red wire | GPIO 27 (Pin 13) | RPWM | Forward PWM control |
| Orange wire | GPIO 22 (Pin 15) | LPWM | Reverse PWM control |
| Brown wire | GPIO 17 (Pin 11) | R_EN + L_EN (ganged) | Enable both sides |
| 5V | Pi 5V | VCC | Logic power |
| GND | Pi GND | GND | Common ground |
| 12V+ | PSU + | B+ | Motor power |
| 12V- | PSU - | B- | Motor ground |
| Motor+ | - | M+ | Motor positive |
| Motor- | - | M- | Motor negative |

**Critical:** Both R_EN and L_EN must be HIGH for the motor to work. GPIO 17 is connected to BOTH enable pins (ganged together).

---

## 📋 Calibration UI Features

### Add Part Modal
**File:** `views/setup/calibration.ejs` (lines 1627-1718)

Features:
- ✅ Control Board dropdown (MDD10A vs BTS7960)
- ✅ Dynamic field switching based on board type
- ✅ BTS7960 fields: RPWM Pin, LPWM Pin, R_EN Pin, L_EN Pin
- ✅ MDD10A fields: Direction Pin, PWM Pin
- ✅ Max Duration setting
- ✅ Model selection

### Edit Part Form
**File:** `views/setup/calibration.ejs` (lines 2900-2960)

Features:
- ✅ Control Board selector
- ✅ Separate input fields for all BTS7960 pins
- ✅ Pin validation (1-40)
- ✅ Save functionality with proper pin normalization
- ✅ Load existing values correctly

### Controls Tab
**File:** `views/setup/calibration.ejs` (lines 714-731)

Features:
- ✅ Direction selector (Forward/Reverse)
- ✅ Speed control (0-100%)
- ✅ Duration control (milliseconds)
- ✅ Run button
- ✅ Status feedback
- ✅ API integration with `/setup/parts/api/parts/:id/test`

---

## 🚀 How to Use

### 1. Add a New BTS7960 Motor
1. Navigate to Setup → Calibration
2. Click "Add Part"
3. Select type: "Motor"
4. Select Control Board: "BTS7960"
5. Enter pins:
   - RPWM Pin (forward PWM)
   - LPWM Pin (reverse PWM)
   - R_EN Pin (right enable)
   - L_EN Pin (left enable)
6. Set Max Duration (safety limit in ms)
7. Click "Create Part"

### 2. Edit an Existing BTS7960 Motor
1. Navigate to Setup → Calibration
2. Select the motor part from the list
3. Click "Edit" tab
4. Modify pins or settings
5. Click "Save Changes"

### 3. Test the Motor
1. Navigate to Setup → Calibration
2. Select the motor part
3. Click "Controls" tab
4. Select direction (Forward/Reverse)
5. Set speed (0-100%)
6. Set duration (milliseconds)
7. Click "Run"

---

## 🔍 Technical Details

### Motor Control Flow
1. **Web UI** → User clicks "Run" in Controls tab
2. **API Call** → `POST /setup/parts/api/parts/:id/test`
3. **Parts Controller** → `testPart()` function validates and routes
4. **Hardware Service** → `controlPart()` loads part config
5. **Pin Normalization** → Extracts BTS7960 pins from part data
6. **Motor Controller** → Detects BTS7960 board type
7. **Python Wrapper** → Calls `linear_actuator_control_v2.py` with JSON config
8. **GPIO Control** → lgpio library controls GPIO pins
9. **Response** → Success/failure returned to UI

### Key Code Paths
- **Add Part:** `calibration.ejs` → `POST /setup/parts/api/parts` → `partsController.createPart()`
- **Edit Part:** `calibration.ejs` → `PUT /setup/parts/api/parts/:id` → `partsController.updatePart()`
- **Test Part:** `calibration.ejs` → `POST /setup/parts/api/parts/:id/test` → `partsController.testPart()` → `hardwareService.controlPart()` → `HARDWARE_CONTROLLERS.motor.control()`

---

## 📝 Files Modified

1. `services/hardwareService/index.js` - Character-specific parts loading + BTS7960 pin normalization
2. `data/character-5/parts.json` - Renamed to "Groundbreaker Head"
3. `tests/bts7960-motor-comprehensive.test.js` - New comprehensive test suite (NEW FILE)
4. `BTS7960_MOTOR_IMPLEMENTATION.md` - This documentation (NEW FILE)

---

## ✨ Summary

The BTS7960 motor driver is now **fully integrated** into MonsterBox 5.2 with:
- ✅ Complete CRUD operations (Create, Read, Update, Delete)
- ✅ Hardware control (Forward, Reverse, Stop)
- ✅ Calibration UI support (Add, Edit, Test)
- ✅ Character-specific parts support
- ✅ Comprehensive test coverage
- ✅ Working Groundbreaker Head motor

**The Groundbreaker Head motor is operational and ready for use in scenes and poses!** 🎃

