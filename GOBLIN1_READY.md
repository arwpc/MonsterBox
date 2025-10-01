# 🎃 Goblin-1 Deployment Package - READY

Complete setup package for Goblin-1 video playback system with USB stick support.

---

## 📦 Package Contents

### Core Files
- ✅ **goblin-system/setup-goblin1.sh** - Automated setup script (9.8K)
- ✅ **goblin-system/test-usb-video.sh** - Video testing tool (4.4K)
- ✅ **goblin-system/src/fileManager.js** - Enhanced with USB support

### Documentation
- ✅ **goblin-system/README_GOBLIN1.md** - Quick setup guide
- ✅ **goblin-system/QUICK_START.md** - Quick reference card
- ✅ **goblin-system/GOBLIN1_DEPLOYMENT.md** - Complete deployment guide
- ✅ **GOBLIN1_SETUP_SUMMARY.md** - Setup summary
- ✅ **GOBLIN1_DEPLOYMENT_CHECKLIST.md** - Deployment checklist

---

## 🎯 Target System

- **Device**: Raspberry Pi @ 192.168.8.160
- **Hostname**: goblin1
- **Port**: 3001
- **Video Source**: USB stick → /media/usb
- **Video Output**: HDMI1 → TV
- **Key Feature**: Videos stay on USB, never copied to Git repo

---

## 🚀 Deploy Now (5 Minutes)

```bash
# 1. Copy to Goblin-1
cd MonsterBox
scp -r goblin-system pi@192.168.8.160:~/

# 2. SSH and setup
ssh pi@192.168.8.160
cd ~/goblin-system
./setup-goblin1.sh

# 3. Reboot if needed
sudo reboot

# 4. Start and test
sudo systemctl start goblin
./test-usb-video.sh
```

---

## ✅ What It Does

1. **Sets up hostname and network** (goblin1 @ 192.168.8.160)
2. **Installs dependencies** (VLC, ffmpeg, Node.js)
3. **Mounts USB stick** (auto-mount on boot)
4. **Configures HDMI** (GPU memory, audio output)
5. **Installs Goblin service** (auto-start on boot)
6. **Creates REST API** (port 3001)
7. **Enables video playback** (fullscreen, looping, smooth)

---

## 🎬 Key Features

- ✅ **No Git Bloat** - Videos stay on USB only
- ✅ **Auto-Mount** - USB mounts on boot
- ✅ **Recursive Scan** - Finds videos in subdirectories
- ✅ **HDMI Optimized** - GPU, audio, fullscreen
- ✅ **Systemd Service** - Auto-start with restart
- ✅ **REST API** - Remote control capability
- ✅ **Health Monitoring** - Status endpoints

---

## 🧪 Quick Tests

```bash
# Service status
sudo systemctl status goblin

# API health
curl http://localhost:3001/health

# List videos
curl http://localhost:3001/media | jq

# Test playback
./test-usb-video.sh
```

---

## 📚 Documentation

Start here: **goblin-system/README_GOBLIN1.md**

Then see:
- **QUICK_START.md** - Common commands
- **GOBLIN1_DEPLOYMENT.md** - Full guide with troubleshooting
- **GOBLIN1_DEPLOYMENT_CHECKLIST.md** - Step-by-step checklist

---

## ✅ Success Criteria

- ✅ Service running and healthy
- ✅ API responding on port 3001
- ✅ USB mounted with videos
- ✅ Video plays smoothly on TV
- ✅ Audio through TV speakers
- ✅ Reachable from MonsterBox

---

## 🎯 Next Steps

1. Deploy to Goblin-1 using setup script
2. Test video playback on TV
3. Verify smooth playback and audio
4. Test API from MonsterBox
5. Proceed with integration testing

---

**All files ready for deployment! 🎃👹**

Run: `cd goblin-system && ./setup-goblin1.sh`
