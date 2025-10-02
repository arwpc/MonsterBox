# 🎃 MonsterBox Goblin Production Deployment Guide

## Overview

This guide will help you deploy **goblin1** and **goblin2** as production-ready, plug-and-play video playback systems that automatically start on boot and wait for commands from MonsterBox, just like the main MonsterBox 5.0 Gold application.

## Production Features

✅ **Auto-start on boot** - Goblins start automatically when powered on  
✅ **Auto-registration** - Automatically discover and register with MonsterBox  
✅ **Auto-reconnect** - Reconnect automatically if network drops  
✅ **Plug-and-play** - No manual intervention needed after deployment  
✅ **Production logging** - Comprehensive logging for troubleshooting  
✅ **Systemd service** - Managed by systemd like MonsterBox main app  

## System Requirements

### Hardware
- Raspberry Pi 3B+ or better (Pi 5 recommended for 4K)
- 8GB+ microSD card
- HDMI display/projector
- Network connection (WiFi or Ethernet)
- USB stick with videos (optional)

### Software
- Raspberry Pi OS (Bullseye or newer)
- Node.js 18+
- npm 8+

## Quick Deployment

### For goblin1 (192.168.8.160)

```bash
# SSH into goblin1
ssh remote@192.168.8.160

# Clone or copy MonsterBox repository
cd ~
git clone https://github.com/arwpc/MonsterBox.git
cd MonsterBox/goblin-system

# Set environment variables
export GOBLIN_ID="goblin1"
export GOBLIN_PORT="3001"
export MONSTERBOX_HOST="192.168.8.200"

# Run production deployment
chmod +x deploy-production.sh
./deploy-production.sh
```

### For goblin2 (192.168.8.161)

```bash
# SSH into goblin2
ssh remote@192.168.8.161

# Clone or copy MonsterBox repository
cd ~
git clone https://github.com/arwpc/MonsterBox.git
cd MonsterBox/goblin-system

# Set environment variables
export GOBLIN_ID="goblin2"
export GOBLIN_PORT="3001"
export MONSTERBOX_HOST="192.168.8.200"

# Run production deployment
chmod +x deploy-production.sh
./deploy-production.sh
```

## Configuration

### Goblin Configuration File

Located at `~/goblin/config/goblin.json`:

```json
{
  "goblinId": "goblin1",
  "version": "1.0.0",
  "deployment": {
    "timestamp": "2025-10-01T20:30:00Z",
    "deployedBy": "remote",
    "hostname": "goblin1",
    "ip": "192.168.8.160"
  },
  "settings": {
    "port": 3001,
    "autoStart": true,
    "autoRegister": true,
    "scanFrequency": 10000,
    "maxVideoResolution": "1080p",
    "audioOutput": "HDMI",
    "monsterboxHost": "192.168.8.200",
    "mediaDir": "/home/remote/goblin/media",
    "usbMountPoint": "/media/usb"
  }
}
```

### Network Configuration

| Device | IP Address | Port | Purpose |
|--------|-----------|------|---------|
| MonsterBox Main | 192.168.8.200 | 3100 | Main control system |
| goblin1 | 192.168.8.160 | 3001 | Video playback node |
| goblin2 | 192.168.8.161 | 3001 | Video playback node |

## Service Management

### Check Service Status

```bash
sudo systemctl status goblin
```

### View Live Logs

```bash
# System logs
sudo journalctl -u goblin -f

# Application logs
tail -f ~/goblin/logs/goblin.log
```

### Restart Service

```bash
sudo systemctl restart goblin
```

### Stop Service

```bash
sudo systemctl stop goblin
```

### Disable Auto-start

```bash
sudo systemctl disable goblin
```

## Testing

### Test Scene: Dual Goblin Video Playback

A test scene (ID: 16) has been created in MonsterBox to test both goblins simultaneously:

**Scene Name:** "Dual Goblin Video Test - Production Ready"

**Steps:**
1. Play `PHA_Poltergeist_AmpedUp_Win_H.mp4` on goblin1 (10 seconds)
2. Play `PHA_Wraith_FaceOfDeath_Win_H.mp4` on goblin2 (10 seconds)
3. Wait 10 seconds
4. Play `PHA_Siren_StartleScare_Win_H.mp4` on goblin1 (8 seconds)
5. Play `PHA_Spinster_StartleScare_Win_H.mp4` on goblin2 (8 seconds)
6. Wait 8 seconds

### Run Test from MonsterBox

```bash
# From MonsterBox main system (192.168.8.200)
curl -X POST http://127.0.0.1:3100/scenes/api/16/play
```

Or use the MonsterBox UI:
1. Navigate to http://192.168.8.200:3100/scenes
2. Find scene "Dual Goblin Video Test - Production Ready"
3. Click "Play Scene"

### Manual Goblin Test

Test individual goblin directly:

```bash
# Test goblin1
curl -X POST http://192.168.8.160:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "video/Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4",
    "loop": true,
    "volume": 80
  }'

# Test goblin2
curl -X POST http://192.168.8.161:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "video/wraith/PHA_Wraith_FaceOfDeath_Win_H.mp4",
    "loop": true,
    "volume": 80
  }'
```

## Troubleshooting

### Goblin Not Starting

```bash
# Check service status
sudo systemctl status goblin

# Check logs for errors
sudo journalctl -u goblin -n 50

# Check if port is in use
sudo netstat -tulpn | grep 3001
```

### Goblin Not Registering with MonsterBox

```bash
# Check network connectivity
ping 192.168.8.200

# Check if MonsterBox is running
curl http://192.168.8.200:3100/api/system/info

# Check goblin logs for beacon activity
tail -f ~/goblin/logs/goblin.log | grep beacon
```

### Video Not Playing

```bash
# Check if video file exists
ls -lh ~/goblin/media/video/

# Check mpv installation
which mpv
mpv --version

# Test video playback manually
mpv ~/goblin/media/video/Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4
```

### Audio Not Working

```bash
# Check audio output
amixer cset numid=3 2  # Set to HDMI
amixer cset numid=3 1  # Set to headphone jack

# Test audio
speaker-test -t wav -c 2
```

## Production Checklist

Before deploying to production, verify:

- [ ] Goblin service is enabled and running
- [ ] Goblin auto-starts on boot (test with reboot)
- [ ] Goblin registers with MonsterBox automatically
- [ ] Video files are accessible in media directory
- [ ] Test scene plays videos on both goblins
- [ ] Audio output is configured correctly
- [ ] Network connectivity is stable
- [ ] Logs are being written correctly
- [ ] Service restarts automatically on failure

## Reboot Test

The ultimate test - reboot the goblin and verify it comes back online automatically:

```bash
# Reboot goblin
sudo reboot

# Wait 2-3 minutes, then check from MonsterBox
curl http://192.168.8.200:3100/api/goblins

# Should show goblin as "online"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MonsterBox 5.0 Gold                      │
│                   (192.168.8.200:3100)                      │
│                                                             │
│  - Scene Management                                         │
│  - Goblin Registration                                      │
│  - Video Command Dispatch                                   │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
                  │ Commands              │ Commands
                  │                       │
         ┌────────▼────────┐     ┌───────▼─────────┐
         │    goblin1      │     │    goblin2      │
         │ (192.168.8.160) │     │ (192.168.8.161) │
         │                 │     │                 │
         │ - Auto-start    │     │ - Auto-start    │
         │ - Auto-register │     │ - Auto-register │
         │ - Video Player  │     │ - Video Player  │
         │ - mpv backend   │     │ - mpv backend   │
         └─────────────────┘     └─────────────────┘
                  │                       │
                  │ HDMI                  │ HDMI
                  │                       │
         ┌────────▼────────┐     ┌───────▼─────────┐
         │   Display 1     │     │   Display 2     │
         └─────────────────┘     └─────────────────┘
```

## Next Steps

1. Deploy to goblin1 and goblin2 using the deployment script
2. Verify both goblins register with MonsterBox
3. Run the dual goblin test scene
4. Perform reboot tests on both goblins
5. Document any custom configuration needed for your setup

## Support

For issues or questions:
- Check logs: `~/goblin/logs/goblin.log`
- Check system logs: `sudo journalctl -u goblin`
- Review this guide's troubleshooting section
- Check MonsterBox main logs for goblin registration issues

---

**Status:** Production Ready ✅  
**Version:** 1.0.0  
**Last Updated:** 2025-10-01  
**Compatible with:** MonsterBox 5.0 Gold

