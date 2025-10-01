# Hardware Integration Layer (HAL) - User Interfaces

## Overview

The Hardware Integration Layer provides consistent and user-friendly interfaces for managing all MonsterBox hardware components. This document describes the enhanced interfaces that replace legacy hardware management while preserving all existing functionality and calibration data.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interfaces                         │
├─────────────────────────────────────────────────────────────┤
│  Web UI          │  REST API        │  WebSocket Services   │
│  /hardware-      │  /api/hardware/* │  ws://localhost:877*  │
│  monitor.html    │                  │                       │
├─────────────────────────────────────────────────────────────┤
│              Hardware Integration Layer (HAL)              │
├─────────────────────────────────────────────────────────────┤
│  Integrated      │  Safety System   │  Device Config       │
│  Hardware System │                  │  Manager             │
├─────────────────────────────────────────────────────────────┤
│  Hardware        │  GPIO Control    │  I2C Communication   │
│  Abstraction     │  System          │  Layer               │
│  Layer           │                  │                      │
├─────────────────────────────────────────────────────────────┤
│                    Physical Hardware                       │
└─────────────────────────────────────────────────────────────┘
```

## Enhanced WebSocket Services

### Motor WebSocket Service (Port 8771)

**Enhanced Features:**
- HAL integration with fallback to legacy mode
- Real-time safety limit enforcement
- Unified device management
- Backward compatibility maintained

**Message Format (Unchanged):**
```json
{
  "type": "motor_control",
  "motor_id": "motor_pin_20",
  "pin": 20,
  "direction": "forward",
  "speed": 50,
  "duration": 1000
}
```

**New HAL Response:**
```json
{
  "type": "motor_control_response",
  "motor_id": "motor_pin_20",
  "status": "success",
  "message": "Motor controlled via HAL",
  "hal_integration": true,
  "safety_checks": "passed",
  "execution_time": 12.5
}
```

### Light WebSocket Service (Port 8772)

**Enhanced Features:**
- HAL-based light control
- Safety system integration
- Preserved sequence functionality
- Legacy compatibility

**Message Format (Unchanged):**
```json
{
  "type": "light_control",
  "light_id": "light_pin_21",
  "pin": 21,
  "state": "on",
  "duration": 2000
}
```

## REST API Endpoints

### Device Discovery
```
GET /api/hardware/devices
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-06-15T20:30:00.000Z",
  "devices": [
    {
      "device_id": "motor_20",
      "device_type": "motor",
      "protocol": "gpio",
      "pin": 20,
      "status": "available",
      "capabilities": ["forward", "backward", "speed_control"],
      "safety_limits": {
        "max_speed": 100,
        "max_duration": 10000
      }
    }
  ],
  "total_devices": 1
}
```

### Unified Device Control
```
POST /api/hardware/devices/{deviceId}/control
```

**Request:**
```json
{
  "command": "control",
  "parameters": {
    "direction": "forward",
    "speed": 75,
    "duration": 2000
  }
}
```

**Response:**
```json
{
  "success": true,
  "device_id": "motor_20",
  "command": "control",
  "parameters": {
    "direction": "forward",
    "speed": 75,
    "duration": 2000
  },
  "timestamp": "2025-06-15T20:30:00.000Z",
  "execution_time": 15.2,
  "safety_checks": "passed"
}
```

### Safety System Status
```
GET /api/hardware/safety
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-06-15T20:30:00.000Z",
  "safety_system": {
    "emergency_stop_active": false,
    "total_safety_limits": 12,
    "total_violations": 0,
    "safety_level": "normal",
    "last_check": "2025-06-15T20:30:00.000Z",
    "active_limits": [
      {
        "component": "motor",
        "limit_type": "max_speed",
        "value": 100
      }
    ]
  }
}
```

### Emergency Stop
```
POST /api/hardware/emergency-stop
```

**Response:**
```json
{
  "success": true,
  "message": "Emergency stop activated",
  "timestamp": "2025-06-15T20:30:00.000Z",
  "affected_devices": ["all"],
  "recovery_required": true
}
```

## Enhanced Hardware Monitor Interface

### New Features

1. **HAL System Status Card**
   - Real-time HAL integration status
   - Safety system monitoring
   - Device manager status

2. **Safety System Controls**
   - Emergency stop button
   - Safety status checking
   - Safety limit viewing
   - System reset functionality

3. **Device Discovery Panel**
   - Automatic device detection
   - Device configuration validation
   - Configuration export/import

4. **Unified Device Control**
   - Single interface for all device types
   - JSON parameter input
   - Real-time command results

5. **Enhanced Testing Suite**
   - HAL integration testing
   - Performance benchmarking
   - Safety stress testing
   - Comprehensive test reporting

### Usage Examples

**Device Discovery:**
```javascript
// Discover all available devices
await discoverDevices();

// Results displayed in device dropdown and discovery panel
```

**Unified Control:**
```javascript
// Control any device through unified interface
const deviceId = "motor_20";
const command = "control";
const parameters = {
  "direction": "forward",
  "speed": 75,
  "duration": 2000
};

await executeDeviceCommand();
```

**Safety Monitoring:**
```javascript
// Check safety system status
await checkSafetyStatus();

// Trigger emergency stop if needed
await emergencyStop();
```

## Character Configuration Migration

### Migration Script

Use the provided migration script to convert existing character configurations:

```bash
python3 scripts/hardware/migrate_character_configs.py
```

### Migration Process

1. **Backup Original Configurations**
   - Automatic backup of `data/characters.json`
   - Preservation of all existing data

2. **Extract Hardware Configurations**
   - Parse animatronic settings
   - Extract ChatterPi jaw configurations
   - Convert hardware requirements

3. **Generate HAL Device Configs**
   - Create device-specific configurations
   - Preserve calibration values
   - Set appropriate safety limits

4. **Validation and Testing**
   - Validate generated configurations
   - Test device functionality
   - Verify safety limits

### Example Migration Output

**Original Character Config:**
```json
{
  "id": 4,
  "char_name": "Orlok",
  "animatronic": {
    "enabled": true,
    "hardware_requirements": {
      "motor": {
        "enabled": true,
        "pins": [20, 21]
      }
    }
  }
}
```

**Generated HAL Config:**
```json
{
  "character_id": 4,
  "character_name": "Orlok",
  "devices": [
    {
      "device_id": "motor_20_4",
      "device_type": "motor",
      "protocol": "gpio",
      "enabled": true,
      "config": {
        "pin": 20,
        "direction_pin": 20,
        "pwm_pin": 21,
        "motor_type": "wiper_motor"
      },
      "calibration": {
        "max_speed": 100,
        "default_speed": 50,
        "acceleration": "medium"
      },
      "metadata": {
        "character_id": 4,
        "part_type": "motor",
        "description": "Motor 1 for character movement"
      }
    }
  ],
  "safety_limits": {
    "motor_20": {
      "max_speed": 100,
      "max_duration": 10000,
      "emergency_stop_enabled": true
    }
  }
}
```

## Backward Compatibility

### Preserved Functionality

1. **WebSocket Message Formats**
   - All existing message types supported
   - Response formats maintained
   - Client code requires no changes

2. **Character Switching**
   - Existing character selection works
   - Hardware requirements honored
   - Service initialization preserved

3. **Calibration Values**
   - All existing calibration data preserved
   - Safety limits maintained
   - Performance characteristics unchanged

### Migration Strategy

1. **Phase 1: Parallel Operation**
   - HAL and legacy systems run simultaneously
   - Automatic fallback to legacy mode
   - Gradual migration of services

2. **Phase 2: HAL Primary**
   - HAL becomes primary system
   - Legacy mode as backup
   - Enhanced features available

3. **Phase 3: HAL Only**
   - Complete migration to HAL
   - Legacy code removal
   - Full feature utilization

## Testing and Validation

### Comprehensive Test Suite

1. **Hardware Integration Tests**
   - Device discovery validation
   - Command execution testing
   - Safety system verification

2. **Performance Benchmarks**
   - Command latency measurement
   - Safety check timing
   - Device response analysis

3. **Safety Stress Tests**
   - Rapid command execution
   - Concurrent device access
   - Emergency stop response

4. **Compatibility Tests**
   - Legacy message format support
   - Character configuration migration
   - Existing application compatibility

### Test Execution

```bash
# Run comprehensive hardware tests
npm test:hardware-comprehensive

# Run HAL-specific tests
npm test:hal-integration

# Generate test reports
npm run test:generate-report
```

## Troubleshooting

### Common Issues

1. **HAL Initialization Failure**
   - Check Python dependencies
   - Verify GPIO permissions
   - Review system logs

2. **Device Discovery Problems**
   - Validate device configurations
   - Check pin assignments
   - Verify hardware connections

3. **Safety System Alerts**
   - Review safety limit violations
   - Check emergency stop status
   - Validate device parameters

### Debug Tools

1. **Hardware Monitor Logs**
   - Real-time activity monitoring
   - Error message display
   - Debug information

2. **API Status Endpoints**
   - Service health checking
   - Device status monitoring
   - Safety system status

3. **MCP Log Collection**
   - Comprehensive log gathering
   - Cross-service analysis
   - Issue diagnosis

## Future Enhancements

### Planned Features

1. **Advanced Device Types**
   - Stepper motor support
   - PWM servo control
   - Sensor integration

2. **Enhanced Safety Features**
   - Predictive safety monitoring
   - Automatic calibration
   - Fault detection

3. **Performance Optimization**
   - Command batching
   - Parallel execution
   - Caching improvements

4. **Extended Monitoring**
   - Performance metrics
   - Usage analytics
   - Predictive maintenance

## Conclusion

The Hardware Integration Layer provides a robust, safe, and user-friendly interface for managing MonsterBox hardware while maintaining complete backward compatibility. The enhanced interfaces offer improved functionality, better safety, and easier management while preserving all existing calibration data and character configurations.
