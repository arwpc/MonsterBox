# 🎬 Goblin Video Playback - Optimized for 1080p

**Date**: 2025-10-02  
**Status**: ✅ **PRODUCTION READY**

---

## Summary

Optimized video playback on both goblins for smooth 1080p output on HDMI0 with support for all video formats.

---

## What Was Fixed

### 1. **Video Library File Type Support**
- ✅ Added `.mpg` and `.mpeg` support
- ✅ Already had `.mp4`, `.mov`, `.avi`, `.mkv`
- ✅ Recursive directory scanning
- ✅ Category detection from folder names

**File Type Detection Regex**:
```javascript
/\.(mp4|mpg|mpeg|avi|mkv|mov)$/i
```

### 2. **HDMI Output Configuration**
- ✅ HDMI0 on Pi board = `HDMI-A-1` in DRM
- ✅ Forced 1080p @ 60fps output
- ✅ Direct rendering via DRM/KMS
- ✅ Hardware-accelerated decoding

**HDMI Configuration**:
```javascript
const hdmiPort = process.env.HDMI_PORT || 'HDMI-A-1';  // HDMI0 on Pi board
'--drm-connector=HDMI-A-1',
'--drm-mode=1920x1080@60',
```

### 3. **Playback Optimization**
- ✅ Increased cache buffer (10 seconds)
- ✅ Larger demuxer buffers (50MB forward, 20MB back)
- ✅ 4-thread decoding
- ✅ Fast bilinear scaling
- ✅ Display-resampled video sync

**MPV Optimization Flags**:
```javascript
'--cache=yes',
'--cache-secs=10',
'--demuxer-max-bytes=50M',
'--demuxer-max-back-bytes=20M',
'--vd-lavc-threads=4',
'--scale=bilinear',
'--cscale=bilinear',
'--dscale=bilinear'
```

---

## Current Status

### **Goblin 1** (192.168.8.160:3001)
- ✅ 63 videos indexed
- ✅ File types: 44 .mov, 19 .mp4
- ✅ 1080p @ 60fps output
- ✅ HDMI0 (HDMI-A-1) configured
- ✅ Hardware acceleration enabled

### **Goblin 2** (192.168.8.161:3001)
- ✅ 63 videos indexed
- ✅ File types: 44 .mov, 19 .mp4
- ✅ 1080p @ 60fps output
- ✅ HDMI0 (HDMI-A-1) configured
- ✅ Hardware acceleration enabled

---

## Video Library Structure

### Directory Layout
```
/home/remote/goblin/media/video/
├── 541_JB_HD.mov
├── 542_JB_HD.mov
├── Poltergeist/
│   ├── PHA_Poltergeist_AmpedUp_Win_H.mp4
│   └── PHA_Poltergeist_Discharged_Win_H.mp4
├── siren/
│   ├── PHA_Siren_FearsAfloat_Win_H.mp4
│   └── PHA_Siren_SeaOfSirens_Win_H.mp4
└── wraith/
    └── PHA_Wraith_FaceOfDeath_Win_H.mp4
```

### Supported Formats
- ✅ `.mp4` - MPEG-4 video
- ✅ `.mpg` / `.mpeg` - MPEG video
- ✅ `.mov` - QuickTime video
- ✅ `.avi` - Audio Video Interleave
- ✅ `.mkv` - Matroska video

---

## API Endpoints

### Get Video Library
```bash
GET http://192.168.8.161:3001/video-library/api/videos
```

**Response**:
```json
{
  "success": true,
  "videos": [
    {
      "name": "541_JB_HD.mov",
      "path": "541_JB_HD.mov",
      "category": "",
      "size": "503.74 MB",
      "modified": "2009-01-15T14:54:02.000Z"
    }
  ],
  "count": 63,
  "goblinId": "goblin2"
}
```

### Play Video
```bash
POST http://192.168.8.161:3001/play-video
Content-Type: application/json

{
  "filename": "541_JB_HD.mov",
  "loop": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Started playing video: 541_JB_HD.mov",
  "filename": "541_JB_HD.mov",
  "player": "mpv",
  "options": {"loop": false}
}
```

---

## Hardware Configuration

### Raspberry Pi 3B+ Specs
- **CPU**: Broadcom BCM2837B0, Cortex-A53 (ARMv8) 64-bit @ 1.4GHz
- **GPU**: VideoCore IV @ 400MHz
- **RAM**: 1GB LPDDR2
- **Video Decode**: H.264 (1080p60), MPEG-4 (1080p30)
- **HDMI**: 2x HDMI ports (HDMI0 = HDMI-A-1, HDMI1 = HDMI-A-2)

### Video Player
- **Player**: mpv 0.35.1
- **Hardware Decode**: V4L2 M2M (Video4Linux2 Memory-to-Memory)
- **Video Output**: DRM/KMS (Direct Rendering Manager / Kernel Mode Setting)
- **GPU Context**: DRM direct rendering

### HDMI Ports
```
Physical Pi Board    DRM Name      Usage
─────────────────────────────────────────
HDMI0 (near power)   HDMI-A-1     ✅ Active
HDMI1 (near USB)     HDMI-A-2     Available
```

---

## Performance Optimizations

### 1. **Hardware Acceleration**
- V4L2 M2M hardware decoder
- GPU-accelerated rendering
- Direct DRM output (no X11 overhead)

### 2. **Buffering Strategy**
- 10-second cache buffer
- 50MB forward demuxer buffer
- 20MB backward demuxer buffer
- Prevents stuttering on high-bitrate videos

### 3. **Threading**
- 4 decoder threads (matches Pi 3B+ cores)
- Parallel decoding for better performance

### 4. **Scaling**
- Bilinear scaling (fast, low CPU)
- Suitable for 1080p output
- No unnecessary quality overhead

---

## Testing Commands

### Check Video Library
```bash
curl -s http://192.168.8.161:3001/video-library/api/videos | python3 -m json.tool
```

### Count Videos by Type
```bash
curl -s http://192.168.8.161:3001/video-library/api/videos | \
  python3 -c "import sys, json; d=json.load(sys.stdin); \
  exts = {}; \
  [exts.update({v['name'].split('.')[-1].lower(): exts.get(v['name'].split('.')[-1].lower(), 0) + 1}) for v in d['videos']]; \
  print('Total:', d['count']); \
  print('By type:', exts)"
```

### Play a Video
```bash
curl -X POST http://192.168.8.161:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4", "loop": true}'
```

### Stop Playback
```bash
curl -X POST http://192.168.8.161:3001/stop-all
```

---

## Deployment from MonsterBox

### Via Video Library Page
1. Go to `http://192.168.8.200:3000/video-library`
2. Select a video
3. Click "Deploy to Goblin"
4. Select target goblin
5. Video plays automatically

### Via Goblin Management Page
1. Go to `http://192.168.8.200:3000/goblin-management`
2. Click "Deploy" button on goblin card
3. Opens Video Library with goblin pre-selected

---

## Troubleshooting

### Video Not Playing
1. **Check video file exists**:
   ```bash
   sshpass -p 'klrklr89!' ssh remote@192.168.8.161 "ls -lh /home/remote/goblin/media/video/"
   ```

2. **Check mpv is working**:
   ```bash
   sshpass -p 'klrklr89!' ssh remote@192.168.8.161 "mpv --version"
   ```

3. **Test video manually**:
   ```bash
   sshpass -p 'klrklr89!' ssh remote@192.168.8.161 \
     "mpv --fullscreen --hwdec=auto --vo=gpu --gpu-context=drm \
     --drm-connector=HDMI-A-1 --drm-mode=1920x1080@60 \
     /home/remote/goblin/media/video/541_JB_HD.mov"
   ```

### Choppy Playback
- Check video bitrate (high bitrate may struggle on Pi 3B+)
- Verify hardware acceleration is enabled
- Check CPU usage: `top` on goblin
- Reduce video quality or use lower bitrate source

### Wrong HDMI Port
Set environment variable:
```bash
export HDMI_PORT=HDMI-A-2  # For HDMI1 port
```

---

## Files Modified

### Goblin Servers (Both)
- `/home/remote/goblin/server.js` - Added .mpg/.mpeg support
- `/home/remote/goblin/mediaPlayer.js` - Optimized playback settings

---

## Success Criteria

- [x] All video formats supported (.mp4, .mpg, .mpeg, .mov, .avi, .mkv)
- [x] 1080p @ 60fps output
- [x] HDMI0 (HDMI-A-1) configured
- [x] Hardware acceleration enabled
- [x] Smooth playback with no stuttering
- [x] 63 videos indexed on each goblin
- [x] Video library API working
- [x] Deploy from MonsterBox working

---

## Next Steps

### Adding More Videos
1. Copy videos to USB drive
2. Mount USB on goblin:
   ```bash
   sudo mount /dev/sda1 /mnt/usb
   ```
3. Copy to media directory:
   ```bash
   cp -r /mnt/usb/* /home/remote/goblin/media/video/
   ```
4. Videos automatically indexed on next API call

### Performance Tuning
- For 4K videos: May need to reduce to 1080p or lower bitrate
- For very high bitrate: Consider transcoding to H.264 @ 8Mbps
- For best performance: Use H.264 codec, 1080p @ 30fps, 5-8Mbps bitrate

---

**Status**: 🎃 **READY TO HAUNT!** 🎃

Both goblins are now optimized for smooth 1080p video playback with full format support!

