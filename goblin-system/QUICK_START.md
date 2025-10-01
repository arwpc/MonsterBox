# Goblin-1 Quick Start Guide

**Target**: `goblin1` @ `192.168.8.160:3001`

---

## 🚀 Deploy to Goblin-1

### From Development Machine

```bash
# 1. Copy files to Goblin-1
cd MonsterBox
scp -r goblin-system pi@192.168.8.160:~/

# 2. SSH into Goblin-1
ssh pi@192.168.8.160

# 3. Run setup script
cd ~/goblin-system
./setup-goblin1.sh

# 4. Reboot if needed (hostname/GPU changes)
sudo reboot

# 5. Start Goblin service
sudo systemctl start goblin
sudo systemctl status goblin
```

---

## 🎬 Test Video Playback

### Quick Test (Interactive)

```bash
cd ~/goblin-system
./test-usb-video.sh
```

This will:
- Check USB mount
- List all videos
- Let you select one to play
- Play fullscreen on HDMI with loop

### Direct VLC Test

```bash
# Find a video
ls /media/usb/*.mp4

# Play with VLC
vlc --fullscreen --loop /media/usb/your-video.mp4
```

---

## 🔍 Check Status

### Service Status
```bash
sudo systemctl status goblin
```

### View Logs
```bash
# Real-time
sudo journalctl -u goblin -f

# Last 50 lines
sudo journalctl -u goblin -n 50
```

### API Health Check
```bash
curl http://localhost:3001/health
```

### List Available Videos
```bash
curl http://localhost:3001/media | jq '.video'
```

---

## 🎮 Control Goblin

### Play Video
```bash
curl -X POST http://localhost:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "your-video.mp4", "loop": true}'
```

### Stop All Playback
```bash
curl -X POST http://localhost:3001/stop-all
```

### Get System Info
```bash
curl http://localhost:3001/info | jq
```

---

## 🔧 Common Commands

### Service Management
```bash
sudo systemctl start goblin      # Start service
sudo systemctl stop goblin       # Stop service
sudo systemctl restart goblin    # Restart service
sudo systemctl status goblin     # Check status
```

### USB Management
```bash
# Check USB mount
mountpoint /media/usb

# List videos on USB
find /media/usb -name "*.mp4"

# Remount USB
sudo umount /media/usb
sudo mount /dev/sda1 /media/usb
```

### HDMI/Audio
```bash
# Check HDMI status
tvservice -s

# Set HDMI audio
sudo amixer cset numid=3 2

# Set volume
sudo amixer set Master 80%

# Test audio
speaker-test -c2 -twav
```

### System Info
```bash
# GPU memory
vcgencmd get_mem gpu

# Temperature
vcgencmd measure_temp

# IP address
hostname -I

# Disk space
df -h
```

---

## 🐛 Quick Troubleshooting

### Video won't play
```bash
# Check GPU memory (should be 128M+)
vcgencmd get_mem gpu

# Check HDMI
tvservice -s

# Test VLC
vlc --version
```

### No audio
```bash
# Force HDMI audio
sudo amixer cset numid=3 2
sudo amixer set Master 80%
```

### USB not mounted
```bash
# Check devices
lsblk

# Mount manually
sudo mount /dev/sda1 /media/usb
```

### Service won't start
```bash
# Check logs
sudo journalctl -u goblin -n 50

# Check Node.js
node --version

# Reinstall dependencies
cd ~/goblin
npm install
```

---

## 📡 Test from MonsterBox

```bash
# From MonsterBox server (192.168.8.1)
curl http://192.168.8.160:3001/health
curl http://192.168.8.160:3001/media
curl http://192.168.8.160:3001/info
```

---

## 🎯 Expected Results

### Successful Setup
- ✅ Hostname: `goblin1`
- ✅ IP: `192.168.8.160`
- ✅ Service: Running
- ✅ API: Responding on port 3001
- ✅ USB: Mounted with videos
- ✅ HDMI: Video playing smoothly
- ✅ Audio: Coming through TV speakers

### API Health Response
```json
{
  "status": "healthy",
  "goblinId": "goblin1",
  "uptime": 123.45,
  "connected": false,
  "monsterboxHost": null
}
```

### Media List Response
```json
{
  "video": [
    {
      "filename": "halloween/ghost1.mp4",
      "size": 12345678,
      "type": "video",
      "source": "usb"
    }
  ],
  "audio": []
}
```

---

## 📞 Need Help?

1. Check logs: `sudo journalctl -u goblin -f`
2. Check service: `sudo systemctl status goblin`
3. Check USB: `ls /media/usb`
4. Check HDMI: `tvservice -s`
5. See full guide: `GOBLIN1_DEPLOYMENT.md`

---

**Happy Haunting! 🎃👹**

