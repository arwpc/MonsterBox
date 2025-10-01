# Goblin-1 Setup Summary

Complete setup package for deploying Goblin-1 video playback system on Raspberry Pi.

---

## 🎯 Target Configuration

- **Device**: Raspberry Pi 4B (or 3B+)
- **Hostname**: `goblin1`
- **IP Address**: `192.168.8.160` (static)
- **Port**: `3001`
- **Video Source**: USB stick (auto-mounted at `/media/usb`)
- **Video Output**: HDMI1 → TV
- **OS**: Raspberry Pi OS (fully updated)

---

## 📦 What's Been Prepared

### 1. Automated Setup Script
**File**: `goblin-system/setup-goblin1.sh`

Complete automated deployment script that:
- ✅ Sets hostname to `goblin1`
- ✅ Checks/configures network (192.168.8.160)
- ✅ Updates system packages
- ✅ Installs dependencies (VLC, ffmpeg, Node.js)
- ✅ Creates Goblin directory structure
- ✅ Finds and mounts USB stick
- ✅ Creates symlink to USB videos (no copying!)
- ✅ Configures HDMI output and audio
- ✅ Sets GPU memory to 128M
- ✅ Installs Goblin system files
- ✅ Installs Node.js dependencies
- ✅ Creates systemd service for auto-start
- ✅ Configures auto-mount for USB on boot

**Usage**:
```bash
cd ~/goblin-system
./setup-goblin1.sh
```

### 2. Video Test Script
**File**: `goblin-system/test-usb-video.sh`

Interactive video testing tool that:
- ✅ Checks USB mount status
- ✅ Scans for all video files on USB
- ✅ Lists videos with sizes
- ✅ Lets you select a video to play
- ✅ Configures HDMI audio
- ✅ Plays video fullscreen with loop
- ✅ Supports VLC, ffplay, and omxplayer

**Usage**:
```bash
cd ~/goblin-system
./test-usb-video.sh
```

### 3. Enhanced File Manager
**File**: `goblin-system/src/fileManager.js`

Updated to support:
- ✅ USB video directory scanning (recursive)
- ✅ Distinguishes between local and USB videos
- ✅ Handles subdirectories on USB stick
- ✅ Configurable USB path via environment variable
- ✅ Graceful handling when USB not present

### 4. Comprehensive Documentation

#### GOBLIN1_DEPLOYMENT.md
Complete deployment guide with:
- Prerequisites checklist
- Automated and manual setup options
- Configuration details
- Testing procedures
- Monitoring commands
- Troubleshooting guide
- Video file management
- Update procedures
- Verification checklist

#### QUICK_START.md
Quick reference card with:
- One-command deployment
- Common commands
- Status checks
- Control commands
- Troubleshooting shortcuts
- Expected results

---

## 🚀 Deployment Steps

### Quick Deployment (5 minutes)

1. **Copy files to Goblin-1**:
   ```bash
   cd MonsterBox
   scp -r goblin-system pi@192.168.8.160:~/
   ```

2. **SSH and run setup**:
   ```bash
   ssh pi@192.168.8.160
   cd ~/goblin-system
   ./setup-goblin1.sh
   ```

3. **Reboot if needed** (hostname/GPU changes):
   ```bash
   sudo reboot
   ```

4. **Start service**:
   ```bash
   sudo systemctl start goblin
   ```

5. **Test video playback**:
   ```bash
   cd ~/goblin-system
   ./test-usb-video.sh
   ```

---

## ✅ Key Features

### USB Video Management
- **No Git Bloat**: Videos stay on USB, never copied to repo
- **Symlink Access**: Goblin accesses USB videos via symlink
- **Auto-Mount**: USB stick auto-mounts on boot
- **Recursive Scan**: Finds videos in all subdirectories
- **Source Tracking**: API shows which videos are local vs USB

### HDMI Output Optimization
- **GPU Memory**: Automatically set to 128M for smooth playback
- **HDMI Audio**: Forced to HDMI output for TV speakers
- **Fullscreen**: Videos play fullscreen on TV
- **Loop Support**: Videos can loop continuously
- **Multiple Players**: Supports VLC, ffplay, omxplayer

### System Integration
- **Systemd Service**: Auto-starts on boot
- **Auto-Restart**: Restarts on failure
- **Logging**: Comprehensive logs for debugging
- **Health Monitoring**: API endpoints for status checks
- **MonsterBox Integration**: Auto-discovers and connects to MonsterBox

---

## 🎬 Video File Support

### Supported Formats
- MP4 (H.264/H.265)
- AVI
- MKV
- MOV
- WebM
- FLV

### Recommended Settings
- **Resolution**: 1080p (1920x1080) for Pi 4
- **Codec**: H.264
- **Bitrate**: 5-10 Mbps
- **Audio**: AAC or MP3, 128-192 kbps

### USB Organization
```
/media/usb/
├── halloween/
│   ├── ghosts/
│   ├── fire/
│   └── scares/
└── test/
```

Videos accessible via API as:
- `halloween/ghosts/ghost1.mp4`
- `halloween/fire/fire-loop.mp4`
- etc.

---

## 🔍 Testing & Verification

### Quick Tests

1. **Service Status**:
   ```bash
   sudo systemctl status goblin
   ```

2. **API Health**:
   ```bash
   curl http://localhost:3001/health
   ```

3. **List Videos**:
   ```bash
   curl http://localhost:3001/media | jq
   ```

4. **Play Video**:
   ```bash
   ./test-usb-video.sh
   ```

### From MonsterBox

```bash
# Test connectivity
curl http://192.168.8.160:3001/health

# List videos
curl http://192.168.8.160:3001/media

# Play video
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "your-video.mp4", "loop": true}'
```

---

## 📊 Expected Results

### After Setup
- ✅ Hostname: `goblin1`
- ✅ IP: `192.168.8.160`
- ✅ Goblin service: Running
- ✅ API: Responding on port 3001
- ✅ USB: Mounted at `/media/usb`
- ✅ Videos: Accessible via API
- ✅ HDMI: Configured for video output
- ✅ Audio: Routed to HDMI/TV

### API Responses

**Health Check**:
```json
{
  "status": "healthy",
  "goblinId": "goblin1",
  "uptime": 123.45,
  "connected": false
}
```

**Media List**:
```json
{
  "video": [
    {
      "filename": "halloween/ghost1.mp4",
      "size": 12345678,
      "type": "video",
      "source": "usb",
      "extension": ".mp4"
    }
  ],
  "audio": []
}
```

---

## 🔧 Troubleshooting

### Common Issues

1. **Video won't play**:
   - Check GPU memory: `vcgencmd get_mem gpu` (should be 128M+)
   - Check HDMI: `tvservice -s`
   - Test VLC: `vlc --version`

2. **No audio**:
   - Force HDMI: `sudo amixer cset numid=3 2`
   - Set volume: `sudo amixer set Master 80%`

3. **USB not mounted**:
   - Check devices: `lsblk`
   - Mount manually: `sudo mount /dev/sda1 /media/usb`

4. **Service won't start**:
   - Check logs: `sudo journalctl -u goblin -n 50`
   - Check Node.js: `node --version`

---

## 📁 Files Created/Modified

### New Files
- `goblin-system/setup-goblin1.sh` - Automated setup script
- `goblin-system/test-usb-video.sh` - Video testing tool
- `goblin-system/GOBLIN1_DEPLOYMENT.md` - Complete deployment guide
- `goblin-system/QUICK_START.md` - Quick reference card
- `GOBLIN1_SETUP_SUMMARY.md` - This file

### Modified Files
- `goblin-system/src/fileManager.js` - Added USB video support

### Git Ignore
- USB videos are NOT tracked (already in `.gitignore`)
- `goblin-system/media/` is ignored
- All video formats (*.mp4, *.avi, etc.) are ignored

---

## 🎯 Next Steps

1. **Deploy to Goblin-1**:
   ```bash
   scp -r goblin-system pi@192.168.8.160:~/
   ssh pi@192.168.8.160
   cd ~/goblin-system
   ./setup-goblin1.sh
   ```

2. **Test video playback**:
   ```bash
   ./test-usb-video.sh
   ```

3. **Verify smooth playback on TV**:
   - Video should play fullscreen
   - Audio should come through TV speakers
   - Playback should be smooth (no stuttering)
   - Video should loop continuously

4. **Test from MonsterBox**:
   ```bash
   curl http://192.168.8.160:3001/health
   curl http://192.168.8.160:3001/media
   ```

5. **Once verified, proceed with**:
   - Integration testing with MonsterBox
   - Scene creation with Goblin video steps
   - Multi-Goblin coordination testing

---

## 📞 Support

- **Full Guide**: See `goblin-system/GOBLIN1_DEPLOYMENT.md`
- **Quick Reference**: See `goblin-system/QUICK_START.md`
- **Logs**: `sudo journalctl -u goblin -f`
- **Status**: `sudo systemctl status goblin`

---

**Ready to deploy and test! 🎃👹**

