# MonsterBox Motion Tracking & Head Tracking - Continuation Prompt

## Context & Current State

**IMPORTANT: First read README.md thoroughly** - it contains the complete current state of MonsterBox 4.0, including the new Motion Tracking & Head Tracking sections that document what has been implemented.

## What Has Been Completed

### ✅ Motion Tracking Infrastructure
1. **OpenCV Motion Tracking Service** (`scripts/motion_tracking_service.py`)
   - Python service using OpenCV 4.6+ with MOG2 background subtraction
   - **CRITICAL**: Modified to process frames from mjpg-streamer HTTP stream instead of direct camera access
   - Configurable parameters: motion threshold, contour areas, tracking smoothing, deadzone
   - Real-time motion detection with normalized position output (0-100% coordinates)

2. **Node.js Motion Tracking Controller** (`controllers/motionTrackingController.js`)
   - Complete API endpoints for start/stop/status/params
   - Process management for Python motion tracking service
   - Integration with existing parts system (webcam parts)
   - Head tracking requirements checking (webcam + servo + mjpg-streamer)

3. **API Routes** (`routes/setup/webcam.js`)
   - `/api/motion-tracking/start` - Start motion tracking for webcam part
   - `/api/motion-tracking/stop` - Stop motion tracking
   - `/api/motion-tracking/status` - Get tracking status
   - `/api/motion-tracking/params` - Update tracking parameters
   - `/api/motion-tracking/head-tracking-requirements` - Check if head tracking can be enabled

4. **Frontend Integration** (`views/setup/webcam.ejs`)
   - Motion Tracking card in webcam interface
   - Enable Head Tracking button (placeholder functionality)
   - Real-time status updates and parameter controls
   - Integration with existing Bootstrap 5 modal system

5. **Testing Infrastructure**
   - `scripts/test-motion-tracking.sh` - Comprehensive integration test script
   - Tests all API endpoints and system requirements

## What Needs To Be Completed

### 🚧 Critical: mjpg-streamer Frame Processing
**ISSUE**: The motion tracking service needs to properly parse MJPEG frames from the mjpg-streamer HTTP stream.

**Current Problem**: The `get_frame_from_mjpeg_stream()` function in `scripts/motion_tracking_service.py` needs refinement:
- MJPEG boundary parsing may need adjustment
- Stream connection handling needs to be more robust
- Error recovery for stream interruptions

**Required Actions**:
1. Test and debug the MJPEG frame extraction
2. Ensure proper handling of mjpg-streamer multipart/x-mixed-replace format
3. Add connection recovery and retry logic
4. Test with actual mjpg-streamer service running on port 8090

### 🎯 Head Tracking Super Power Implementation
**Current State**: API endpoints exist but head tracking logic is not implemented.

**Required Implementation**:
1. **Servo Control Integration**
   - Connect motion tracking position data to servo movement
   - Implement pan/tilt servo coordination
   - Use existing servo safety systems (calibration, angle clamping)

2. **Head Tracking Configuration UI**
   - Servo selection interface (which servos control pan/tilt)
   - Tracking sensitivity and response settings
   - Enable/disable head tracking per webcam

3. **Real-time Servo Control**
   - Convert motion position (0-100% x,y) to servo angles
   - Smooth servo movement with configurable response time
   - Respect servo calibration limits and safety systems

### 🔧 Frontend Enhancements Needed

1. **Motion Tracking UI Completion**
   - Real-time motion detection visualization
   - Parameter adjustment sliders with live preview
   - Motion tracking status indicators

2. **Head Tracking Configuration**
   - Servo selection dropdowns for pan/tilt control
   - Head tracking enable/disable toggle
   - Tracking sensitivity and deadzone controls

3. **Integration Testing**
   - End-to-end testing with real hardware
   - Webcam + motion tracking + servo movement workflow
   - Error handling and user feedback

## Technical Requirements

### Dependencies Already Available
- **OpenCV 4.6.0** - Confirmed installed and working
- **mjpg-streamer** - Running as system service on port 8090
- **Node.js/Express** - Motion tracking API endpoints implemented
- **Bootstrap 5** - UI framework for modals and controls

### Hardware Integration Points
- **Webcam Parts**: Use existing webcam part configuration
- **Servo Parts**: Integrate with existing servo control system
- **Safety Systems**: Use existing calibration and angle clamping
- **Python Wrappers**: Leverage existing servo control scripts

## Key Implementation Notes

### mjpg-streamer Integration
- **Stream URL**: `http://localhost:8090/?action=stream`
- **Format**: multipart/x-mixed-replace with JPEG boundaries
- **No Camera Conflicts**: This approach allows motion tracking while mjpg-streamer serves video

### Servo Control Integration
- Use existing `services/hardwareService/servo.js`
- Respect existing calibration data in `data/servo_calibrations.json`
- Follow existing safety patterns (angle clamping, timeouts)

### Error Handling
- Follow MonsterBox "fail-fast, no-fallback" policy
- Provide clear, actionable error messages
- Log detailed debugging information

## Testing Strategy

1. **Unit Testing**: Test motion tracking API endpoints
2. **Integration Testing**: Test mjpg-streamer frame processing
3. **Hardware Testing**: Test servo control integration
4. **End-to-End Testing**: Complete webcam → motion tracking → servo movement workflow

## Success Criteria

✅ **Motion tracking processes frames from mjpg-streamer successfully**
✅ **Head tracking moves servos based on detected motion**
✅ **UI provides intuitive controls for configuration**
✅ **Integration respects existing safety systems**
✅ **Performance is suitable for Raspberry Pi 4B**

## Files to Focus On

1. `scripts/motion_tracking_service.py` - Fix mjpg-streamer frame processing
2. `controllers/motionTrackingController.js` - Implement head tracking logic
3. `views/setup/webcam.ejs` - Complete UI implementation
4. `services/hardwareService/servo.js` - Ensure motion tracking integration
5. `scripts/test-motion-tracking.sh` - Comprehensive testing

**Remember**: This is a Halloween animatronic project - the goal is to create a spooky character that can track and follow visitors with its head movement! 🎃👻
