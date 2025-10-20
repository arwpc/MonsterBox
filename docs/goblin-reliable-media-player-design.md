# Bone-Reliable Media Player Design for MonsterBox Goblin System
## Simplified Architecture for Raspberry Pi 3B+ (MPV-Only, JSON-Based)

---

## Executive Summary

Based on extensive analysis of the existing Goblin system failures and successes, this document presents a simplified, ultra-reliable media player architecture using only MPV and JSON-based state management. No unnecessary dependencies, no SQL, no VLC - just pure simplicity and reliability.

### Key Lessons from Current System

**Critical Failures Identified:**
1. **TTY/Getty Conflicts**: Login prompts block DRM video output
2. **Permission Issues**: Runtime directory and device access failures
3. **Zombie Processes**: Port 3001 held by dead processes after crashes
4. **Hardware Decoder Misdetection**: `--hwdec=auto` fails on Pi3

**What Actually Works:**
- MPV with `--vo=drm` for headless output
- Explicit hardware decoder `--hwdec=v4l2m2m-copy`
- Root-level ExecStartPre scripts for device permissions
- Direct DRM/KMS without X11/Wayland
- JSON file-based state management

---

## 1. Core Architecture Design

### 1.1 Technology Stack (Minimal Dependencies)

```
┌─────────────────────────────────────────────────┐
│        SIMPLE GOBLIN MEDIA PLAYER               │
├─────────────────────────────────────────────────┤
│  Application Layer                              │
│  ├─ Node.js v18+ (already installed)           │
│  ├─ Express.js (already in use)                │
│  └─ fs/promises (built-in)                     │
├─────────────────────────────────────────────────┤
│  Media Player (Single Engine)                  │
│  └─ MPV with DRM output                        │
│      └─ Hardware: v4l2m2m-copy decoder         │
├─────────────────────────────────────────────────┤
│  Data Storage (Simple JSON)                    │
│  ├─ queue.json (video queue)                   │
│  └─ state.json (playback state)                │
├─────────────────────────────────────────────────┤
│  System Management                              │
│  └─ Systemd service (simple restart policy)    │
├─────────────────────────────────────────────────┤
│  Hardware Layer                                │
│  ├─ DRM/KMS direct rendering                   │
│  └─ GPU memory: 128MB allocation               │
└─────────────────────────────────────────────────┘
```

### 1.2 Process Architecture (Simplified)

```
systemd (PID 1)
 └─ goblin.service
     ├─ goblin-setup.sh (root) - Device permissions
     └─ node server.js (user: remote)
         ├─ Express API (port 3001)
         ├─ MPV Controller (single process)
         └─ JSON Queue Manager
```

---

## 2. Media Player Engine (MPV Only)

### 2.1 MPV Configuration (Proven to Work)

```javascript
const MPV_CONFIG = {
  binary: 'mpv',
  args: [
    '--vo=drm',                      // Direct Rendering Manager output
    '--drm-connector=HDMI-A-1',      // Force HDMI output
    '--drm-mode=1920x1080@60',       // Fixed resolution
    '--hwdec=v4l2m2m-copy',          // CRITICAL: Pi3 hardware decoder
    '--audio-device=alsa/hdmi:CARD=vc4hdmi,DEV=0', // HDMI audio
    '--really-quiet',                 // Minimal logging
    '--no-terminal',                  // No terminal control
    '--no-input-default-bindings',   // No keyboard input
  ]
};
```

### 2.2 Simple MPV Controller

```javascript
class MPVController {
  constructor() {
    this.currentProcess = null;
    this.currentVideo = null;
  }
  
  async play(filename, options = {}) {
    // Stop current video if playing
    await this.stop();
    
    const videoPath = path.join('/home/remote/goblin/media/video', filename);
    
    // Build MPV arguments
    const args = [...MPV_CONFIG.args];
    if (options.loop) {
      args.push('--loop');
    }
    args.push(videoPath);
    
    // Spawn MPV process
    this.currentProcess = spawn('mpv', args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    this.currentVideo = filename;
    
    // Handle process exit
    this.currentProcess.on('exit', (code) => {
      console.log(`Video ended: ${filename} (code: ${code})`);
      this.currentProcess = null;
      this.currentVideo = null;
      
      // Notify queue manager
      if (this.onVideoEnd) {
        this.onVideoEnd(filename);
      }
    });
    
    return { success: true, playing: filename };
  }
  
  async stop() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      // Wait for process to exit
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.currentProcess) {
        this.currentProcess.kill('SIGKILL');
      }
      this.currentProcess = null;
      this.currentVideo = null;
    }
  }
}
```

---

## 3. Simple JSON Queue Management

### 3.1 Queue Structure

```javascript
// queue.json
{
  "videos": [
    {
      "id": "1234567890",
      "filename": "scary-video-1.mp4",
      "addedAt": "2025-10-19T10:30:00Z",
      "playCount": 0
    },
    {
      "id": "1234567891",
      "filename": "scary-video-2.mp4", 
      "addedAt": "2025-10-19T10:31:00Z",
      "playCount": 0
    }
  ],
  "currentIndex": 0,
  "loopMode": "queue",  // "none", "single", "queue"
  "playing": false
}
```

### 3.2 Queue Manager

```javascript
class QueueManager {
  constructor(mpvController) {
    this.mpv = mpvController;
    this.queueFile = '/home/remote/goblin/queue.json';
    this.stateFile = '/home/remote/goblin/state.json';
    this.queue = { videos: [], currentIndex: 0, loopMode: 'none', playing: false };
    this.saveTimer = null;
    
    // Register callback for video end
    this.mpv.onVideoEnd = this.onVideoEnd.bind(this);
  }
  
  async load() {
    try {
      const data = await fs.readFile(this.queueFile, 'utf8');
      this.queue = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted - use defaults
      await this.save();
    }
  }
  
  async save() {
    // Debounce saves
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await fs.writeFile(this.queueFile, JSON.stringify(this.queue, null, 2));
      } catch (error) {
        console.error('Failed to save queue:', error);
      }
    }, 100);
  }
  
  async add(filename, position = 'end') {
    const video = {
      id: Date.now().toString(),
      filename: filename,
      addedAt: new Date().toISOString(),
      playCount: 0
    };
    
    if (position === 'next') {
      // Insert after current video
      this.queue.videos.splice(this.queue.currentIndex + 1, 0, video);
    } else {
      // Add to end
      this.queue.videos.push(video);
    }
    
    await this.save();
    return video;
  }
  
  async remove(id) {
    const index = this.queue.videos.findIndex(v => v.id === id);
    if (index === -1) return false;
    
    // Adjust current index if needed
    if (index < this.queue.currentIndex) {
      this.queue.currentIndex--;
    } else if (index === this.queue.currentIndex && this.queue.playing) {
      // Stop if we're removing the current video
      await this.stop();
    }
    
    this.queue.videos.splice(index, 1);
    await this.save();
    return true;
  }
  
  async clear() {
    await this.stop();
    this.queue.videos = [];
    this.queue.currentIndex = 0;
    await this.save();
  }
  
  async start(options = {}) {
    if (this.queue.videos.length === 0) {
      throw new Error('Queue is empty');
    }
    
    // Set loop mode if specified
    if (options.loopMode) {
      this.queue.loopMode = options.loopMode;
    }
    
    this.queue.playing = true;
    await this.save();
    await this.playNext();
  }
  
  async playNext() {
    if (!this.queue.playing) return;
    
    const video = this.queue.videos[this.queue.currentIndex];
    if (!video) {
      // End of queue
      if (this.queue.loopMode === 'queue') {
        // Loop back to start
        this.queue.currentIndex = 0;
        return this.playNext();
      } else {
        // Stop playing
        this.queue.playing = false;
        await this.save();
        return;
      }
    }
    
    // Play the video
    const loop = this.queue.loopMode === 'single';
    await this.mpv.play(video.filename, { loop });
    
    // Update play count
    video.playCount++;
    await this.save();
  }
  
  async onVideoEnd(filename) {
    if (!this.queue.playing) return;
    
    if (this.queue.loopMode !== 'single') {
      // Move to next video
      this.queue.currentIndex++;
      await this.playNext();
    }
  }
  
  async stop() {
    this.queue.playing = false;
    await this.mpv.stop();
    await this.save();
  }
  
  async skip() {
    if (!this.queue.playing) return;
    
    this.queue.currentIndex++;
    await this.playNext();
  }
  
  async previous() {
    if (!this.queue.playing) return;
    
    this.queue.currentIndex = Math.max(0, this.queue.currentIndex - 1);
    await this.playNext();
  }
  
  getStatus() {
    return {
      videos: this.queue.videos.length,
      currentIndex: this.queue.currentIndex,
      currentVideo: this.queue.videos[this.queue.currentIndex],
      loopMode: this.queue.loopMode,
      playing: this.queue.playing,
      mpvRunning: this.mpv.currentVideo !== null
    };
  }
}
```

---

## 4. System Configuration (Simplified)

### 4.1 Systemd Service

**`/etc/systemd/system/goblin.service`:**
```ini
[Unit]
Description=MonsterBox Goblin Media Player
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=remote
Group=video

# Environment
Environment="NODE_ENV=production"
Environment="GOBLIN_PORT=3001"
Environment="XDG_RUNTIME_DIR=/run/user/1000"

# Pre-start setup (runs as root)
ExecStartPre=+/usr/local/bin/goblin-setup.sh

# Main process
ExecStart=/usr/bin/node /home/remote/goblin/server.js

# Restart policy
Restart=always
RestartSec=5

# Simple resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### 4.2 Setup Script (`/usr/local/bin/goblin-setup.sh`)

```bash
#!/bin/bash
# Simple setup script for Goblin video output

# Kill getty on TTY1 (prevents CLI from showing on screen)
systemctl stop getty@tty1.service 2>/dev/null || true
systemctl disable getty@tty1.service 2>/dev/null || true
pkill -t tty1 2>/dev/null || true

# Clear framebuffer
dd if=/dev/zero of=/dev/fb0 bs=1M count=1 2>/dev/null || true

# Setup runtime directory
mkdir -p /run/user/1000
chown remote:remote /run/user/1000
chmod 700 /run/user/1000

# Set device permissions for video output
chmod 666 /dev/fb0 2>/dev/null || true
chmod 666 /dev/tty1 2>/dev/null || true
[ -e /dev/dri/card0 ] && chmod 666 /dev/dri/card0
[ -e /dev/dri/renderD128 ] && chmod 666 /dev/dri/renderD128

# Kill zombie processes on port 3001
lsof -ti:3001 | xargs -r kill -9 2>/dev/null || true

# Switch to VT1 for DRM access
chvt 1 2>/dev/null || true

exit 0
```

---

## 5. Simple API Design (MonsterBox Control)

### 5.1 Core Endpoints

```javascript
const express = require('express');
const app = express();
app.use(express.json());

// Initialize components
const mpv = new MPVController();
const queue = new QueueManager(mpv);

// Load saved state on startup
queue.load();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    queue: queue.getStatus()
  });
});

// Play video immediately (bypasses queue)
app.post('/play-video', async (req, res) => {
  try {
    const { filename, loop = false } = req.body;
    await mpv.play(filename, { loop });
    res.json({ success: true, playing: filename });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Queue management
app.post('/queue/add', async (req, res) => {
  try {
    const { filename, position = 'end' } = req.body;
    const video = await queue.add(filename, position);
    res.json({ success: true, video });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/queue/remove/:id', async (req, res) => {
  try {
    const removed = await queue.remove(req.params.id);
    res.json({ success: removed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/queue/clear', async (req, res) => {
  try {
    await queue.clear();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/queue/start', async (req, res) => {
  try {
    const { loopMode = 'none' } = req.body;
    await queue.start({ loopMode });
    res.json({ success: true, status: queue.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/queue/stop', async (req, res) => {
  try {
    await queue.stop();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/queue/skip', async (req, res) => {
  try {
    await queue.skip();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/queue', (req, res) => {
  res.json(queue.getStatus());
});

// Stop all playback
app.post('/stop-all', async (req, res) => {
  try {
    await queue.stop();
    await mpv.stop();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.GOBLIN_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Goblin API listening on port ${PORT}`);
});
```

---

## 6. Hardware Optimization

### 6.1 Boot Configuration (`/boot/config.txt`)

```ini
# GPU Memory (128MB for video decoding)
gpu_mem=128

# Hardware codecs
start_x=1
gpu_freq=500

# HDMI Output
hdmi_force_hotplug=1
hdmi_drive=2
hdmi_group=1
hdmi_mode=16  # 1080p@60Hz

# CPU (safe for Pi3B+)
arm_freq=1400
over_voltage=4

# Disable unnecessary features
disable_splash=1
boot_delay=0
```

---

## 7. Simple Deployment

### 7.1 Deployment Script

```bash
#!/bin/bash
# deploy-goblin.sh - Simple deployment script

set -e

GOBLIN_IP=$1
GOBLIN_NAME=$2

echo "Deploying to $GOBLIN_NAME ($GOBLIN_IP)"

# Create package
tar czf goblin.tar.gz \
  server.js \
  package.json \
  goblin-setup.sh

# Deploy
sshpass -p 'klrklr89!' ssh remote@$GOBLIN_IP << 'EOF'
  # Stop service
  sudo systemctl stop goblin 2>/dev/null || true
  
  # Clean up
  sudo pkill -9 node 2>/dev/null || true
  sudo pkill -9 mpv 2>/dev/null || true
  
  # Extract files
  cd /home/remote
  rm -rf goblin
  mkdir goblin
  cd goblin
  tar xzf ../goblin.tar.gz
  
  # Create directories
  mkdir -p media/video logs
  
  # Install dependencies
  npm install express
  
  # Install setup script
  sudo cp goblin-setup.sh /usr/local/bin/
  sudo chmod +x /usr/local/bin/goblin-setup.sh
  
  # Install service
  sudo tee /etc/systemd/system/goblin.service << 'SERVICE'
[Unit]
Description=MonsterBox Goblin Media Player
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=remote
Environment="NODE_ENV=production"
Environment="GOBLIN_PORT=3001"
Environment="XDG_RUNTIME_DIR=/run/user/1000"
ExecStartPre=+/usr/local/bin/goblin-setup.sh
ExecStart=/usr/bin/node /home/remote/goblin/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
  
  # Start service
  sudo systemctl daemon-reload
  sudo systemctl enable goblin
  sudo systemctl start goblin
EOF

echo "Deployment complete!"
```

---

## 8. Complete Working Example

### 8.1 Minimal Complete Server (`server.js`)

```javascript
#!/usr/bin/env node

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Simple MPV Controller
class MPVController {
  constructor() {
    this.process = null;
    this.currentVideo = null;
  }
  
  async play(filename, options = {}) {
    await this.stop();
    
    const videoPath = path.join(__dirname, 'media/video', filename);
    
    const args = [
      '--vo=drm',
      '--hwdec=v4l2m2m-copy',
      '--really-quiet',
      '--no-terminal'
    ];
    
    if (options.loop) args.push('--loop');
    args.push(videoPath);
    
    this.process = spawn('mpv', args);
    this.currentVideo = filename;
    
    this.process.on('exit', () => {
      this.process = null;
      this.currentVideo = null;
      if (this.onEnd) this.onEnd();
    });
    
    return { playing: filename };
  }
  
  async stop() {
    if (this.process) {
      this.process.kill();
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// Simple Queue Manager
class QueueManager {
  constructor(mpv) {
    this.mpv = mpv;
    this.queue = [];
    this.index = 0;
    this.playing = false;
    this.loopMode = 'none';
    
    mpv.onEnd = () => this.playNext();
  }
  
  add(filename) {
    this.queue.push({ id: Date.now(), filename });
    return this.queue[this.queue.length - 1];
  }
  
  remove(id) {
    const idx = this.queue.findIndex(v => v.id == id);
    if (idx >= 0) this.queue.splice(idx, 1);
    return idx >= 0;
  }
  
  async start(loopMode = 'none') {
    this.loopMode = loopMode;
    this.playing = true;
    this.index = 0;
    await this.playNext();
  }
  
  async playNext() {
    if (!this.playing) return;
    
    if (this.index >= this.queue.length) {
      if (this.loopMode === 'queue') {
        this.index = 0;
      } else {
        this.playing = false;
        return;
      }
    }
    
    const video = this.queue[this.index++];
    if (video) {
      await this.mpv.play(video.filename, {
        loop: this.loopMode === 'single'
      });
    }
  }
  
  async stop() {
    this.playing = false;
    await this.mpv.stop();
  }
}

// Express API
const app = express();
app.use(express.json());

const mpv = new MPVController();
const queue = new QueueManager(mpv);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/play-video', async (req, res) => {
  const result = await mpv.play(req.body.filename, req.body);
  res.json(result);
});

app.post('/queue/add', (req, res) => {
  const video = queue.add(req.body.filename);
  res.json(video);
});

app.delete('/queue/:id', (req, res) => {
  const removed = queue.remove(req.params.id);
  res.json({ removed });
});

app.post('/queue/start', async (req, res) => {
  await queue.start(req.body.loopMode);
  res.json({ started: true });
});

app.post('/stop-all', async (req, res) => {
  await queue.stop();
  res.json({ stopped: true });
});

app.get('/queue', (req, res) => {
  res.json({
    videos: queue.queue,
    index: queue.index,
    playing: queue.playing,
    loopMode: queue.loopMode
  });
});

app.listen(3001, () => {
  console.log('Goblin running on port 3001');
});
```

---

## 9. Testing Checklist

### Basic Functionality
- [ ] MPV plays video with hardware acceleration
- [ ] Queue adds/removes videos correctly  
- [ ] Loop modes work (none, single, queue)
- [ ] API responds to all endpoints
- [ ] Service restarts after crash

### Reliability Tests
- [ ] Survives reboot
- [ ] Handles missing video files
- [ ] Recovers from MPV crash
- [ ] Port cleanup works
- [ ] No getty on display

### Performance Targets
- Boot to ready: < 20 seconds
- Video start: < 1 second
- CPU usage: < 50% (1080p)
- Memory: < 200MB
- API response: < 100ms

---

## Summary

This simplified design removes all unnecessary complexity while maintaining rock-solid reliability:

**What We Kept:**
- ✅ MPV with proven DRM configuration
- ✅ Simple JSON file storage (no SQL)
- ✅ Express API (already in use)
- ✅ Systemd service management
- ✅ Root setup script for permissions

**What We Removed:**
- ❌ VLC fallback (not needed if MPV works)
- ❌ SQLite database (JSON is simpler)
- ❌ Complex monitoring (systemd handles restarts)
- ❌ WebSockets (not required)
- ❌ Process supervision layers (systemd is enough)

**Key Principles:**
1. **Use what works**: MPV with `--vo=drm` and `--hwdec=v4l2m2m-copy`
2. **Keep it simple**: JSON files, basic Express API
3. **Let systemd handle recovery**: Simple restart policy
4. **Fix root causes**: Proper device permissions, TTY management
5. **Minimize dependencies**: Only Node.js and Express required

This design prioritizes simplicity and reliability over features, ensuring the system "just works" without maintenance or intervention.
