# Hardware Testing

## Overview

Hardware testing ensures all physical components of MonsterBox animatronics function correctly and safely across different characters and configurations.

## Hardware Test Categories

### 1. GPIO Control Testing
- **Pin Assignment Verification**: Correct GPIO pin mapping
- **Signal Testing**: Digital and PWM signal validation
- **Safety Limits**: Hardware protection and limit testing

### 2. Servo and Motor Testing
- **Position Control**: Accurate servo positioning
- **Speed Control**: Motor speed and direction testing
- **Calibration Verification**: Servo calibration accuracy

### 3. Sensor Testing
- **Data Collection**: Sensor reading accuracy
- **Response Time**: Sensor response timing
- **Environmental Testing**: Various condition testing

### 4. Communication Testing
- **WebSocket Services**: Hardware service communication
- **I2C Communication**: Inter-device communication
- **Network Connectivity**: Remote hardware access

## Running Hardware Tests

### Complete Hardware Test Suite
```bash
npm run test:hardware-services
```

### Individual Hardware Tests
```bash
# GPIO functionality tests
mocha tests/gpio-hardware.test.js

# WebSocket hardware services
npm run test:websockets

# Comprehensive RPi tests
npm run test:comprehensive
```

### Character-Specific Testing
```bash
# Test specific character hardware
node scripts/test-new-animatronic-services.js

# Jaw animation testing
npm run test:jaw-animation
```

## Before You Run These on a Live Node (v9.0.0)

Hardware tests drive **real hardware and real show data** on the node they run on. Two
protections were added after both bit us:

- **Safe-part selection.** Suites that need "a servo" now select through
  `safetyLimits.isTestSafePart()`, which skips parts that are power-grouped, quarantined
  (`blockAllMotion`), or explicitly `excludeFromAutomatedTests`. Before this, the unit suite
  picked Orlok's 150 kg elbow — on a shared fuse — and drove it to both extremes on every
  `npm run test:smoke`, then rewrote its calibration from wherever it parked.
- **Cleanup that cannot leak.** The continuous-servo suite creates a **real** part in the
  running node's `parts.json`. Its cleanup now always runs, never throws, and prints a loud
  notice naming the part to delete by hand if it could not — a failed cleanup used to leave a
  phantom servo pointing at a live PCA9685 channel.

Suites that write calibration snapshot `data/calibration_profiles.json` and restore it
verbatim (not via `upsert()`, which would re-stamp `lastCalibratedAt` and look like an
operator recalibration), so a run leaves zero drift.

> ⚠️ Hardware tests are **not** safe to run unattended against an animatronic with known
> electrical faults. Check `docs/troubleshooting/KNOWN-BUGS.md` for the node's current state
> first.

## Hardware Test Environments

### Development Environment
- **Mock Hardware**: Simulated GPIO operations
- **Virtual Devices**: Software-based device simulation
- **Safe Testing**: No physical hardware risk

### Raspberry Pi Environment
- **Real Hardware**: Actual GPIO and device control
- **Physical Testing**: Real-world operation validation
- **Safety Monitoring**: Hardware protection active

### Production Environment
- **Full Integration**: Complete system testing
- **Performance Testing**: Real-world performance validation
- **Reliability Testing**: Long-term operation testing

## Test Scenarios

### Servo Control Testing
1. **Position Accuracy**: Verify servo reaches target positions
2. **Speed Control**: Test movement speed and smoothness
3. **Limit Testing**: Verify safety limits are enforced
4. **Calibration**: Test calibration accuracy and persistence

### Motor Control Testing
1. **Direction Control**: Forward and reverse operation
2. **Speed Variation**: Variable speed control testing
3. **Load Testing**: Operation under various loads
4. **Safety Shutdown**: Emergency stop functionality

### Sensor Integration Testing
1. **Data Accuracy**: Sensor reading validation
2. **Response Time**: Real-time data collection
3. **Environmental Adaptation**: Various condition testing
4. **Error Handling**: Sensor failure detection

## Hardware Safety Testing

### Safety Protocols
- **Emergency Stop**: Immediate hardware shutdown
- **Limit Enforcement**: Position and speed limits
- **Overcurrent Protection**: Electrical safety
- **Temperature Monitoring**: Thermal protection

### Safety Test Procedures
1. **Limit Testing**: Verify all safety limits
2. **Emergency Procedures**: Test emergency stop functions
3. **Fault Detection**: Hardware fault identification
4. **Recovery Procedures**: Automatic recovery testing

## Hardware Configuration Testing

### Character-Specific Configurations
- **Sir Dragomir**: Jaw servo and webcam testing
- **Orlok**: Linear actuator and lighting testing
- **Mina**: Multi-component coordination

### Configuration Validation
1. **Hardware Mapping**: Verify component assignments
2. **Calibration Values**: Test stored calibration data
3. **Service Initialization**: Character-specific service startup
4. **Integration Testing**: Multi-component coordination

## Hardware Monitoring

### Real-time Monitoring
- **Hardware Monitor**: Web-based status monitoring at `/hardware-monitor.html`
- **Service Status**: WebSocket service health
- **Performance Metrics**: Hardware operation statistics

### Hardware Diagnostics
- **Component Status**: Individual hardware component health
- **Communication Status**: Service communication health
- **Error Reporting**: Hardware error detection and reporting

## Troubleshooting Hardware Issues

### Common Hardware Problems

1. **GPIO Issues**
   - Permission problems
   - Pin assignment conflicts
   - Signal integrity issues

2. **Servo/Motor Problems**
   - Calibration errors
   - Power supply issues
   - Mechanical binding

3. **Communication Issues**
   - WebSocket connection failures
   - I2C communication errors
   - Network connectivity problems

### Hardware Debug Tools

- **GPIO Test Scripts**: Direct GPIO testing
- **Hardware Monitor**: Real-time status display
- **Service Logs**: Detailed operation logging
- **Calibration Tools**: Hardware calibration utilities

## Hardware Test Data

### Test Configurations
- Character-specific hardware setups
- Test servo positions and movements
- Sensor calibration data
- Safety limit configurations

### Test Results
- Hardware performance metrics
- Safety test results
- Calibration accuracy data
- Error logs and diagnostics
