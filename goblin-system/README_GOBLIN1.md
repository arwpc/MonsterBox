# Goblin-1 USB Video Playback Setup

**Quick setup guide for Goblin-1 with USB stick video playback on HDMI.**

---

## 🎯 What This Does

Sets up Goblin-1 (Raspberry Pi @ 192.168.8.160) to:
- Play videos from USB stick on TV via HDMI
- Auto-mount USB stick on boot
- Provide REST API for remote control
- Auto-start on boot with systemd service
- **Never copy videos to Git repo** (stays on USB only)

---

## 🚀 Quick Deploy

```bash
# 1. Copy files to Goblin-1
cd MonsterBox
scp -r goblin-system pi@192.168.8.160:~/

# 2. SSH and run setup
ssh pi@192.168.8.160
cd ~/goblin-system
./setup-goblin1.sh

# 3. Reboot if needed
sudo reboot

# 4. Start service
sudo systemctl start goblin

# 5. Test video
cd ~/goblin-system
./test-usb-video.sh
```

---

## 📁 Files in This Package

### Setup Scripts
- **`setup-goblin1.sh`** - Complete automated setup (run this first)
- **`test-usb-video.sh`** - Interactive video testing tool

### Documentation
- **`GOBLIN1_DEPLOYMENT.md`** - Complete deployment guide with troubleshooting
- **`QUICK_START.md`** - Quick reference card for common commands
- **`README_GOBLIN1.md`** - This file

### Code
- **`src/fileManager.js`** - Enhanced with USB video support
- **`src/server.js`** - Goblin API server
- **`src/mediaPlayer.js`** - Video/audio playback engine
- **`src/beacon.js`** - MonsterBox auto-discovery
- **`src/statusMonitor.js`** - System monitoring

---

## ✅ What Gets Configured

### System
- Hostname: `goblin1`
- Static IP: `192.168.8.160`
- GPU memory: 128M (for smooth video)
- HDMI audio: Enabled

### USB
- Mount point: `/media/usb`
- Auto-mount on boot
- Symlinked to Goblin media directory
- Recursive video scanning

### Software
- VLC media player
- ffmpeg
- Node.js 20 LTS
- Goblin system service

### Service
- Auto-start on boot
- Auto-restart on failure
- Logging to systemd journal
- API on port 3001

---

## 🧪 Testing

### Quick Test
```bash
./test-usb-video.sh
```

### API Tests
```bash
# Health check
curl http://localhost:3001/health

# List videos
curl http://localhost:3001/media | jq

# Play video
curl -X POST http://localhost:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "your-video.mp4", "loop": true}'

# Stop playback
curl -X POST http://localhost:3001/stop-all
```

---

## 🔍 Monitoring

```bash
# Service status
sudo systemctl status goblin

# Live logs
sudo journalctl -u goblin -f

# System info
curl http://localhost:3001/info | jq

# GPU temperature
vcgencmd measure_temp
```

---

## 🎬 Video Requirements

### Supported Formats
MP4, AVI, MKV, MOV, WebM, FLV

### Recommended Settings
- **Resolution**: 1080p (1920x1080)
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

---

## 🔧 Troubleshooting

### Video won't play
```bash
vcgencmd get_mem gpu  # Should be 128M+
tvservice -s          # Check HDMI
vlc --version         # Check VLC
```

### No audio
```bash
sudo amixer cset numid=3 2  # Force HDMI
sudo amixer set Master 80%  # Set volume
```

### USB not mounted
```bash
lsblk                        # Check devices
sudo mount /dev/sda1 /media/usb  # Mount manually
```

### Service won't start
```bash
sudo journalctl -u goblin -n 50  # Check logs
cd ~/goblin && npm install       # Reinstall deps
```

---

## 📚 Full Documentation

- **Quick Start**: `QUICK_START.md`
- **Full Guide**: `GOBLIN1_DEPLOYMENT.md`
- **Checklist**: `../GOBLIN1_DEPLOYMENT_CHECKLIST.md`
- **Summary**: `../GOBLIN1_SETUP_SUMMARY.md`

---

## 🎯 Success Criteria

- ✅ Service running: `sudo systemctl status goblin`
- ✅ API responding: `curl http://localhost:3001/health`
- ✅ USB mounted: `mountpoint /media/usb`
- ✅ Videos listed: `curl http://localhost:3001/media`
- ✅ Video plays smoothly on TV
- ✅ Audio through TV speakers
- ✅ Reachable from MonsterBox

---

## 🔄 Updates

To update Goblin system:

```bash
# Stop service
sudo systemctl stop goblin

# Pull latest code
cd ~/MonsterBox
git pull

# Copy updated files
cp -r goblin-system/src/* ~/goblin/

# Restart service
sudo systemctl start goblin
```

---

## 🎃 Key Features

- **No Git Bloat**: Videos stay on USB, never in repo
- **Auto-Mount**: USB mounts automatically on boot
- **Recursive Scan**: Finds videos in all subdirectories
- **HDMI Optimized**: GPU, audio, fullscreen configured
- **Systemd Service**: Auto-starts with restart on failure
- **Multiple Players**: VLC, ffplay, omxplayer support
- **REST API**: Full remote control capability
- **Health Monitoring**: Status and metrics endpoints

---

**Ready to haunt! 🎃👹**

For detailed instructions, see `GOBLIN1_DEPLOYMENT.md`

