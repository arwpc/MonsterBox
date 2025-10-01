# Goblin-1 Deployment Checklist

Use this checklist to deploy and verify Goblin-1 video playback system.

---

## 📋 Pre-Deployment Checklist

### Hardware
- [ ] Raspberry Pi 4B (or 3B+) powered on
- [ ] USB stick with videos plugged in
- [ ] HDMI cable connected to TV
- [ ] TV powered on and set to correct HDMI input
- [ ] Network cable connected (or WiFi configured)
- [ ] Can ping 192.168.8.160 from development machine

### Software
- [ ] Raspberry Pi OS installed and updated
- [ ] SSH enabled on Raspberry Pi
- [ ] Can SSH to pi@192.168.8.160
- [ ] User has sudo privileges

---

## 🚀 Deployment Steps

### Step 1: Copy Files to Goblin-1
```bash
cd MonsterBox
scp -r goblin-system pi@192.168.8.160:~/
```

**Verify**:
- [ ] Files copied successfully
- [ ] No errors during transfer

---

### Step 2: SSH into Goblin-1
```bash
ssh pi@192.168.8.160
```

**Verify**:
- [ ] Successfully connected
- [ ] At command prompt

---

### Step 3: Run Setup Script
```bash
cd ~/goblin-system
./setup-goblin1.sh
```

**Watch for**:
- [ ] System packages updated
- [ ] Dependencies installed (VLC, ffmpeg, Node.js)
- [ ] USB stick found and mounted
- [ ] Video count displayed
- [ ] Goblin directories created
- [ ] Node.js dependencies installed
- [ ] Systemd service created
- [ ] Configuration written
- [ ] No errors during setup

**Expected Output**:
```
🎃 Goblin-1 setup complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Goblin Configuration Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Goblin ID:        goblin1
  Hostname:         goblin1
  IP Address:       192.168.8.160
  Port:             3001
  Video Count:      XX videos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 4: Reboot (if needed)
```bash
sudo reboot
```

**Reboot if**:
- [ ] Hostname was changed
- [ ] GPU memory was changed
- [ ] /boot/config.txt was modified

**Wait**: 1-2 minutes for reboot

**Reconnect**:
```bash
ssh pi@192.168.8.160
```

---

### Step 5: Start Goblin Service
```bash
sudo systemctl start goblin
```

**Verify**:
- [ ] Service started without errors

**Check Status**:
```bash
sudo systemctl status goblin
```

**Expected**:
- [ ] Status: `active (running)`
- [ ] No error messages
- [ ] Process ID shown

---

### Step 6: Verify API
```bash
curl http://localhost:3001/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "goblinId": "goblin1",
  "uptime": 123.45,
  "connected": false
}
```

**Verify**:
- [ ] API responds
- [ ] Status is "healthy"
- [ ] Goblin ID is "goblin1"

---

### Step 7: List Available Videos
```bash
curl http://localhost:3001/media | jq
```

**Expected**:
- [ ] JSON response with video list
- [ ] Videos from USB stick shown
- [ ] Source marked as "usb"

**Example**:
```json
{
  "video": [
    {
      "filename": "halloween/ghost1.mp4",
      "size": 12345678,
      "type": "video",
      "source": "usb"
    }
  ]
}
```

---

### Step 8: Test Video Playback
```bash
cd ~/goblin-system
./test-usb-video.sh
```

**Interactive Test**:
- [ ] Script lists available videos
- [ ] Select a video to play
- [ ] Video plays fullscreen on TV
- [ ] Audio comes through TV speakers
- [ ] Video loops continuously
- [ ] Playback is smooth (no stuttering)
- [ ] Press Ctrl+C to stop

**Verify on TV**:
- [ ] Video fills entire screen
- [ ] Colors look correct
- [ ] Audio is clear
- [ ] No lag or stuttering
- [ ] Video loops seamlessly

---

### Step 9: Test from MonsterBox
```bash
# From MonsterBox server (exit SSH first)
curl http://192.168.8.160:3001/health
curl http://192.168.8.160:3001/media
```

**Verify**:
- [ ] MonsterBox can reach Goblin-1
- [ ] Health check responds
- [ ] Media list responds

---

### Step 10: Test API Video Playback
```bash
# From MonsterBox or Goblin-1
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "your-video.mp4", "loop": true}'
```

**Verify**:
- [ ] API accepts command
- [ ] Video starts playing on TV
- [ ] Video loops

**Stop Playback**:
```bash
curl -X POST http://192.168.8.160:3001/stop-all
```

**Verify**:
- [ ] Video stops on TV

---

## ✅ Final Verification

### System Configuration
- [ ] Hostname: `goblin1` (run `hostname`)
- [ ] IP Address: `192.168.8.160` (run `hostname -I`)
- [ ] GPU Memory: 128M+ (run `vcgencmd get_mem gpu`)
- [ ] HDMI Audio: Configured (run `amixer cget numid=3`)

### USB Stick
- [ ] Mounted at `/media/usb` (run `mountpoint /media/usb`)
- [ ] Videos accessible (run `ls /media/usb`)
- [ ] Auto-mount configured (check `/etc/fstab`)

### Goblin Service
- [ ] Service enabled (run `systemctl is-enabled goblin`)
- [ ] Service running (run `systemctl is-active goblin`)
- [ ] No errors in logs (run `sudo journalctl -u goblin -n 50`)

### API Endpoints
- [ ] `/health` responds
- [ ] `/info` responds
- [ ] `/media` responds with video list
- [ ] `/play-video` works
- [ ] `/stop-all` works

### Video Playback
- [ ] Videos play fullscreen on TV
- [ ] Audio comes through TV speakers
- [ ] Playback is smooth
- [ ] Videos loop correctly
- [ ] Can stop playback
- [ ] Can switch between videos

### Network
- [ ] Reachable from MonsterBox
- [ ] Reachable from development machine
- [ ] Static IP working
- [ ] No network errors

---

## 🔍 Troubleshooting

### If Service Won't Start
```bash
# Check logs
sudo journalctl -u goblin -n 50

# Check Node.js
node --version

# Reinstall dependencies
cd ~/goblin
npm install

# Try manual start
cd ~/goblin
node server.js
```

### If Video Won't Play
```bash
# Check GPU memory
vcgencmd get_mem gpu

# Check HDMI
tvservice -s

# Test VLC directly
vlc --fullscreen /media/usb/your-video.mp4

# Check video player
which vlc
vlc --version
```

### If No Audio
```bash
# Check audio devices
aplay -l

# Force HDMI audio
sudo amixer cset numid=3 2

# Set volume
sudo amixer set Master 80%

# Test audio
speaker-test -c2 -twav
```

### If USB Not Mounted
```bash
# Check USB devices
lsblk

# Check mount
mountpoint /media/usb

# Mount manually
sudo mount /dev/sda1 /media/usb

# Check for errors
dmesg | tail -20
```

---

## 📊 Success Criteria

All of the following must be true:

- ✅ Goblin service running and healthy
- ✅ API responding on port 3001
- ✅ USB stick mounted with videos accessible
- ✅ Videos play smoothly on TV via HDMI
- ✅ Audio comes through TV speakers
- ✅ Videos loop continuously
- ✅ Can control playback via API
- ✅ Reachable from MonsterBox
- ✅ No errors in logs
- ✅ Service auto-starts on boot

---

## 🎯 Next Steps After Successful Deployment

1. **Test Auto-Start**:
   ```bash
   sudo reboot
   # Wait for reboot
   ssh pi@192.168.8.160
   sudo systemctl status goblin
   ```
   - [ ] Service started automatically

2. **Test USB Auto-Mount**:
   ```bash
   sudo reboot
   # Wait for reboot
   ssh pi@192.168.8.160
   mountpoint /media/usb
   ```
   - [ ] USB mounted automatically

3. **Create Test Scene in MonsterBox**:
   - [ ] Add Goblin-1 to MonsterBox
   - [ ] Create scene with Goblin video step
   - [ ] Test scene execution
   - [ ] Verify video plays on TV

4. **Performance Testing**:
   - [ ] Test multiple video switches
   - [ ] Test long-running playback (1+ hour)
   - [ ] Monitor CPU/temperature
   - [ ] Check for memory leaks

5. **Integration Testing**:
   - [ ] Test with other animatronics
   - [ ] Test coordinated scenes
   - [ ] Test emergency stop
   - [ ] Test network resilience

---

## 📝 Notes

**Date Deployed**: _______________

**Deployed By**: _______________

**Video Count**: _______________

**Issues Encountered**: 
- 
- 
- 

**Resolutions**:
- 
- 
- 

**Performance Notes**:
- 
- 
- 

---

**Deployment Complete! 🎃👹**

