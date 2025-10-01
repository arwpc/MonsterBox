# 🎃 Goblin-1 Video Playback Setup - COMPLETE

## ✅ What's Working

### 1. **Video Playback System**
- ✅ **ffmpeg** configured for direct framebuffer output to HDMI
- ✅ Outputs to `/dev/fb0` (HDMI port)
- ✅ Force 1080p resolution (`scale=1920:1080`)
- ✅ Correct pixel format for Pi framebuffer (`rgb565le`)
- ✅ Loop support enabled
- ✅ Currently playing: `PHA_Buffer_Black_H.mp4` (looping)

### 2. **Dynamic Video Library**
- ✅ **Auto-scanning** on every API call
- ✅ **File watchers** detect added/removed files in real-time
- ✅ **Periodic background scan** every 5 minutes
- ✅ **30-second cache** for performance
- ✅ **Manual rescan endpoint**: `POST /media/rescan`
- ✅ Supports both local and USB videos

### 3. **Video Sources**
- ✅ **USB stick** mounted at `/media/usb`
- ✅ **61 USB videos** across 8 categories
- ✅ **2 local videos** for testing
- ✅ **Total: 63 videos** ready for playback

### 4. **System Status**
- ✅ Goblin service running
- ✅ API responding on port 3001
- ✅ ffmpeg process active (PID 12802)
- ✅ Video playing to framebuffer
- ✅ Reachable from MonsterBox

---

## 📊 Current Playback Status

```bash
# Check if video is playing
ps aux | grep ffmpeg

# Output:
remote  12802  249 19.6 1302452 172372 ?  RLl  12:47   0:24 \
  ffmpeg -re -stream_loop -1 \
  -i /media/usb/video/Poltergeist/PHA_Buffer_Black_H.mp4 \
  -vf scale=1920:1080 -pix_fmt rgb565le -f fbdev /dev/fb0
```

**Playback Rate**: ~18-19 fps (Pi 3B hardware limitation)

---

## 🎬 How to Use

### Play a Video
```bash
curl -X POST http://goblin1.local:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "video/fire/541_JB_HD.mov", "loop": true}'
```

### Stop Video
```bash
curl -X POST http://goblin1.local:3001/stop-video
```

### List All Videos
```bash
curl http://goblin1.local:3001/media
```

### Force Rescan Media Library
```bash
curl -X POST http://goblin1.local:3001/media/rescan
```

---

## 📁 Video Library Structure

### USB Videos (61 files)
- **Poltergeist** (5 videos) - `video/Poltergeist/*.mp4`
- **Electric** (20 videos) - `video/electric/*.mov`
- **Ethereal** (6 videos) - `video/ethereal/*.mov`
- **Fire** (20 videos) - `video/fire/*.mov`
- **Siren** (4 videos) - `video/siren/*.mp4`
- **Spinster** (4 videos) - `video/spinster/*.mp4`
- **Walls** (4 videos) - `video/walls/*.mov`
- **Wraith** (5 videos) - `video/wraith/*.mp4`

### Local Videos (2 files)
- `poltergeist_scare.mp4`
- `wraith_scare.mp4`

---

## 🔧 Technical Details

### Video Player Configuration
- **Player**: ffmpeg (hardware-accelerated framebuffer output)
- **Output Device**: `/dev/fb0` (HDMI)
- **Resolution**: 1920x1080 (forced)
- **Pixel Format**: `rgb565le` (Pi framebuffer compatible)
- **Loop Mode**: Supported via `-stream_loop -1`
- **Frame Rate**: Native input rate with `-re` flag

### File Manager Features
- **Real-time file watching** on local directories
- **Recursive USB scanning** with subdirectory support
- **Cache system** (30-second TTL) for performance
- **Background scanning** every 5 minutes
- **Automatic cache invalidation** on file changes
- **Source tracking** (local vs USB)

### Path Resolution
- USB videos: `video/...` → `/media/usb/video/...`
- Local videos: `filename.mp4` → `/home/remote/goblin/media/video/filename.mp4`
- Absolute paths: Used as-is

---

## 🎯 Next Steps

### 1. **Verify Video on TV**
- Check if video is visible on HDMI1 TV
- Verify 1080p resolution
- Check if video loops smoothly
- Verify audio output (if applicable)

### 2. **Performance Optimization** (if needed)
If playback is choppy:
- Try smaller resolution videos
- Use hardware-accelerated codecs (H.264)
- Consider using omxplayer for Pi 3B (if available)
- Reduce video bitrate

### 3. **Add More Videos**
The system will automatically detect new videos:
- Copy to `/media/usb/video/` (USB)
- Copy to `/home/remote/goblin/media/video/` (local)
- Wait 30 seconds or call `/media/rescan`

### 4. **Integration Testing**
- Test from MonsterBox control panel
- Create scenes with Goblin video steps
- Test coordinated multi-Goblin playback
- Test emergency stop functionality

---

## 📞 Connection Info

- **Hostname**: goblin1 / goblin1.local
- **IP Address**: 192.168.8.160
- **Port**: 3001
- **SSH**: `ssh remote@goblin1.local` (password: klrklr89!)
- **API**: `http://goblin1.local:3001`

---

## 🐛 Troubleshooting

### Video Not Playing
```bash
# Check if ffmpeg is running
ps aux | grep ffmpeg

# Check logs
tail -f /home/remote/goblin/logs/goblin.log

# Restart service
sudo systemctl restart goblin
```

### Port Already in Use
```bash
# Find process using port 3001
sudo lsof -i :3001

# Kill the process
sudo kill -9 <PID>

# Start service
sudo systemctl start goblin
```

### Video Library Not Updating
```bash
# Force rescan
curl -X POST http://goblin1.local:3001/media/rescan

# Check file watchers
tail -f /home/remote/goblin/logs/goblin.log | grep "Detected"
```

---

## 🎃 Status: READY FOR TESTING

**Goblin-1 is now configured and playing video to HDMI!**

Please verify:
1. ✅ Video visible on TV connected to HDMI1
2. ⏳ Video plays smoothly (check frame rate)
3. ⏳ Video loops continuously
4. ⏳ Audio works (if video has audio)

Once verified, we can proceed with the exhaustive testing phase!

