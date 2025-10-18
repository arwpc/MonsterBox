# 🎃 Goblin Overnight Setup - Running All Night

**Date:** October 17, 2025  
**Status:** All background processes running independently

---

## ✅ Current Status

### Goblin1 (192.168.8.40)
- **Status:** ✅ ONLINE and RUNNING
- **Video:** 🔥 Playing fire video on LOOP
- **Service:** Fully deployed and operational

### Goblin2 (192.168.8.161)
- **Status:** ⏳ Waiting to come online
- **Auto-Deploy:** Monitoring every 30 seconds
- **Action:** Will auto-deploy via FACEHUGGER when detected

### Goblin3 (192.168.8.162)
- **Status:** ⏳ Waiting to come online
- **Auto-Deploy:** Monitoring every 30 seconds
- **Action:** Will auto-deploy via FACEHUGGER when detected

---

## 🤖 Background Processes Running

All processes are running **independently** with **no Augment dependency**. They will run all night.

### 1. Auto-Deploy Monitor
- **Script:** `scripts/auto-deploy-goblins.sh`
- **PID:** 60135
- **Function:** Monitors for Goblin2 and Goblin3 to come online
- **Action:** Automatically deploys Goblin service via FACEHUGGER when detected
- **Log:** `logs/auto-deploy-goblins.log`
- **Check Interval:** Every 30 seconds

### 2. USB Drive Watcher
- **Script:** `scripts/watch-usb-drives.sh`
- **PID:** 60996
- **Function:** Monitors for USB drives being plugged in
- **Action:** Automatically copies and converts videos to 720p@60fps
- **Deployment:** Copies to both Goblin1 and Goblin2
- **Log:** `logs/usb-watch-*.log`
- **Check Interval:** Every 10 seconds

---

## 📹 Video Processing

### Automatic Video Conversion
All videos are automatically converted to **720p@60Hz** as required:
- **Max Resolution:** 1280x720
- **Max Frame Rate:** 60fps
- **Codec:** H.264 (libx264)
- **Audio:** AAC 192kbps
- **Quality:** CRF 23 (medium preset)

### Already Converted Videos
Located in `data/goblin-videos/`:
- `07610c3d-6e40-4314-9f96-2f688b445ec3.mp4` (1.7M) - 4K→720p
- `c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4` (8.1M) - 4K→720p ⭐ **Currently playing on Goblin1**
- `da542d7d-7b9c-415a-adb7-cc1b3c725b66.mp4` (392K) - 1080p→720p
- `dad5cf71-097d-42a8-b310-fa6c95fd28e1.mp4` (652K) - 1080p→720p

---

## 🔧 Manual Commands

### Check Status Anytime
```bash
./scripts/check-goblin-status.sh
```

### View Auto-Deploy Log
```bash
tail -f logs/auto-deploy-goblins.log
```

### View USB Watcher Log
```bash
tail -f logs/usb-watch-*.log
```

### Check Background Processes
```bash
ps aux | grep -E "auto-deploy|watch-usb" | grep -v grep
```

### Manually Deploy a Goblin
```bash
curl -X POST http://localhost:3000/goblin-management/api/deploy-and-register \
  -H "Content-Type: application/json" \
  -d '{
    "goblinData": {
      "goblinId": "goblin-two",
      "endpoint": "http://192.168.8.161:3001",
      "capabilities": ["video", "audio"],
      "metadata": {
        "name": "Goblin Two",
        "location": "Halloween Display",
        "description": "Video display goblin"
      }
    },
    "sshPassword": "klrklr89!"
  }'
```

### Start Video Playback on a Goblin
```bash
# List available videos
curl -s http://192.168.8.40:3001/media | jq '.media.video'

# Play video on loop
curl -X POST http://192.168.8.40:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "video.mp4", "loop": true}'

# Stop playback
curl -X POST http://192.168.8.40:3001/stop-all
```

---

## 📝 What Happens Overnight

### When Goblin2/Goblin3 Power On:
1. **Auto-deploy monitor** detects them (checks every 30 seconds)
2. **FACEHUGGER deployment** automatically starts:
   - SSH connection established
   - Goblin service deployed
   - systemd service created and started
   - Health verification
3. **Video playback** automatically starts on loop
4. **Monitor exits** when both Goblins are deployed

### When USB Drives Are Plugged In:
1. **USB watcher** detects new drive (checks every 10 seconds)
2. **Scans for videos** (mp4, avi, mkv, mov)
3. **Converts each video** to 720p@60fps
4. **Deploys to Goblin1** via SCP
5. **Deploys to Goblin2** via SCP (if online)
6. **Marks drive as processed** (won't process same drive twice)
7. **Continues monitoring** for more USB drives

---

## 🎯 Next Steps (When You Return)

1. **Check status:**
   ```bash
   ./scripts/check-goblin-status.sh
   ```

2. **Review logs:**
   ```bash
   ls -lht logs/
   ```

3. **Verify all Goblins are playing videos:**
   - Goblin1: http://192.168.8.40:3001/status
   - Goblin2: http://192.168.8.161:3001/status
   - Goblin3: http://192.168.8.162:3001/status

4. **If needed, restart any stopped processes:**
   ```bash
   # Restart auto-deploy monitor
   nohup ./scripts/auto-deploy-goblins.sh > /dev/null 2>&1 &
   
   # Restart USB watcher
   nohup ./scripts/watch-usb-drives.sh > /dev/null 2>&1 &
   ```

---

## 🔥 Current Playback

**Goblin1 is currently playing:**
- **Video:** `c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4` (fire video)
- **Mode:** LOOP (continuous playback)
- **Resolution:** 1280x720 @ 60fps ✅
- **Status:** 🔥 PERFECT FIRE! 🔥

---

## 📊 System Architecture

```
MonsterBox Control (192.168.8.140)
├── Auto-Deploy Monitor (PID 60135)
│   ├── Checks Goblin2 (192.168.8.161) every 30s
│   └── Checks Goblin3 (192.168.8.162) every 30s
│
├── USB Drive Watcher (PID 60996)
│   ├── Monitors for USB drives every 10s
│   ├── Converts videos to 720p@60fps
│   ├── Deploys to Goblin1 (192.168.8.40)
│   └── Deploys to Goblin2 (192.168.8.161)
│
└── Goblin Services
    ├── Goblin1 (192.168.8.40:3001) ✅ RUNNING
    ├── Goblin2 (192.168.8.161:3001) ⏳ PENDING
    └── Goblin3 (192.168.8.162:3001) ⏳ PENDING
```

---

**All systems are running independently and will continue overnight! 🎃**

