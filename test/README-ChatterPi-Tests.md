# ChatterPi Jaw Animation Test Suite

## Overview
Comprehensive test suite for the ChatterPi jaw animation system covering servo stillness, audio synchronization, full range movement, and service lifecycle.

## Test Coverage

### ✅ Service Lifecycle Tests
- **Service Startup**: Verifies unified jaw animation service starts and is accessible on port 8765
- **Multiple Connections**: Tests handling of multiple concurrent WebSocket client connections
- **Service Shutdown**: Ensures clean service termination

### ✅ Servo Control Tests  
- **Specific Angle Movement**: Tests servo movement to exact angles (30°, 40°, 50°)
- **Full Range Utilization**: Verifies complete 30°-50° range usage with dramatic opening
- **Response Validation**: Confirms servo movement responses and success status

### ✅ Audio Processing Tests
- **Silence Detection**: Validates correct detection of silence with voice_active=false
- **Audio Amplitude Response**: Tests jaw opening response to varying audio levels
- **Voice Activity Detection**: Verifies voice activity transitions and timeout behavior

### ✅ Servo Stillness Tests
- **Extended Silence**: Confirms no servo chattering during 5+ seconds of silence
- **Movement Tracking**: Monitors and validates minimal servo movements during quiet periods
- **Settling Behavior**: Allows for acceptable settling movements (≤2 movements)

## Test Results Summary

```
✓ Service Lifecycle - Service startup and accessibility
✓ Service Lifecycle - Multiple client connections  
✓ Servo Control - Specific angle movements
✓ Servo Control - Full range utilization (30°-50°)
✓ Audio Processing - Silence detection
✓ Audio Processing - Audio amplitude response
✓ Servo Stillness - Extended silence behavior

Total: 7/7 tests passing (100% success rate)
```

## Key Validations

### Anti-Chattering Features ✅
- **Step Threshold**: Only moves servo if angle change ≥1°
- **Silence Detection**: Proper voice activity timeout after 0.5s silence
- **Volume Threshold**: Minimum 0.01 volume required to trigger movement
- **Audio Smoothing**: Exponential smoothing prevents jittery movements

### Full Range Movement ✅
- **Closed Position**: 50° (jaw shut)
- **Open Position**: 30° (jaw wide open)
- **Total Range**: 20° dramatic movement for visibility
- **Intermediate Positions**: Smooth transitions between angles

### Audio-Visual Synchronization ✅
- **Real-time Processing**: Audio amplitude directly controls jaw opening
- **Voice Activity Detection**: Accurate silence/speech detection
- **Smooth Transitions**: Gradual jaw closing during silence decay
- **Responsive Opening**: Immediate jaw opening on audio detection

## Running Tests

```bash
# Run ChatterPi jaw animation tests
npm run test:chatterpi-jaw

# Run with verbose output
cross-env NODE_ENV=test mocha test/chatterpi-jaw-animation.test.js --timeout 60000
```

## Test Architecture

### Service Management
- Automatically starts unified jaw animation service on port 8765
- Waits for service availability before running tests
- Cleanly shuts down service after test completion

### WebSocket Testing
- Direct WebSocket communication with service
- Message format validation (jaw_move → jaw_move_response)
- Asynchronous response handling and timing

### Hardware Simulation
- Tests run in simulation mode (no physical GPIO required)
- Validates servo control logic without hardware dependencies
- Confirms proper angle calculations and range limits

## Integration with CI/CD

These tests are designed to run in automated environments:
- No physical hardware dependencies
- Deterministic timing and behavior
- Clear pass/fail criteria
- Comprehensive error reporting

## Next Steps

1. **Physical Hardware Testing**: Run tests on actual ChatterPi hardware
2. **Performance Testing**: Measure response times and resource usage
3. **Stress Testing**: Test with high-frequency audio data
4. **Integration Testing**: Test with full MonsterBox application stack
