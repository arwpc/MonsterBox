# Motion Sensor Testing Implementation

## Overview

Enhanced the MonsterBox 4.0 Parts drawer with **visual motion detection testing** for PIR Motion Sensors. The implementation provides real-time visual feedback with color-coded indicators:

- **🟢 Green**: No motion detected
- **🔴 Bright Red**: Motion detected

## Implementation Details

### 1. Enhanced UI Components

**Location**: `views/setup/parts.ejs` (lines 1697-1713)

```html
<!-- Motion Sensor Test Controls -->
<div class="btn-group btn-group-sm" role="group" data-testid="motion-controls">
    <button class="btn btn-primary" onclick="sendPartAction(...)">Read</button>
    <button class="btn btn-outline-secondary" onclick="startMotionMonitoring(...)">Start Monitor</button>
    <button class="btn btn-outline-danger" onclick="stopMotionMonitoring(...)">Stop Monitor</button>
</div>

<!-- Visual Motion Indicator -->
<div class="mt-3" style="max-width:300px">
    <div class="d-flex align-items-center justify-content-center p-3 rounded" 
         id="motion-indicator-{partId}" 
         style="background-color: #28a745; color: white; font-weight: bold; transition: all 0.3s ease;">
        <div class="d-flex align-items-center">
            <div class="me-2" style="width: 20px; height: 20px; border-radius: 50%; 
                 background-color: currentColor; box-shadow: 0 0 10px currentColor;"></div>
            <span id="motion-status-text-{partId}">NO MOTION</span>
        </div>
    </div>
</div>
```

### 2. JavaScript Motion Monitoring Functions

**Location**: `views/setup/parts.ejs` (lines 1826-1919)

#### Key Functions:

- **`startMotionMonitoring(partId, resultId)`**: Begins continuous motion polling
- **`stopMotionMonitoring(partId)`**: Stops monitoring and resets indicator
- **`updateMotionIndicator(partId, motionDetected)`**: Updates visual indicator
- **`updateMotionButtons(partId, isMonitoring)`**: Manages button states

#### Monitoring Logic:

```javascript
// Poll every 500ms for responsive detection
setInterval(function() {
    fetch('/setup/parts/api/parts/' + partId + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', params: {} })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.testResult && data.testResult.details) {
            var motionDetected = data.testResult.details.motionDetected;
            updateMotionIndicator(partId, motionDetected);
        }
    });
}, 500);
```

### 3. Visual Indicator States

#### No Motion (Green)
```css
background-color: #28a745;
color: white;
box-shadow: 0 0 10px rgba(40, 167, 69, 0.4);
```

#### Motion Detected (Bright Red)
```css
background-color: #dc3545;
color: white;
box-shadow: 0 0 20px rgba(220, 53, 69, 0.6);
```

### 4. Hardware Integration

Uses existing MonsterBox hardware service:

- **Hardware Service**: `services/hardwareService/index.js` (lines 574-595)
- **Python Wrapper**: `python_wrappers/sensor_cli.py`
- **GPIO Library**: `lgpio` for direct hardware access

#### Motion Detection Logic:
```python
# PIR sensors typically output HIGH (1) when motion is detected
value = 1 if lgpio.gpio_read(h, pin) == 1 else 0
motionDetected = value === 1
```

## Usage Instructions

### 1. Create Motion Sensor Part

1. Navigate to **Setup → Parts** (`http://localhost:3000/setup/parts`)
2. Click **Create Part**
3. Select **Type**: `motion_sensor`
4. Set **Pin**: `26` (or your PIR sensor GPIO pin)
5. **Name**: "PIR Motion Sensor"
6. **Save**

### 2. Test Motion Detection

1. Find your motion sensor part in the Parts list
2. Click the **Test** button (▶) to open the test drawer
3. Click **Start Monitor** to begin live monitoring
4. **Wave your hand** near the PIR sensor
5. Observe the indicator change:
   - **Green** → **Bright Red** (motion detected)
   - **Bright Red** → **Green** (motion stops)

### 3. Stop Monitoring

- Click **Stop Monitor** button
- Or close the test drawer (automatic cleanup)

## Technical Features

### ✅ Real-time Monitoring
- **500ms polling interval** for responsive detection
- **Automatic cleanup** when drawer closes
- **Error handling** for network/hardware failures

### ✅ Visual Feedback
- **Smooth transitions** (0.3s CSS transitions)
- **Glowing effects** with box-shadow
- **Clear status text** ("NO MOTION" / "MOTION DETECTED")

### ✅ Hardware Safety
- **GPIO pin validation** (0-27 range)
- **Pull-down resistor** configuration
- **Timeout protection** (5-second max)

### ✅ Integration
- **Preserves existing functionality** (single read, 5s poll)
- **Consistent with other part types** (microphone meter pattern)
- **Bootstrap styling** matches MonsterBox theme

## Testing Results

```bash
$ node test-motion-sensor.js

🔍 Testing Motion Sensor Implementation
=====================================

1. Testing sensor_cli.py...
✅ sensor_cli.py test successful:
   Status: success
   Pin: 26
   Value: 0
   Motion Detected: NO

🎯 Motion Sensor Testing Ready!
```

## Files Modified

1. **`views/setup/parts.ejs`**
   - Enhanced motion_sensor test drawer UI
   - Added visual indicator components
   - Implemented JavaScript monitoring functions
   - Added automatic cleanup on drawer close

## Hardware Requirements

- **PIR Motion Sensor** (HC-SR501 or similar)
- **GPIO Connection** (pin 26 recommended)
- **Raspberry Pi 4B** with `lgpio` library
- **Pull-down resistor** (handled in software)

## Future Enhancements

- **Sensitivity adjustment** slider
- **Detection history** log
- **Sound alerts** on motion detection
- **Integration with Scenes** for automated responses

---

**🎃 Ready for Halloween! The motion sensor testing provides immediate visual feedback for building responsive animatronic behaviors.**
