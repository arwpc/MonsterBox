# Head Tracking System

The MonsterBox Head Tracking System provides real-time computer vision-based head tracking for animatronic characters using OpenCV and servo control.

## Overview

The head tracking system automatically detects and follows people using a webcam and controls a servo motor to rotate the character's head accordingly. It integrates seamlessly with the MonsterBox WebSocket hardware service architecture.

## Features

- **Real-time person detection** using OpenCV background subtraction
- **Smooth servo control** with configurable limits and smoothing
- **WebSocket integration** for real-time control and monitoring
- **Character-specific configuration** through the Parts system
- **Live video preview** with tracking overlay
- **Hardware monitoring** integration
- **Comprehensive testing** with MCP log collection

## Architecture

### WebSocket Service
- **Port**: 8778
- **Service**: `head_tracking_websocket_service.py`
- **Auto-start**: Integrated with `npm start`
- **Monitoring**: Available at `/hardware-monitor.html`

### Components
1. **OpenCV Vision System**: Person detection and tracking
2. **Servo Control**: Head rotation with safety limits
3. **WebSocket Server**: Real-time communication
4. **Configuration System**: Character-specific settings
5. **Status Monitoring**: Real-time tracking status

## Configuration

### Character-Part Assignment

Head tracking is configured through the Parts system in `data/parts.json`:

```json
{
  "id": 22,
  "name": "Orlok Head Tracking System",
  "type": "head-tracking",
  "characterId": 1,
  "webcam_device": "/dev/video0",
  "servo_id": 11,
  "servo_center_angle": 90,
  "servo_left_limit": 30,
  "servo_right_limit": 150,
  "config": {
    "webcam_device": "/dev/video0",
    "servo_center_angle": 90,
    "servo_left_limit": 30,
    "servo_right_limit": 150,
    "tracking_sensitivity": 1.0,
    "motion_threshold": 25,
    "tracking_smoothing": 0.3,
    "tracking_deadzone": 5,
    "background_subtraction_history": 500,
    "background_subtraction_threshold": 16,
    "min_contour_area": 500,
    "max_contour_area": 50000,
    "target_lost_timeout": 3.0,
    "servo_update_rate": 10
  }
}
```

### Configuration Parameters

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| `webcam_device` | Camera device path | `/dev/video0` | `/dev/videoX` |
| `servo_center_angle` | Center position angle | 90° | 0-180° |
| `servo_left_limit` | Left movement limit | 30° | 0-180° |
| `servo_right_limit` | Right movement limit | 150° | 0-180° |
| `tracking_sensitivity` | Detection sensitivity | 1.0 | 0.1-3.0 |
| `motion_threshold` | Motion detection threshold | 25 | 10-100 |
| `tracking_smoothing` | Movement smoothing factor | 0.3 | 0.1-1.0 |
| `tracking_deadzone` | Center deadzone percentage | 5% | 1-20% |

## Installation

### Dependencies

The system requires OpenCV and related dependencies:

```bash
# Check dependencies
python3 scripts/check_head_tracking_dependencies.py

# Install if needed (automatic)
sudo apt update
sudo apt install -y python3-opencv libopencv-dev python3-numpy
pip3 install opencv-python>=4.5.0 numpy>=1.19.0 websockets>=10.0
```

### Hardware Requirements

1. **Webcam**: USB camera (tested with /dev/video0)
2. **Servo Motor**: Standard servo with PWM control
3. **GPIO Connection**: Servo connected to configured GPIO pin
4. **Power Supply**: Adequate power for servo operation

## Usage

### Starting Head Tracking

1. **Via Hardware Monitor** (`/hardware-monitor.html`):
   - Select character from dropdown
   - Configure camera and sensitivity settings
   - Click "Start Tracking"

2. **Via Parts Interface**:
   - Navigate to Parts menu
   - Select head tracking part
   - Configure and activate

3. **Via WebSocket API**:
   ```javascript
   const ws = new WebSocket('ws://localhost:8778');
   ws.send(JSON.stringify({
     type: 'start_tracking',
     character_id: '1'
   }));
   ```

### WebSocket API

#### Start Tracking
```json
{
  "type": "start_tracking",
  "character_id": "1"
}
```

#### Stop Tracking
```json
{
  "type": "stop_tracking",
  "character_id": "1"
}
```

#### Configure Tracking
```json
{
  "type": "configure_tracking",
  "character_id": "1",
  "config": {
    "tracking_sensitivity": 1.5,
    "motion_threshold": 30,
    "tracking_smoothing": 0.4
  }
}
```

#### Get Status
```json
{
  "type": "get_tracking_status",
  "character_id": "1"
}
```

### Status Messages

The service sends real-time status updates:

```json
{
  "type": "tracking_status_update",
  "character_id": "1",
  "status": {
    "active": true,
    "target_detected": true,
    "target_position": [45.2, 60.1],
    "target_size": 12.5,
    "servo_angle": 105.3,
    "frame_count": 1250,
    "fps": 15.2
  }
}
```

## Testing

### Unit Tests

Run comprehensive tests:

```bash
# Run head tracking tests
npx mocha tests/head-tracking.test.js --timeout 30000

# Run all hardware tests
npm run test:hardware-comprehensive
```

### Manual Testing

1. **Service Startup**: Verify service starts on port 8778
2. **Camera Access**: Check webcam device availability
3. **Servo Control**: Test servo movement and limits
4. **Person Detection**: Verify tracking with live person
5. **WebSocket Communication**: Test all API endpoints

### MCP Log Collection

For debugging and analysis:

```bash
# Collect logs for analysis
npm run debug:mcp-collect

# View hardware monitor logs
tail -f logs/hardware-monitor.log
```

## Troubleshooting

### Common Issues

#### Camera Not Found
```
Error: Failed to open camera /dev/video0
```
**Solution**: 
- Check camera connection: `ls /dev/video*`
- Verify permissions: `sudo usermod -a -G video $USER`
- Test camera: `python3 -c "import cv2; cap = cv2.VideoCapture(0); print(cap.isOpened())"`

#### Servo Not Responding
```
Error: Servo control failed
```
**Solution**:
- Check GPIO pin configuration in parts.json
- Verify servo power supply
- Test servo manually: Use hardware monitor servo test function

#### Poor Tracking Performance
```
Warning: Low FPS or frequent target loss
```
**Solution**:
- Reduce camera resolution in configuration
- Adjust `motion_threshold` and `tracking_sensitivity`
- Ensure adequate lighting conditions
- Check CPU usage: `htop`

#### WebSocket Connection Failed
```
Error: Connection refused on port 8778
```
**Solution**:
- Check service status: `npm start` output
- Verify port availability: `netstat -ln | grep 8778`
- Check firewall settings
- Review service logs

### Debug Mode

Enable detailed logging:

```python
# In head_tracking_websocket_service.py
logging.basicConfig(level=logging.DEBUG)
```

### Performance Optimization

1. **Camera Settings**: Lower resolution for better performance
2. **Detection Parameters**: Tune thresholds for environment
3. **Servo Speed**: Adjust update rate to prevent jitter
4. **Background Learning**: Optimize for lighting conditions

## Integration

### Hardware Service Manager

The head tracking service is automatically managed:

```javascript
// In hardwareServiceManager.js
services: {
  head_tracking: { port: 8778, status: 'offline' }
}
```

### Character Assignment

Characters are assigned head tracking through the Parts system:

```json
// In characters.json
{
  "id": 1,
  "char_name": "Orlok",
  "parts": [22]  // Head tracking part ID
}
```

### UI Integration

The system integrates with:
- **Parts Menu**: Configuration and control
- **Hardware Monitor**: Real-time monitoring
- **Character Interface**: Character-specific settings

## Development

### Adding New Features

1. **Extend TrackingConfig**: Add new configuration parameters
2. **Update WebSocket API**: Add new message types
3. **Enhance Detection**: Improve OpenCV algorithms
4. **Add Calibration**: Implement automatic calibration

### Testing New Features

1. **Unit Tests**: Add tests to `tests/head-tracking.test.js`
2. **Integration Tests**: Test with hardware monitor
3. **Performance Tests**: Measure FPS and accuracy
4. **Documentation**: Update this guide

## Security

### Access Control

- WebSocket connections are local by default
- No authentication required for local access
- Consider adding authentication for remote access

### Safety Limits

- Servo angle limits prevent mechanical damage
- Emergency stop functionality available
- Automatic timeout on connection loss

## Support

For issues and questions:

1. **Check Logs**: Review service and application logs
2. **Run Diagnostics**: Use dependency checker script
3. **Test Hardware**: Verify camera and servo functionality
4. **Review Configuration**: Check parts and character settings

## See Also

- [Hardware Integration Guide](../hardware/index.md)
- [WebSocket Services](../api/websocket-services.md)
- [Testing Documentation](../testing/hardware.md)
- [GPIO Assignments](gpio_assignments.md)
