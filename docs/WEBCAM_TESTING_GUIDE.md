# MonsterBox Webcam Testing Guide

## Overview

This guide provides comprehensive instructions for testing webcam functionality in MonsterBox, including hardware detection, configuration, streaming, and error handling. The testing framework combines Playwright for browser automation, MCP for system integration testing, and Mocha for test framework.

## Test Architecture

### Components

1. **Enhanced Webcam Component** (`public/js/enhanced-webcam-component.js`)
   - Modern replacement for legacy webcam functionality
   - Improved error handling and logging
   - Better settings management
   - Comprehensive API integration

2. **MCP Webcam Logger** (`services/mcpWebcamLogger.js`)
   - System-level debugging and performance monitoring
   - Hardware event tracking
   - Detailed logging for troubleshooting

3. **Console Error Monitor** (`public/js/console-error-monitor.js`)
   - Real-time error capture and reporting
   - Webcam-specific error detection
   - Network error monitoring

4. **End-to-End Tests** (`tests/webcam/webcam-e2e.spec.js`)
   - Comprehensive browser automation tests
   - Hardware interaction validation
   - Error scenario testing

## Prerequisites

### System Requirements

- Node.js 16+ with npm
- Playwright browsers installed
- Physical webcam device (for hardware tests)
- Linux system with V4L2 support (recommended)

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Verify webcam hardware
ls -la /dev/video*
v4l2-ctl --list-devices
```

### Environment Setup

```bash
# Set test environment variables
export NODE_ENV=test
export WEBCAM_TEST_MODE=true
export MCP_LOGGING_ENABLED=true

# Create test directories
mkdir -p test-results/{screenshots,reports,logs}
```

## Running Tests

### Quick Test Suite

```bash
# Run all webcam tests
npm run test:webcam

# Run specific test file
npx playwright test tests/webcam/webcam-e2e.spec.js

# Run with enhanced component
npx playwright test tests/webcam/webcam-e2e.spec.js --grep "enhanced"
```

### Detailed Test Execution

```bash
# Run with debugging
npx playwright test tests/webcam/webcam-e2e.spec.js --debug

# Run with video recording
npx playwright test tests/webcam/webcam-e2e.spec.js --video=on

# Run with trace collection
npx playwright test tests/webcam/webcam-e2e.spec.js --trace=on

# Run headless (for CI/CD)
npx playwright test tests/webcam/webcam-e2e.spec.js --headed=false
```

### Test Configuration

The tests can be configured via URL parameters:

```javascript
// Enable enhanced webcam component
http://localhost:3000/parts/webcam/new?characterId=test&enhanced=true

// Enable debug logging
http://localhost:3000/parts/webcam/new?characterId=test&debug=true

// Simulate hardware errors
http://localhost:3000/parts/webcam/new?characterId=test&simulate_errors=true
```

## Test Scenarios

### 1. Camera Detection and Settings Persistence

**Purpose**: Verify camera detection and configuration persistence

**Steps**:
1. Navigate to webcam configuration page
2. Trigger camera detection
3. Configure webcam settings
4. Save configuration
5. Verify settings persistence

**Expected Results**:
- Cameras are detected successfully
- Settings are saved and persist across page reloads
- No console errors during the process

### 2. Webcam Settings Persistence Verification

**Purpose**: Validate that webcam settings are properly saved and restored

**Steps**:
1. Create new webcam configuration
2. Set specific camera parameters
3. Save configuration
4. Navigate away and return
5. Verify settings are restored

**Expected Results**:
- All settings are correctly restored
- Camera controls reflect saved values
- No data loss occurs

### 3. Camera Controls Application and Error Handling

**Purpose**: Test camera control application and error scenarios

**Steps**:
1. Select camera device
2. Apply various camera controls
3. Test invalid control values
4. Verify error handling

**Expected Results**:
- Valid controls are applied successfully
- Invalid controls trigger appropriate errors
- Error messages are user-friendly

### 4. Camera Test Stream Functionality

**Purpose**: Verify camera testing and preview functionality

**Steps**:
1. Select camera device
2. Start camera test
3. Verify preview display
4. Stop camera test
5. Check for resource cleanup

**Expected Results**:
- Camera preview displays correctly
- Test can be started and stopped
- Resources are properly cleaned up

### 5. Streaming Service Integration

**Purpose**: Test integration with streaming services

**Steps**:
1. Configure webcam for streaming
2. Start streaming service
3. Verify stream status
4. Stop streaming service
5. Check for proper cleanup

**Expected Results**:
- Streaming starts successfully
- Status is accurately reported
- Streaming stops cleanly

### 6. Error Handling and Recovery

**Purpose**: Test error scenarios and recovery mechanisms

**Steps**:
1. Simulate various error conditions
2. Test invalid device selection
3. Test network failures
4. Verify error recovery

**Expected Results**:
- Errors are handled gracefully
- User receives clear error messages
- System recovers from errors

### 7. Console Error Monitoring Validation

**Purpose**: Verify error monitoring and reporting functionality

**Steps**:
1. Trigger various operations
2. Monitor console for errors
3. Verify error capture
4. Test error reporting

**Expected Results**:
- Errors are captured accurately
- Error reports are generated
- Monitoring doesn't interfere with functionality

## Hardware Testing

### Physical Camera Requirements

For comprehensive testing, ensure you have:

- At least one USB webcam
- Camera with adjustable controls (brightness, contrast, etc.)
- Camera that supports multiple resolutions
- Camera with known working V4L2 drivers

### Hardware Validation Commands

```bash
# List available cameras
v4l2-ctl --list-devices

# Check camera capabilities
v4l2-ctl -d /dev/video0 --list-ctrls

# Test camera capture
v4l2-ctl -d /dev/video0 --set-fmt-video=width=1280,height=720,pixelformat=MJPG
ffmpeg -f v4l2 -i /dev/video0 -t 5 -y test_capture.mp4

# Check camera permissions
ls -la /dev/video*
groups $USER | grep video
```

### Common Hardware Issues

1. **Permission Denied**
   ```bash
   sudo usermod -a -G video $USER
   # Logout and login again
   ```

2. **Device Busy**
   ```bash
   lsof /dev/video0
   # Kill processes using the camera
   ```

3. **Driver Issues**
   ```bash
   dmesg | grep -i usb
   dmesg | grep -i video
   ```

## Debugging and Troubleshooting

### Log Files

Test execution generates several log files:

- `test-results/screenshots/` - Screenshots of test failures
- `test-results/videos/` - Video recordings of test runs
- `test-results/traces/` - Playwright trace files
- `log/mcp-webcam/` - MCP system logs
- `test-results/reports/` - Test execution reports

### Common Issues

1. **Tests Timeout**
   - Check if webcam hardware is available
   - Verify server is running on correct port
   - Check for permission issues

2. **Camera Not Detected**
   - Verify hardware connection
   - Check V4L2 drivers
   - Ensure camera isn't in use by another process

3. **Console Errors**
   - Review browser console for JavaScript errors
   - Check network connectivity
   - Verify API endpoints are responding

4. **Enhanced Component Not Loading**
   - Check if enhanced component is enabled
   - Verify JavaScript files are loaded correctly
   - Check for initialization errors

### Debug Mode

Enable debug mode for detailed logging:

```javascript
// In browser console
window.webcamComponent.options.enableLogging = true;
window.consoleErrorMonitor.options.enableDebug = true;
```

### Performance Monitoring

Monitor test performance:

```bash
# Generate performance report
npx playwright test tests/webcam/webcam-e2e.spec.js --reporter=html

# View detailed timing
npx playwright show-trace test-results/trace.zip
```

## Continuous Integration

### CI/CD Configuration

For automated testing in CI/CD pipelines:

```yaml
# .github/workflows/webcam-tests.yml
name: Webcam Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:webcam:headless
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: test-results/
```

### Mock Hardware for CI

When physical hardware isn't available:

```javascript
// Enable mock mode
process.env.WEBCAM_MOCK_MODE = 'true';

// Mock camera responses
window.mockWebcamAPI = {
  detectCameras: () => Promise.resolve([
    { id: '0', name: 'Mock Camera', available: true }
  ]),
  testCamera: () => Promise.resolve({ success: true }),
  // ... other mock methods
};
```

## Best Practices

### Test Development

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up resources after tests
3. **Assertions**: Use meaningful assertions with clear error messages
4. **Screenshots**: Capture screenshots on failures for debugging
5. **Timeouts**: Set appropriate timeouts for hardware operations

### Error Handling

1. **Graceful Degradation**: Tests should handle missing hardware gracefully
2. **Retry Logic**: Implement retry logic for flaky hardware operations
3. **Clear Messages**: Provide clear error messages for debugging
4. **Logging**: Log important events and state changes

### Performance

1. **Parallel Execution**: Run independent tests in parallel
2. **Resource Management**: Properly manage camera resources
3. **Cleanup**: Clean up test artifacts regularly
4. **Monitoring**: Monitor test execution times

## Contributing

When adding new webcam tests:

1. Follow the existing test structure
2. Add appropriate error handling
3. Include hardware validation
4. Update this documentation
5. Test on multiple hardware configurations

## Support

For issues with webcam testing:

1. Check the troubleshooting section
2. Review log files for errors
3. Test with different hardware
4. Create detailed bug reports with logs and screenshots
