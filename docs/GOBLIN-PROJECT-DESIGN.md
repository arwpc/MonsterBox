# MonsterBox Goblins - Distributed Media Playback System

## 🎯 Project Vision
Create a network of lightweight Raspberry Pi devices ("Goblins") that can play synchronized video and audio content on command from MonsterBox, enabling immersive multi-window Halloween displays and coordinated scene effects throughout a house.

## 🏗️ System Architecture

### Core Concept
- **MonsterBox Hub**: Central control system managing all Goblins
- **Goblins**: Lightweight RPi nodes with video/audio playback capabilities
- **Network Discovery**: Auto-discovery protocol for seamless Goblin integration
- **Scene Integration**: Goblins as controllable elements within existing Scene system

## 📋 Technical Specifications

### Goblin Hardware Requirements
**Minimum Specs:**
- **Raspberry Pi 4B (4GB RAM)** - Recommended for 4K video playback
- **Alternative**: Pi 3B+ (limited to 1080p, but much cheaper for non-4K windows)
- **Storage**: 32GB+ microSD (Class 10 U3 for 4K) + optional USB storage
- **Network**: Built-in WiFi or Ethernet
- **Output**: HDMI for video, 3.5mm or USB audio interface
- **Power**: Official Pi power supply (5V 3A for Pi 4)

**Performance Notes:**
- Pi 4B can handle 4K@30fps H.264 playback natively
- Multiple concurrent audio streams supported
- Hardware-accelerated video decoding essential

### Goblin Software Stack
```
┌─────────────────────────────────────────┐
│              Goblin Container           │
├─────────────────────────────────────────┤
│  Media Player (VLC/OMXPlayer/GStreamer) │
│  API Server (Express.js lightweight)    │
│  Network Beacon Service                 │
│  File Management System                 │
│  Status Monitoring                      │
├─────────────────────────────────────────┤
│           Docker Runtime                │
├─────────────────────────────────────────┤
│          Raspberry Pi OS Lite           │
└─────────────────────────────────────────┘
```

## 🌐 Network Architecture

### Discovery Protocol
```
1. Goblin boots → Scans network for MonsterBox (port 3000)
2. Finds MonsterBox → Sends beacon with Goblin ID & capabilities
3. MonsterBox → Validates & registers Goblin
4. Establishes persistent WebSocket connection
5. MonsterBox → Can now control Goblin remotely
```

### Connection Management
- **Auto-Discovery**: Goblins automatically find and connect to MonsterBox
- **Goblin Locking**: Each MonsterBox instance claims exclusive control
- **Failover**: If connection lost, Goblin re-beacons to find MonsterBox
- **Security**: JWT tokens for authenticated communication

## 📁 Project Structure

### MonsterBox Integration
```
MonsterBox/
├── controllers/
│   ├── goblinsController.js          # Goblin CRUD operations
│   └── goblinNetworkController.js    # Network discovery & management
├── services/
│   ├── goblinDiscoveryService.js     # Auto-discovery protocol
│   ├── goblinMediaService.js         # Media upload & management
│   └── goblinSceneService.js         # Scene integration
├── routes/
│   ├── goblins.js                    # Goblin management API
│   └── goblin-media.js               # Media upload/download
├── views/
│   ├── goblins/                      # Goblin management interface
│   │   ├── index.ejs                 # Goblin dashboard
│   │   ├── create.ejs                # New Goblin setup
│   │   └── manage.ejs                # Individual Goblin control
│   └── scenes/
│       └── goblin-steps.ejs          # Scene step editor for Goblins
├── public/
│   └── js/
│       ├── goblins.js                # Client-side Goblin management
│       └── goblin-scene-editor.js    # Scene integration UI
└── data/
    ├── goblins.json                  # Goblin registry
    └── goblin-media/                 # Uploaded media files
        ├── video/
        └── audio/
```

### Goblin Container Structure
```
goblin-container/
├── Dockerfile                        # Multi-arch container
├── package.json                      # Lightweight dependencies
├── src/
│   ├── server.js                     # Main API server
│   ├── mediaPlayer.js                # Video/audio playback control
│   ├── beacon.js                     # Network discovery beacon
│   ├── fileManager.js                # Local media file management
│   └── statusMonitor.js              # System status reporting
├── media/                            # Local media storage
│   ├── video/
│   └── audio/
└── config/
    ├── goblin.json                   # Goblin configuration
    └── playback.json                 # Media playback settings
```

## 🎬 Scene Integration

### Goblin Scene Steps
```json
{
  "type": "goblin-media",
  "goblinId": "window-1-ghost",
  "action": "play-video",
  "media": {
    "video": "ghost-in-window.mp4",
    "audio": ["spooky-sounds.wav", "chains-rattling.mp3"]
  },
  "timing": {
    "startDelay": 0,
    "duration": 30000,
    "loop": false
  },
  "synchronization": {
    "waitForCompletion": false,
    "syncGroup": "all-windows"
  }
}
```

### Scene Coordination Types
- **Sequential**: Goblins trigger one after another (house fire spreading)
- **Synchronized**: All Goblins start simultaneously (coordinated ghost appearance)
- **Staggered**: Timed delays between Goblin activations
- **Interactive**: Goblins respond to sensor triggers or user input

## 🛠️ Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Goblin container development
- [ ] Basic media playback (video + audio)
- [ ] Network beacon protocol
- [ ] MonsterBox discovery service

### Phase 2: Management Interface
- [ ] Goblin CRUD in MonsterBox
- [ ] Media upload system
- [ ] Status monitoring dashboard
- [ ] Basic playback control

### Phase 3: Scene Integration
- [ ] Goblin scene step types
- [ ] Timing and synchronization
- [ ] Scene editor UI updates
- [ ] Coordination protocols

### Phase 4: Advanced Features
- [ ] Multi-Goblin synchronization
- [ ] Media streaming (for large files)
- [ ] Performance monitoring
- [ ] Auto-update system

## 🚀 Getting Started Guide

### Deploying a New Goblin
1. **Prepare Pi**: Flash Raspberry Pi OS Lite
2. **Install Docker**: `curl -sSL https://get.docker.com | sh`
3. **Deploy Container**: 
   ```bash
   docker run -d --name goblin \
     -v /home/pi/goblin-media:/app/media \
     -p 3001:3001 \
     --restart unless-stopped \
     monsterbox/goblin:latest
   ```
4. **Auto-Discovery**: Goblin automatically finds MonsterBox on network
5. **Register**: MonsterBox detects and registers new Goblin
6. **Upload Media**: Use MonsterBox interface to upload content
7. **Scene Integration**: Add Goblin steps to scenes

### MonsterBox Integration
1. **Enable Goblin Discovery**: Start discovery service in MonsterBox
2. **Goblin Management**: Access via `/goblins` route in MonsterBox
3. **Scene Integration**: Add Goblin steps in scene editor
4. **Monitor Status**: Real-time Goblin health monitoring

## 🎨 Use Case Examples

### 1. House Fire Sequence
- **Window 1**: Fire starts (red glow video + crackling audio)
- **Window 2**: Fire spreads (2 seconds later, flames + more crackling)
- **Window 3**: Fire peaks (3 seconds later, bright flames + roaring)
- **All Windows**: Fire dies down (synchronized fade to embers)

### 2. Ghost Tour
- **Window 1**: Victorian ghost appears (ethereal music)
- **Window 2**: Different ghost (chains rattling)
- **Window 3**: Poltergeist activity (objects moving, crash sounds)
- **Random timing**: Each ghost appears at different intervals

### 3. Monster Reveal
- **All Windows**: Synchronized monster appearance
- **Central coordination**: All Goblins triggered simultaneously
- **Audio coordination**: Surround sound roar from all locations

## 🔧 Technical Considerations

### Media Formats
- **Video**: H.264 MP4 (hardware accelerated on Pi 4)
- **Audio**: WAV, MP3, AAC (multiple concurrent streams)
- **Resolution**: Up to 4K@30fps on Pi 4B, 1080p@30fps on Pi 3B+

### Network Requirements
- **Bandwidth**: ~25Mbps per 4K stream for initial load
- **Latency**: <100ms for real-time coordination
- **Reliability**: Auto-reconnect on network interruption

### Storage Management
- **Local Cache**: Media files stored locally on each Goblin
- **Sync Strategy**: Download-on-demand or pre-sync popular content
- **Cleanup**: Automatic removal of old/unused media files

### Performance Monitoring
- **Real-time Stats**: CPU, memory, network, playback status
- **Health Checks**: Automated testing of video/audio capabilities
- **Alerts**: Notification when Goblins go offline or fail

## 🎯 Success Metrics
- **Discovery Time**: Goblins auto-connect within 30 seconds
- **Playback Quality**: Smooth 4K video with synchronized audio
- **Synchronization Accuracy**: Multi-Goblin coordination within 100ms
- **Reliability**: 99% uptime during Halloween season
- **Ease of Use**: Non-technical setup of new Goblins in under 10 minutes

---

This design provides a scalable, user-friendly system for creating immersive multi-window Halloween displays while maintaining the simplicity and elegance of the existing MonsterBox ecosystem! 🎃👹