# Head Tracking Troubleshooting Guide

This guide provides solutions for common head tracking system issues in MonsterBox.

## Quick Diagnostics

### 1. Service Status Check
```bash
# Check if head tracking service is running
netstat -ln | grep 8778

# Check service logs
npm start | grep head_tracking

# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" http://localhost:8778/
```

### 2. Hardware Check
```bash
# Check camera availability
ls -la /dev/video*

# Test camera access
python3 -c "import cv2; cap = cv2.VideoCapture(0); print('Camera:', cap.isOpened()); cap.release()"

# Check GPIO permissions
groups $USER | grep gpio
```

### 3. Dependency Check
```bash
# Run automated dependency checker
python3 scripts/check_head_tracking_dependencies.py

# Manual OpenCV test
python3 -c "import cv2; print('OpenCV version:', cv2.__version__)"
```

## Common Issues and Solutions

### Issue 1: Service Won't Start

**Symptoms:**
- No output showing "head_tracking_service WebSocket Server running on port 8778"
- Port 8778 not listening
- Service errors in console

**Diagnostic Steps:**
```bash
# Check port conflicts
sudo netstat -tulpn | grep 8778

# Check Python path and imports
python3 -c "import sys; print(sys.path)"
python3 -c "import cv2, websockets, asyncio; print('All imports OK')"

# Check file permissions
ls -la scripts/hardware/head_tracking_websocket_service.py
```

**Solutions:**

1. **Port Conflict:**
   ```bash
   # Kill process using port 8778
   sudo lsof -ti:8778 | xargs sudo kill -9
   ```

2. **Missing Dependencies:**
   ```bash
   pip3 install opencv-python websockets asyncio
   ```

3. **Permission Issues:**
   ```bash
   chmod +x scripts/hardware/head_tracking_websocket_service.py
   ```

4. **Python Path Issues:**
   ```bash
   export PYTHONPATH="/home/remote/MonsterBox:$PYTHONPATH"
   ```

### Issue 2: Camera Not Found

**Symptoms:**
- "Failed to open camera /dev/video0" error
- Service starts but tracking fails
- No video feed in hardware monitor

**Diagnostic Steps:**
```bash
# List available cameras
ls -la /dev/video*

# Check camera permissions
ls -la /dev/video0

# Test camera with different tools
lsusb | grep -i camera
v4l2-ctl --list-devices
```

**Solutions:**

1. **Camera Not Connected:**
   - Check USB connection
   - Try different USB port
   - Test with different camera

2. **Permission Denied:**
   ```bash
   # Add user to video group
   sudo usermod -a -G video $USER
   # Logout and login again, or reboot
   ```

3. **Wrong Device Path:**
   ```bash
   # Find correct device
   v4l2-ctl --list-devices
   # Update parts.json with correct path
   ```

4. **Camera In Use:**
   ```bash
   # Check what's using camera
   sudo lsof /dev/video0
   # Kill processes using camera
   sudo pkill -f video
   ```

### Issue 3: Servo Not Responding

**Symptoms:**
- No servo movement during tracking
- "Servo control failed" errors
- Servo test fails in hardware monitor

**Diagnostic Steps:**
```bash
# Check GPIO pin configuration
cat data/parts.json | grep -A 10 -B 10 "head-tracking"

# Test GPIO pin
echo "18" > /sys/class/gpio/export
echo "out" > /sys/class/gpio/gpio18/direction
echo "1" > /sys/class/gpio/gpio18/value
echo "0" > /sys/class/gpio/gpio18/value
```

**Solutions:**

1. **Wrong GPIO Pin:**
   - Verify physical wiring matches parts.json
   - Check for GPIO conflicts with other parts
   - Update servo_id in head tracking part configuration

2. **Insufficient Power:**
   - Check servo power supply (5V, adequate current)
   - Use external power supply for high-torque servos
   - Verify ground connections

3. **GPIO Permission Issues:**
   ```bash
   # Add user to gpio group
   sudo usermod -a -G gpio $USER
   # Install GPIO libraries
   pip3 install lgpio pigpio
   ```

4. **Servo Hardware Failure:**
   - Test servo with multimeter
   - Check for PWM signal on GPIO pin
   - Replace servo if necessary

### Issue 4: Poor Tracking Performance

**Symptoms:**
- Erratic head movement
- False detections
- Low frame rate (< 5 FPS)
- Tracking loses target frequently

**Diagnostic Steps:**
```bash
# Check system resources
htop
# Look for high CPU usage

# Monitor tracking status
# Open hardware monitor and watch FPS/detection stats

# Check camera resolution
v4l2-ctl --get-fmt-video -d /dev/video0
```

**Solutions:**

1. **High CPU Usage:**
   ```bash
   # Reduce camera resolution in parts.json
   "resolution": "320x240"  # Instead of 640x480
   
   # Lower frame rate
   "fps": 10  # Instead of 30
   ```

2. **Poor Lighting:**
   - Improve room lighting
   - Avoid backlighting
   - Use consistent lighting conditions

3. **Noisy Environment:**
   ```json
   // Increase motion threshold in parts.json
   "motion_threshold": 50,  // Higher value
   "tracking_sensitivity": 0.8  // Lower sensitivity
   ```

4. **Servo Jitter:**
   ```json
   // Increase smoothing in parts.json
   "tracking_smoothing": 0.5,  // Higher smoothing
   "tracking_deadzone": 10     // Larger deadzone
   ```

### Issue 5: WebSocket Connection Issues

**Symptoms:**
- Hardware monitor shows "Not connected to head tracking service"
- WebSocket connection errors in browser console
- API calls fail

**Diagnostic Steps:**
```bash
# Test WebSocket manually
wscat -c ws://localhost:8778

# Check firewall
sudo ufw status

# Test from browser console
const ws = new WebSocket('ws://localhost:8778');
ws.onopen = () => console.log('Connected');
ws.onerror = (e) => console.log('Error:', e);
```

**Solutions:**

1. **Service Not Running:**
   ```bash
   # Restart MonsterBox
   npm start
   ```

2. **Firewall Blocking:**
   ```bash
   # Allow port 8778
   sudo ufw allow 8778
   ```

3. **Network Configuration:**
   - Check if accessing from remote machine
   - Verify IP address and hostname
   - Test with localhost vs IP address

### Issue 6: Configuration Not Loading

**Symptoms:**
- Default configuration used instead of character-specific
- Changes to parts.json not reflected
- Servo limits not enforced

**Diagnostic Steps:**
```bash
# Validate JSON syntax
python3 -c "import json; print(json.load(open('data/parts.json')))"

# Check character assignment
cat data/characters.json | grep -A 5 -B 5 '"parts"'

# Verify part ID matches
cat data/parts.json | grep '"id".*22'
```

**Solutions:**

1. **JSON Syntax Error:**
   ```bash
   # Validate and fix JSON
   python3 -m json.tool data/parts.json
   ```

2. **Wrong Part ID:**
   - Ensure character parts array includes head tracking part ID
   - Verify part ID is unique and correct

3. **Service Cache:**
   ```bash
   # Restart service to reload configuration
   npm start
   ```

## Advanced Troubleshooting

### Debug Mode

Enable detailed logging:

1. **Edit Service File:**
   ```python
   # In head_tracking_websocket_service.py
   logging.basicConfig(level=logging.DEBUG)
   ```

2. **Monitor Logs:**
   ```bash
   npm start 2>&1 | grep -i head_tracking
   ```

### Performance Analysis

Monitor system performance:

```bash
# CPU usage by process
top -p $(pgrep -f head_tracking)

# Memory usage
ps aux | grep head_tracking

# I/O statistics
iostat -x 1

# Network connections
ss -tulpn | grep 8778
```

### Hardware Testing

Test individual components:

```bash
# Test camera capture
python3 -c "
import cv2
cap = cv2.VideoCapture(0)
ret, frame = cap.read()
print('Frame captured:', ret, 'Shape:', frame.shape if ret else 'None')
cap.release()
"

# Test servo control
python3 -c "
import lgpio
h = lgpio.gpiochip_open(0)
lgpio.gpio_claim_output(h, 18)
lgpio.gpio_write(h, 18, 1)
lgpio.gpiochip_close(h)
print('GPIO test complete')
"
```

### Network Diagnostics

Test network connectivity:

```bash
# Test WebSocket from command line
echo '{"type":"ping"}' | websocat ws://localhost:8778

# Monitor network traffic
sudo tcpdump -i lo port 8778

# Test from different network interfaces
curl -H "Upgrade: websocket" http://127.0.0.1:8778/
curl -H "Upgrade: websocket" http://$(hostname -I | cut -d' ' -f1):8778/
```

## Recovery Procedures

### Complete System Reset

If all else fails, perform a complete reset:

```bash
# 1. Stop all services
sudo pkill -f head_tracking
sudo pkill -f npm

# 2. Clear any locks
rm -f /tmp/.head_tracking_lock

# 3. Reset GPIO
echo "18" > /sys/class/gpio/unexport 2>/dev/null || true

# 4. Restart MonsterBox
cd /home/remote/MonsterBox
npm start
```

### Configuration Reset

Reset to default configuration:

```bash
# Backup current configuration
cp data/parts.json data/parts.json.backup
cp data/characters.json data/characters.json.backup

# Remove head tracking part (temporarily)
# Edit data/parts.json and remove head tracking entry
# Edit data/characters.json and remove part ID from character

# Restart and test with defaults
npm start

# Re-add configuration once working
```

### Hardware Reset

Reset hardware connections:

1. **Power Cycle:**
   - Disconnect servo power
   - Disconnect camera
   - Wait 10 seconds
   - Reconnect in order: camera, then servo

2. **GPIO Reset:**
   ```bash
   # Reset all GPIO
   sudo systemctl restart gpio-control
   ```

## Prevention

### Regular Maintenance

1. **Monitor Logs:**
   ```bash
   # Set up log rotation
   sudo logrotate -f /etc/logrotate.conf
   ```

2. **Check Dependencies:**
   ```bash
   # Weekly dependency check
   python3 scripts/check_head_tracking_dependencies.py
   ```

3. **Hardware Inspection:**
   - Check connections monthly
   - Clean camera lens regularly
   - Verify servo operation

### Best Practices

1. **Configuration Management:**
   - Always backup before changes
   - Validate JSON syntax
   - Test changes incrementally

2. **Resource Management:**
   - Monitor CPU and memory usage
   - Optimize camera settings for performance
   - Use appropriate hardware for load

3. **Error Handling:**
   - Implement graceful degradation
   - Log errors for analysis
   - Provide user feedback

## Getting Help

If issues persist after following this guide:

1. **Collect Diagnostic Information:**
   ```bash
   # System information
   uname -a
   cat /etc/os-release
   
   # Hardware information
   lsusb
   lscpu
   free -h
   
   # Service logs
   npm start 2>&1 | head -100
   ```

2. **Check Documentation:**
   - [Head Tracking System](../hardware/head-tracking.md)
   - [Setup Guide](../setup/HEAD-TRACKING-SETUP.md)
   - [Hardware Documentation](../hardware/index.md)

3. **Review Test Results:**
   ```bash
   # Run comprehensive tests
   npx mocha tests/head-tracking.test.js --timeout 30000
   npm run test:hardware-comprehensive
   ```

4. **MCP Log Collection:**
   ```bash
   # Collect logs for analysis
   npm run debug:mcp-collect
   ```

Remember to include all diagnostic information when seeking support.
