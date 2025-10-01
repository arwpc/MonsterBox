# Head Tracking Setup Guide

This guide walks you through setting up the MonsterBox Head Tracking System from hardware installation to software configuration.

## Prerequisites

- Raspberry Pi 4B with MonsterBox installed
- USB webcam
- Servo motor (standard PWM servo)
- Jumper wires and breadboard
- Basic electronics knowledge

## Hardware Setup

### 1. Servo Connection

Connect your servo to the Raspberry Pi:

```
Servo Wire Colors:
- Red    → 5V Power (Pin 2 or 4)
- Brown  → Ground (Pin 6, 9, 14, 20, 25, 30, 34, or 39)
- Orange → GPIO Pin (configurable, default GPIO 18)
```

**GPIO Pin Assignment:**
- Check existing assignments: `docs/hardware/gpio_assignments.md`
- Avoid conflicts with other parts
- Update parts.json with your chosen pin

### 2. Camera Connection

1. **USB Webcam**: Plug into any USB port
2. **Verify Detection**: 
   ```bash
   ls /dev/video*
   # Should show /dev/video0 (or similar)
   ```
3. **Test Camera**:
   ```bash
   python3 -c "import cv2; cap = cv2.VideoCapture(0); print('Camera OK:', cap.isOpened())"
   ```

### 3. Power Considerations

- **Servo Power**: High-torque servos may need external power supply
- **USB Power**: Ensure adequate power for camera
- **GPIO Limits**: Raspberry Pi GPIO provides limited current

## Software Setup

### 1. Dependency Check

Run the automated dependency checker:

```bash
cd /home/remote/MonsterBox
python3 scripts/check_head_tracking_dependencies.py
```

If dependencies are missing, the script will offer to install them automatically.

### 2. Manual Dependency Installation

If automatic installation fails:

```bash
# System packages
sudo apt update
sudo apt install -y python3-opencv libopencv-dev python3-numpy

# Python packages
pip3 install opencv-python>=4.5.0 numpy>=1.19.0 websockets>=10.0

# Optional: GPIO libraries
pip3 install lgpio pigpio
```

### 3. Service Verification

Check that the head tracking service is configured:

```bash
# Start MonsterBox
npm start

# Look for head tracking service in output:
# "head_tracking_service WebSocket Server running on port 8778"
```

## Configuration

### 1. Create Head Tracking Part

Add a head tracking part to `data/parts.json`:

```json
{
  "id": 23,
  "name": "My Character Head Tracking",
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
    "tracking_deadzone": 5
  }
}
```

### 2. Create Servo Part

Ensure you have a servo part for the head movement:

```json
{
  "id": 11,
  "name": "Head Servo",
  "type": "servo",
  "characterId": 1,
  "pin": 18,
  "usePCA9685": false,
  "channel": null,
  "minPulse": 500,
  "maxPulse": 2500,
  "defaultAngle": 90,
  "servoType": "Standard Servo"
}
```

### 3. Assign to Character

Update your character in `data/characters.json`:

```json
{
  "id": 1,
  "char_name": "My Character",
  "parts": [23],  // Include head tracking part ID
  "animatronic": {
    "services": [
      "head-tracking"  // Include in services list
    ]
  }
}
```

## Calibration

### 1. Servo Range Calibration

1. **Access Hardware Monitor**: Navigate to `/hardware-monitor.html`
2. **Select Character**: Choose your character from dropdown
3. **Test Servo**: Click "Test Servo" to verify movement
4. **Adjust Limits**: 
   - Set `servo_left_limit` to leftmost safe position
   - Set `servo_right_limit` to rightmost safe position
   - Ensure no mechanical binding or collision

### 2. Camera Calibration

1. **Position Camera**: Mount camera for optimal view
2. **Test Detection**: Start tracking and move in front of camera
3. **Adjust Sensitivity**:
   - **Low sensitivity** (0.5-0.8): Less responsive, fewer false positives
   - **High sensitivity** (1.2-2.0): More responsive, may track background
4. **Tune Thresholds**:
   - **Motion Threshold**: Lower for subtle movement detection
   - **Deadzone**: Larger deadzone reduces jitter in center

### 3. Performance Tuning

Monitor performance in hardware monitor:

- **Target FPS**: 10-15 FPS is adequate
- **Detection Rate**: Should detect person consistently
- **Servo Response**: Smooth movement without jitter

**Optimization Tips:**
- Reduce camera resolution if FPS is low
- Increase motion threshold in noisy environments
- Adjust smoothing for desired response speed

## Testing

### 1. Basic Functionality Test

```bash
# Run automated tests
npx mocha tests/head-tracking.test.js --timeout 30000
```

### 2. Manual Testing Checklist

- [ ] Service starts without errors
- [ ] Camera device detected
- [ ] Servo responds to test commands
- [ ] Person detection works in good lighting
- [ ] Head follows movement smoothly
- [ ] Servo stops at configured limits
- [ ] WebSocket API responds correctly

### 3. Integration Testing

1. **Hardware Monitor**: Test all controls
2. **Parts Interface**: Verify configuration saves
3. **Character Assignment**: Confirm part assignment works
4. **Multi-Character**: Test with multiple characters (if applicable)

## Troubleshooting

### Common Setup Issues

#### "Camera not found" Error

**Symptoms**: Service fails to start, camera error in logs

**Solutions**:
1. Check camera connection: `lsusb` should show camera
2. Verify device path: `ls -la /dev/video*`
3. Check permissions: `sudo usermod -a -G video $USER` (then reboot)
4. Try different USB port
5. Test with different camera

#### "Servo not responding" Error

**Symptoms**: No servo movement, GPIO errors

**Solutions**:
1. Check wiring connections
2. Verify GPIO pin in parts.json matches physical connection
3. Test servo with multimeter (should see PWM signal)
4. Check servo power supply
5. Try different GPIO pin

#### Poor Tracking Performance

**Symptoms**: Erratic movement, false detections, low FPS

**Solutions**:
1. Improve lighting conditions
2. Reduce camera resolution
3. Adjust motion threshold
4. Increase tracking smoothing
5. Check CPU usage with `htop`

#### Service Won't Start

**Symptoms**: Port 8778 not listening, service errors

**Solutions**:
1. Check for port conflicts: `netstat -ln | grep 8778`
2. Verify Python dependencies
3. Check file permissions
4. Review service logs
5. Restart MonsterBox: `npm start`

### Debug Mode

Enable detailed logging for troubleshooting:

1. **Edit Service File**: `scripts/hardware/head_tracking_websocket_service.py`
2. **Change Log Level**: 
   ```python
   logging.basicConfig(level=logging.DEBUG)
   ```
3. **Restart Service**: `npm start`
4. **Monitor Logs**: Watch console output for detailed information

### Performance Monitoring

Monitor system resources during operation:

```bash
# CPU and memory usage
htop

# GPU memory (if using GPU acceleration)
vcgencmd get_mem gpu

# Camera processes
ps aux | grep video

# Network connections
netstat -an | grep 8778
```

## Advanced Configuration

### Multiple Cameras

For setups with multiple cameras:

```json
{
  "config": {
    "webcam_device": "/dev/video1",  // Use different camera
    "backup_camera": "/dev/video0"   // Fallback option
  }
}
```

### Custom Detection Algorithms

Modify detection parameters for specific environments:

```json
{
  "config": {
    "background_subtraction_history": 1000,  // Longer history for stable backgrounds
    "background_subtraction_threshold": 32,  // Higher threshold for noisy environments
    "min_contour_area": 1000,               // Larger minimum for distant detection
    "max_contour_area": 25000               // Smaller maximum to ignore large movements
  }
}
```

### External Power Supply

For high-torque servos requiring external power:

1. **Use External 5V Supply**: Connect servo red wire to external power
2. **Common Ground**: Connect external power ground to Pi ground
3. **Signal Only**: Connect only servo signal wire to GPIO
4. **Isolation**: Consider optocoupler for electrical isolation

## Maintenance

### Regular Checks

- **Camera Lens**: Clean regularly for clear detection
- **Servo Lubrication**: Maintain mechanical parts
- **Connection Integrity**: Check for loose wires
- **Software Updates**: Keep OpenCV and dependencies updated

### Log Rotation

Monitor and rotate logs to prevent disk space issues:

```bash
# Check log sizes
du -sh logs/

# Rotate logs if needed
logrotate /etc/logrotate.conf
```

### Backup Configuration

Save your working configuration:

```bash
# Backup parts and characters
cp data/parts.json data/parts.json.backup
cp data/characters.json data/characters.json.backup
```

## Next Steps

After successful setup:

1. **Explore Advanced Features**: Multi-target tracking, face recognition
2. **Integration**: Connect with AI systems for interactive responses
3. **Customization**: Modify detection algorithms for specific needs
4. **Expansion**: Add multiple tracking systems for complex animatronics

## Support Resources

- **Documentation**: [Head Tracking System](../hardware/head-tracking.md)
- **Hardware Guide**: [GPIO Assignments](../hardware/gpio_assignments.md)
- **Testing**: [Hardware Testing](../testing/hardware.md)
- **API Reference**: [WebSocket API](../api/websocket-services.md)

For additional support, check the troubleshooting section or review the comprehensive documentation.
