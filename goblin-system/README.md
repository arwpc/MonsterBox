# MonsterBox Goblin System

A lightweight, native Node.js media player for distributed Halloween displays. Goblins are Raspberry Pi-based nodes that automatically discover and connect to MonsterBox instances for coordinated video and audio playback.

## 🎯 Features

- **Auto-Discovery**: Automatically finds and connects to MonsterBox on port 3000
- **Media Playback**: 4K video + concurrent audio streams using VLC
- **Remote Control**: Full API for media upload and playback control
- **Health Monitoring**: System status, hardware info, and performance metrics
- **Native Deployment**: Low-overhead Node.js application
- **Hardware Optimized**: Designed for Raspberry Pi 3B+ and Pi 4

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│              Goblin System              │
├─────────────────────────────────────────┤
│  • Media Player (VLC-based)            │
│  • Network Beacon (Auto-discovery)     │
│  • Status Monitor (Hardware/Performance)│
│  • File Manager (Media storage)        │
│  • API Server (Remote control)         │
├─────────────────────────────────────────┤
│           Docker Runtime                │
├─────────────────────────────────────────┤
│          Raspberry Pi OS                │
└─────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Raspberry Pi 3B+ or Pi 4 (4GB RAM recommended for 4K)
- Raspberry Pi OS Lite or Full
- Network connection (WiFi or Ethernet)
- HDMI display connected

### Deployment

1. **Clone and navigate to container directory:**
   ```bash
   cd MonsterBox/goblin-system
   ```

2. **Run deployment script:**
   ```bash
   ./deploy.sh
   ```

3. **The script will:**
   - Install Docker if needed
   - Build the Goblin container
   - Create media directories
   - Configure audio output (HDMI)
   - Start the container with auto-restart
   - Generate unique Goblin ID

4. **Verify deployment:**
   ```bash
   curl http://localhost:3001/health
   ```

## 📡 Auto-Discovery Process

1. Goblin scans local network for MonsterBox instances on port 3000
2. Tests discovered hosts for MonsterBox API endpoints
3. Establishes WebSocket connection when MonsterBox found
4. Registers capabilities and hardware info
5. Receives and executes media playback commands

## 🎬 Media Management

### Supported Formats
- **Video**: MP4, AVI, MKV, MOV, WebM, FLV
- **Audio**: MP3, WAV, AAC, OGG, FLAC, M4A

### File Locations
- **Video**: `/opt/goblin-media/video/`
- **Audio**: `/opt/goblin-media/audio/`
- **Config**: `/opt/goblin-config/`
- **Logs**: `/opt/goblin-logs/`

### Upload Media Files
```bash
# Copy files directly
sudo cp your-video.mp4 /opt/goblin-media/video/
sudo cp your-audio.mp3 /opt/goblin-media/audio/

# Or use API (from MonsterBox)
curl -X POST http://goblin-ip:3001/upload-video \
  -F "file=@your-video.mp4"
```

## 🔌 API Endpoints

### Health & Status
- `GET /health` - Health check with connection status
- `GET /info` - Complete Goblin information and capabilities
- `GET /status` - Real-time system and hardware status

### Media Control
- `POST /play-video` - Play video file
  ```json
  { "filename": "video.mp4", "loop": false }
  ```
- `POST /play-audio` - Play audio file
  ```json
  { "filename": "audio.mp3", "volume": 0.8 }
  ```
- `POST /stop-all` - Stop all media playback

### File Management
- `GET /media` - List all media files
- `DELETE /media/{filename}` - Delete media file

## 🛠️ Configuration

### Environment Variables
- `GOBLIN_ID` - Unique Goblin identifier (auto-generated)
- `GOBLIN_PORT` - API server port (default: 3001)

### Hardware Optimization

#### For Pi 4 (4K Video)
Add to `/boot/config.txt`:
```
gpu_mem=128
hdmi_force_hotplug=1
hdmi_drive=2
```

#### For Pi 3B+ (1080p Video)
Add to `/boot/config.txt`:
```
gpu_mem=64
hdmi_force_hotplug=1
hdmi_drive=2
```

## 📊 Monitoring

### System Logs
```bash
docker logs monsterbox-goblin -f
```

### System Status
```bash
curl http://localhost:3001/status | jq
```

### Hardware Info
```bash
curl http://localhost:3001/info | jq '.hardware'
```

## 🔧 Troubleshooting

### System Won't Start
```bash
# Check Docker status
sudo systemctl status docker

# Check system logs
npm run logs

# Restart system
npm run restart
```

### Audio Issues
```bash
# Check audio devices
aplay -l

# Force HDMI audio
sudo amixer cset numid=3 2

# Test audio playback
speaker-test -c2 -twav
```

### Video Issues
```bash
# Check GPU memory
vcgencmd get_mem gpu

# Check HDMI status
tvservice -s

# Test VLC installation
vlc --version
```

### Network Discovery Issues
```bash
# Check network connectivity
ping 8.8.8.8

# Check if MonsterBox is reachable
curl http://monsterbox-ip:3000/api/system/info

# Check Goblin network scanning
docker logs monsterbox-goblin | grep "Scanning"
```

## 🎃 Use Cases

### 1. Window Fire Effect
- Multiple Goblins on different windows
- Sequential fire spread animation
- Coordinated audio (crackling, roaring)

### 2. Ghost Appearances
- Random timing ghost videos
- Different ghosts per window
- Spooky audio synchronization

### 3. Synchronized Scares
- All windows activate simultaneously
- Jump scare coordination
- Surround sound effects

## 📋 Hardware Requirements

### Minimum (1080p)
- **Raspberry Pi 3B+** (1GB RAM)
- **microSD**: 16GB Class 10
- **Power**: 5V 2.5A
- **Network**: WiFi or Ethernet

### Recommended (4K)
- **Raspberry Pi 4B** (4GB RAM)
- **microSD**: 32GB Class 10 U3
- **Power**: 5V 3A USB-C
- **Network**: Gigabit Ethernet (preferred)

## 🚦 System Management

### Start/Stop
```bash
docker start monsterbox-goblin
docker stop monsterbox-goblin
```

### Update System
```bash
# Rebuild with latest changes
./deploy.sh

# Or pull updated image (when available)
docker pull monsterbox/goblin:latest
docker stop monsterbox-goblin
docker rm monsterbox-goblin
./deploy.sh
```

### Remove Completely
```bash
docker stop monsterbox-goblin
docker rm monsterbox-goblin
docker rmi monsterbox/goblin:1.0.0
sudo rm -rf /opt/goblin-media /opt/goblin-config /opt/goblin-logs
```

## 🎭 Integration with MonsterBox

Once deployed, Goblins automatically appear in MonsterBox:
1. Navigate to `/goblins` in MonsterBox
2. View connected Goblins and their status
3. Upload media files to specific Goblins
4. Create Scenes with Goblin media steps
5. Coordinate multi-Goblin effects

---

**Ready to unleash your Goblin army for the ultimate Halloween display! 🎃👹**