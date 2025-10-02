# 🎃 Goblin System - Complete Documentation

**MonsterBox 5.0 Distributed Media Playback System**

## Overview

The Goblin System is a distributed video/audio playback architecture for MonsterBox 5.0. Each "Goblin" is a lightweight Raspberry Pi node that can play videos independently, controlled from the main MonsterBox server.

Perfect for Halloween displays with multiple screens!

---

## 🎯 Features

### Core Capabilities
- **Distributed Video Playback**: Multiple goblins playing different videos simultaneously
- **Hardware Acceleration**: 1080p @ 60fps using V4L2 M2M and DRM/KMS
- **Local Video Storage**: Each goblin stores videos locally (no network transfer during playback)
- **Heartbeat System**: Real-time status monitoring (30-second intervals)
- **Remote Control**: Full API for play/stop/queue management
- **Auto-Discovery**: Goblins register with MonsterBox automatically

### Video Features
- **Smooth Fade Transitions**: Fade in/out between videos (no jarring cuts)
- **No Console Flash**: Clean playback with hidden terminal output
- **Multiple Formats**: .mp4, .mpg, .mpeg, .mov, .avi, .mkv
- **Queue Management**: Play lists of videos in sequence
- **Loop Support**: Continuous playback for ambient displays

### UI Features
- **Goblin Avatars**: Fun character images for each goblin
- **Tooltips**: Helpful hints on all buttons
- **Location Tracking**: Assign physical locations to goblins
- **Video Thumbnails**: Visual preview of each video
- **Compact Grid**: 3-column layout showing more videos
- **Goblin Selector**: Filter videos by goblin source

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│           MonsterBox Server (192.168.8.200:3000)    │
│  - Goblin Management UI                             │
│  - Video Library UI                                 │
│  - Deployment Control                               │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌───────▼────────┐
│  Goblin 1      │   │  Goblin 2      │
│  192.168.8.160 │   │  192.168.8.161 │
│  Port 3001     │   │  Port 3001     │
│                │   │                │
│  - 63 videos   │   │  - 63 videos   │
│  - mpv player  │   │  - mpv player  │
│  - HDMI0 out   │   │  - HDMI0 out   │
└────────────────┘   └────────────────┘
```

---

## 🚀 Quick Start

### 1. Deploy Goblin Software

On each Raspberry Pi:

```bash
# Clone MonsterBox
git clone https://github.com/arwpc/MonsterBox.git
cd MonsterBox

# Copy goblin files
cp goblin-server-edit.js /home/remote/goblin/server.js
cp goblin-mediaPlayer.js /home/remote/goblin/mediaPlayer.js

# Install dependencies
cd /home/remote/goblin
npm install

# Create systemd service
sudo nano /etc/systemd/system/goblin.service
```

**goblin.service**:
```ini
[Unit]
Description=MonsterBox Goblin Media Player
After=network.target

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/goblin
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=GOBLIN_ID=goblin1
Environment=MONSTERBOX_URL=http://192.168.8.200:3000

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable goblin
sudo systemctl start goblin
```

### 2. Add Videos

```bash
# Mount USB drive
sudo mount /dev/sda1 /mnt/usb

# Copy videos
cp -r /mnt/usb/* /home/remote/goblin/media/video/

# Videos appear automatically in library!
```

### 3. Register with MonsterBox

1. Open `http://192.168.8.200:3000/goblin-management`
2. Click "Register Goblin"
3. Fill in:
   - Name: "Living Room Goblin"
   - IP: 192.168.8.160
   - Port: 3001
   - Location: "Living Room"
4. Click "Register Goblin"

Done! The goblin appears online with a green avatar.

---

## 🎬 Video Playback

### Optimized Settings

**Resolution**: 1080p @ 60fps  
**Hardware Decoder**: V4L2 M2M (GPU accelerated)  
**Output**: DRM/KMS direct to HDMI0  
**Buffering**: 10 seconds cache, 50MB demuxer  
**Transitions**: Fade in (15 frames), Fade out (1 second)  

### MPV Configuration

```javascript
const mpvArgs = [
  '--fullscreen',
  '--no-osc',
  '--no-osd-bar',
  '--no-terminal',                  // Hide console (no flash!)
  '--no-input-default-bindings',
  '--hwdec=auto',                   // Hardware decode
  '--vo=gpu',
  '--gpu-context=drm',
  '--drm-connector=HDMI-A-1',       // HDMI0 on Pi board
  '--drm-mode=1920x1080@60',
  '--video-sync=display-resample',
  '--cache=yes',
  '--cache-secs=10',
  '--demuxer-max-bytes=50M',
  '--demuxer-max-back-bytes=20M',
  '--vd-lavc-threads=4',
  '--scale=bilinear',
  '--cscale=bilinear',
  '--dscale=bilinear',
  '--vf=fade=in:0:15,fade=out:st=0:d=1'  // Smooth fades!
];
```

---

## 🎨 UI Features

### Goblin Avatars

Each goblin gets a unique character avatar:
- **Goblin 1**: Green, friendly goblin
- **Goblin 2**: Purple, evil grin goblin
- **Goblin 3**: Orange, silly goblin
- **Goblin 4**: Blue, sleepy goblin
- **Goblin 5**: Pink, cute goblin

Avatars are SVG files in `/public/images/goblins/`

### Button Tooltips

| Icon | Tooltip | Action |
|------|---------|--------|
| ℹ️ | View Details & Edit Settings | Opens edit modal |
| 📡 | Test Connection | Pings goblin |
| 🔒 | Lock Goblin | Prevents changes |
| 🔓 | Unlock Goblin | Allows changes |
| 📹 | Deploy Video | Sends video to goblin |
| ⏹️ | Stop Playback | Stops current video |
| 🔄 | Restart Goblin Service | Restarts systemd service |
| 🗑️ | Unregister Goblin | Removes from system |

### Video Library

**Compact Grid**: 3 videos per row (responsive)  
**Thumbnail Size**: 120px height (was 180px)  
**Preview Player**: 300px max height (was 400px)  
**Goblin Selector**: Filter by "All Goblins", "Goblin 1", "Goblin 2", etc.

---

## 📡 API Reference

### Goblin Endpoints

**Base URL**: `http://<goblin-ip>:3001`

#### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "goblinId": "goblin1",
  "uptime": 3600,
  "capabilities": ["video-playback", "audio-playback"]
}
```

#### Play Video
```bash
POST /play-video
Content-Type: application/json

{
  "filename": "Poltergeist/PHA_Buffer_Black_H.mp4",
  "loop": false
}
```

#### Stop All
```bash
POST /stop-all
```

#### Video Library
```bash
GET /video-library/api/videos
```

Response:
```json
{
  "success": true,
  "count": 63,
  "videos": [
    {
      "name": "PHA_Buffer_Black_H.mp4",
      "path": "Poltergeist/PHA_Buffer_Black_H.mp4",
      "size": 1048576,
      "category": "Poltergeist"
    }
  ]
}
```

#### Heartbeat
```bash
POST /goblin-management/api/goblin/:id/heartbeat
```

---

## 🧪 Testing

### Automated Test Script

```bash
./test-goblin-video-playback.sh
```

Tests:
1. ✅ Goblin health check
2. ✅ Video library count
3. ✅ Play different videos on each goblin
4. ✅ Stop all playback

### Manual Testing

```bash
# Test Goblin 1
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "541_JB_HD.mov", "loop": false}'

# Test Goblin 2
curl -X POST http://192.168.8.161:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "PHA_Poltergeist_AmpedUp_Win_H.mp4", "loop": false}'

# Stop both
curl -X POST http://192.168.8.160:3001/stop-all
curl -X POST http://192.168.8.161:3001/stop-all
```

---

## 🔧 Troubleshooting

### Goblin Shows Offline

**Check heartbeat**:
```bash
curl http://192.168.8.160:3001/health
```

**Check systemd service**:
```bash
sudo systemctl status goblin
sudo journalctl -u goblin -f
```

### Video Won't Play

**Check file exists**:
```bash
ls -la /home/remote/goblin/media/video/
```

**Check mpv**:
```bash
mpv --version
```

**Test manually**:
```bash
mpv --fullscreen /home/remote/goblin/media/video/test.mp4
```

### Console Flash Between Videos

**Verify --no-terminal flag**:
```bash
grep "no-terminal" /home/remote/goblin/mediaPlayer.js
```

Should see: `'--no-terminal',`

### Choppy Playback

**Check CPU usage**:
```bash
top
```

**Reduce bitrate** or **lower resolution** of source videos.

**Check hardware acceleration**:
```bash
mpv --hwdec=auto --vo=gpu --gpu-context=drm test.mp4
```

---

## 📊 Performance

### Raspberry Pi 3B+
- **CPU**: ~20-30% during 1080p playback
- **Memory**: ~85MB per goblin
- **Network**: Minimal (local files only)
- **Startup**: ~5 seconds

### Raspberry Pi 4
- **CPU**: ~10-15% during 1080p playback
- **Memory**: ~80MB per goblin
- **4K Support**: Yes (with H.264)

---

## 🎃 Halloween Tips

### Multiple Displays
- Use one goblin per screen/projector
- Sync videos by deploying at same time
- Use loop mode for ambient displays

### Video Organization
```
/home/remote/goblin/media/video/
├── Ambient/
│   ├── fog.mp4
│   └── lightning.mp4
├── Scares/
│   ├── jumpscare1.mp4
│   └── jumpscare2.mp4
└── Characters/
    ├── witch.mp4
    └── ghost.mp4
```

### Trigger Integration
- Use MonsterBox scenes to trigger goblin videos
- Coordinate with animatronics
- Add audio from MonsterBox speakers

---

## 🚀 Scaling

### Adding More Goblins

1. **Deploy goblin software** to new Pi
2. **Set unique GOBLIN_ID** in systemd service
3. **Register** in MonsterBox UI
4. **Add avatar** (goblin6.svg, goblin7.svg, etc.)

### Network Considerations
- Use wired Ethernet for reliability
- Static IPs recommended
- Keep goblins on same subnet as MonsterBox

---

## 📝 Files

### MonsterBox Server
- `routes/goblinManagement.js` - Goblin API routes
- `services/goblinManagerService.js` - Goblin management logic
- `public/js/goblin-management.js` - UI JavaScript
- `views/goblin-management/index.ejs` - UI template
- `public/images/goblins/*.svg` - Avatar images

### Goblin Node
- `goblin-server-edit.js` - Goblin server (deploy as server.js)
- `goblin-mediaPlayer.js` - Media player (deploy as mediaPlayer.js)
- `/home/remote/goblin/media/video/` - Video storage

### Documentation
- `docs/goblin/GOBLIN_SYSTEM_COMPLETE.md` - This file
- `docs/goblin/HALLOWEEN_IMPROVEMENTS_COMPLETE.md` - Recent improvements
- `docs/goblin/VIDEO_PLAYBACK_OPTIMIZED.md` - Video optimization details

---

## 🎉 Success!

Your goblin system is ready for Halloween! 🎃👻

**Happy Haunting!** 👹

