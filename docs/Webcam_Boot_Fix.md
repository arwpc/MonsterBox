# Webcam Boot Failure - Root Cause Analysis & Fix

## Problem Statement

The mjpg-streamer service fails to start automatically on boot across all MonsterNet animatronics (Orlok, Groundbreaker, Pumpkinhead, etc.). The service requires manual restart after every reboot.

## Root Cause Analysis

### Symptoms
- Service fails on boot with error: `init_VideoIn failed`
- systemd shows: `Start request repeated too quickly` after 44 restart attempts
- Service works perfectly when manually restarted after boot

### Investigation
Examined journal logs:
```bash
journalctl -u mjpg-streamer.service -n 50
```

Key findings:
```
Oct 08 12:32:23 orlok mjpg_streamer[149498]: MJPG-streamer [149498]: init_VideoIn failed
Oct 08 12:32:26 orlok systemd[1]: mjpg-streamer.service: Scheduled restart job, restart counter is at 44.
Oct 08 12:32:26 orlok systemd[1]: mjpg-streamer.service: Start request repeated too quickly.
Oct 08 12:32:26 orlok systemd[1]: mjpg-streamer.service: Failed with result 'exit-code'.
```

### Root Cause
**Race condition**: The mjpg-streamer service starts before the USB camera device (`/dev/video0`) is fully initialized by the kernel.

Original service configuration:
```ini
[Unit]
Description=MJPG Streamer (UVC to HTTP)
After=network.target  # ← Only waits for network, NOT camera device
```

The service only waited for `network.target`, which is insufficient. USB devices can take several seconds to enumerate and initialize after boot.

## Solution

### Fix Applied
Updated systemd service unit to properly wait for the camera device:

```ini
[Unit]
Description=MJPG Streamer (UVC to HTTP)
After=network.target dev-video0.device  # ← Wait for camera device
Wants=dev-video0.device                  # ← Declare dependency

[Service]
Type=simple
User=root
WorkingDirectory=/tmp
ExecStartPre=/bin/sleep 2                # ← Additional safety delay
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 640x480 -f 24 -q 80" -o "output_http.so -p 8090 -w /usr/local/share/mjpg-streamer/www"
Restart=always
RestartSec=5                             # ← Increased from 2 seconds
StartLimitBurst=10                       # ← Increased from default 5
StartLimitIntervalSec=120                # ← Added explicit interval

[Install]
WantedBy=multi-user.target
```

### Key Changes
1. **`After=dev-video0.device`**: Service waits for camera device to be available
2. **`Wants=dev-video0.device`**: Declares soft dependency on camera device
3. **`ExecStartPre=/bin/sleep 2`**: Additional 2-second delay for camera initialization
4. **`RestartSec=5`**: Increased restart delay from 2 to 5 seconds
5. **`StartLimitBurst=10`**: Allows more restart attempts for transient issues
6. **`StartLimitIntervalSec=120`**: Explicit 2-minute window for restart limit

## Deployment

### Files Created
- `scripts/mjpg-streamer.service` - Fixed service unit file
- `scripts/fix-webcam-boot.sh` - Automated deployment script for all animatronics

### Deployment Results
Deployed to MonsterNet animatronics on 2025-10-08:

| Animatronic   | Status | Notes |
|---------------|--------|-------|
| orlok         | ✓ Success | Service running, streaming JPEG data |
| groundbreaker | ✓ Success | Service running |
| pumpkinhead   | ✓ Success | Service running |
| goblin1       | ✗ Failed | Hostname not found (offline or not configured) |
| goblin2       | ✗ Failed | mjpg-streamer not installed (separate issue) |
| goblin3       | ✗ Failed | Hostname not found (offline or not configured) |

### Manual Deployment
To deploy to additional animatronics:
```bash
cd /home/remote/MonsterBox
bash scripts/fix-webcam-boot.sh
```

Or manually on a single animatronic:
```bash
sudo cp scripts/mjpg-streamer.service /etc/systemd/system/
sudo chmod 644 /etc/systemd/system/mjpg-streamer.service
sudo systemctl daemon-reload
sudo systemctl restart mjpg-streamer.service
sudo systemctl status mjpg-streamer.service
```

## Testing

### Verification Steps
1. **Check service status**:
   ```bash
   systemctl status mjpg-streamer.service
   ```

2. **Verify webcam stream**:
   ```bash
   curl -s http://localhost:8090/?action=snapshot --output /tmp/test.jpg
   file /tmp/test.jpg  # Should show: JPEG image data
   ```

3. **Test reboot** (the ultimate test):
   ```bash
   sudo reboot
   # After reboot:
   systemctl status mjpg-streamer.service
   curl -s http://localhost:8090/?action=snapshot --output /tmp/test.jpg
   ```

### Expected Results
- Service should be `active (running)` immediately after boot
- No `init_VideoIn failed` errors in journal
- Webcam stream should produce valid JPEG images
- No manual intervention required

## Technical Details

### systemd Device Units
systemd automatically creates device units for hardware devices. For `/dev/video0`, the corresponding unit is `dev-video0.device`.

Using `After=dev-video0.device` ensures the service waits for:
1. Kernel driver initialization
2. USB device enumeration
3. V4L2 device node creation
4. Device permissions setup

### Why This Works
The fix addresses the race condition by:
1. **Explicit ordering**: Service starts only after device is ready
2. **Dependency declaration**: systemd knows the service needs the device
3. **Safety margin**: 2-second delay handles any remaining initialization
4. **Resilience**: Increased restart limits handle transient issues

### Alternative Approaches Considered
1. **Increase RestartSec only**: Insufficient - doesn't address root cause
2. **Add arbitrary sleep in ExecStartPre**: Unreliable - race condition remains
3. **Use udev rules**: Overcomplicated - systemd device units are cleaner
4. **Polling script**: Hacky - systemd dependencies are the proper solution

## Git History
- Commit: `76475d47` - "fix: webcam boot failure - wait for /dev/video0 device"
- Branch: `main`
- Pushed: 2025-10-08

## Related Issues
- Goblin2 needs mjpg-streamer installation (separate issue)
- Goblin1/Goblin3 hostname resolution (network configuration issue)

## References
- systemd.unit(5) - `After=`, `Wants=` directives
- systemd.device(5) - Device unit configuration
- systemd.service(5) - Service unit configuration
- mjpg-streamer documentation

