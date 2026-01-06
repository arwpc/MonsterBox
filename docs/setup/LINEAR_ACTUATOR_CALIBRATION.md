# Linear Actuator Calibration System

## Overview

I've built a complete calibration system for linear actuators in MonsterBox 5.5. This system allows users to easily define min/max endpoints by moving the actuator into position with simple controls and saving those positions.

## Features Implemented

### 1. **Calibration Service** (`services/linearActuatorCalibrationService.js`)
- Load/save calibration data from `data/linear_actuator_calibrations.json`
- Save min/max positions for each actuator
- Check calibration status
- Reset calibration data

### 2. **Calibration Routes** (`routes/setup/calibration.js`)
- **GET** `/setup/calibration/linear_actuator/:id` - Calibration page for specific actuator
- **POST** `/setup/calibration/api/linear_actuator/:id/jog` - Jog controls (extend/retract)
- **POST** `/setup/calibration/api/linear_actuator/:id/stop` - Emergency stop
- **POST** `/setup/calibration/api/linear_actuator/:id/save-position` - Save min/max positions
- **GET** `/setup/calibration/api/linear_actuator/:id/status` - Get calibration status
- **POST** `/setup/calibration/api/linear_actuator/:id/reset` - Reset calibration

### 3. **Calibration UI** (`views/setup/calibration-linear-actuator.ejs`)
- **Jog Controls**: Extend/Retract buttons with adjustable speed and duration
- **Position Saving**: Save Min/Max position buttons
- **Status Display**: Visual indicators showing which positions are calibrated
- **Safety Features**: Emergency stop button and safety warnings
- **Instructions**: Clear step-by-step calibration guide

### 4. **Parts Integration**
- Added "Calibrate" button to linear actuator parts in the parts list
- Button links directly to the calibration page for that specific actuator

## How to Use

### From the Parts Page
1. Go to `http://localhost:3000/setup/parts`
2. Find your linear actuator part
3. Click the **Calibrate** button (🎚️ icon) next to the Edit and Test buttons

### Calibration Process
1. **Set Speed & Duration**: Adjust jog speed (10-100%) and duration (100-2000ms)
2. **Find Min Position**: Use "Retract" button to move actuator to fully retracted position
3. **Save Min**: Click "Save Min Position" when actuator is at minimum position
4. **Find Max Position**: Use "Extend" button to move actuator to fully extended position  
5. **Save Max**: Click "Save Max Position" when actuator is at maximum position
6. **Verify**: Status indicators will show green checkmarks when positions are saved

### Safety Features
- **Emergency Stop**: Red STOP button immediately halts actuator movement
- **Button Disabling**: Control buttons are disabled during movement to prevent conflicts
- **Duration Limits**: Movement duration is limited to prevent over-extension
- **Speed Control**: Adjustable speed allows for precise positioning

## Data Structure

Calibration data is stored in `data/linear_actuator_calibrations.json`:

```json
{
  "partId": {
    "part_id": "partId",
    "part_name": "Actuator Name",
    "calibrated_date": "2025-01-16T12:00:00.000Z",
    "positions": {
      "min": {
        "description": "Fully retracted position",
        "calibrated": true,
        "calibrated_date": "2025-01-16T12:00:00.000Z"
      },
      "max": {
        "description": "Fully extended position", 
        "calibrated": true,
        "calibrated_date": "2025-01-16T12:00:00.000Z"
      }
    }
  }
}
```

## API Examples

### Jog Actuator
```bash
curl -X POST http://localhost:3000/setup/calibration/api/linear_actuator/2/jog \
  -H "Content-Type: application/json" \
  -d '{"direction": "extend", "speed": 50, "duration": 500}'
```

### Save Position
```bash
curl -X POST http://localhost:3000/setup/calibration/api/linear_actuator/2/save-position \
  -H "Content-Type: application/json" \
  -d '{"position": "min", "description": "Fully retracted position"}'
```

### Get Status
```bash
curl http://localhost:3000/setup/calibration/api/linear_actuator/2/status
```

## Integration with Existing System

The calibration system integrates seamlessly with your existing MonsterBox infrastructure:

- **Uses existing hardware service**: Leverages `services/hardwareService/actuator.js`
- **Follows existing patterns**: Similar structure to servo calibrations
- **Respects part configuration**: Uses existing `directionPin`, `pwmPin`, `maxExtension`, `maxRetraction` settings
- **Bootstrap UI**: Consistent with existing MonsterBox 5.5 dark theme
- **Safety first**: Implements proper error handling and user feedback

## Testing

A comprehensive test suite is included in `tests/hardware/linear-actuator-calibration.test.js` that verifies:
- Calibration page rendering
- Position saving and retrieval
- Status checking
- Calibration reset
- Error handling for invalid inputs

## Next Steps

This system provides the foundation for linear actuator calibration. Future enhancements could include:
- Position feedback integration (if sensors are available)
- Multiple saved positions beyond just min/max
- Calibration verification routines
- Integration with pose system for automated positioning

The system is ready to use with your existing Orlok hardware setup!
