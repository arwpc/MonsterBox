# MonsterBox 5.2 Startup Guide

## Quick Start

To start MonsterBox with all prerequisites verified:

```bash
./start-monsterbox.sh
```

This single command handles everything needed for a clean MonsterBox startup.

---

## What the Startup Script Does

### 1. **Kills Old Instances** 🛑
- Terminates any running `node server.js` processes
- Terminates any running `node server-test.js` processes
- Cleans up PM2 processes if PM2 is installed
- Reports any remaining processes
- Ensures no port conflicts or zombie processes

### 2. **Verifies Audio Services** 🔊
The script checks and starts these critical audio services:

#### **PipeWire**
- Main audio server for MonsterBox
- Handles all audio routing and processing
- **Status Check**: `systemctl --user status pipewire`
- **Auto-Start**: Script starts if not running

#### **PipeWire-Pulse**
- PulseAudio compatibility layer
- Allows legacy audio applications to work
- **Status Check**: `systemctl --user status pipewire-pulse`
- **Auto-Start**: Script starts if not running

#### **WirePlumber**
- Session manager for PipeWire
- Manages audio device connections and routing
- **Status Check**: `systemctl --user status wireplumber`
- **Auto-Start**: Script starts if not running

**Audio Sinks Display:**
The script shows available audio sinks using `wpctl status` so you can verify your audio hardware is detected.

### 3. **Verifies Video Services** 📹

#### **mjpg-streamer**
- System service for webcam streaming
- Runs on port 8090
- Provides MJPEG video streams
- **Status Check**: `systemctl status mjpg-streamer`
- **Auto-Start**: Script starts if not running (requires sudo)
- **HTTP Test**: Verifies endpoint responds on http://localhost:8090/

### 4. **Verifies Node.js Environment** 🟢
- Checks Node.js is installed (v20.19.5 recommended)
- Checks npm is installed (v10.8.2 recommended)
- Verifies `node_modules` directory exists
- Runs `npm install` if dependencies are missing

### 5. **Validates Critical Files** 📁
Ensures these essential files exist:
- `server.js` - Main server file
- `package.json` - Dependencies manifest
- `data/character-3/parts.json` - Orlok hardware configuration
- `controllers/partsController.js` - Parts controller

### 6. **Checks Port Availability** 🔌
- Verifies port 3000 is available
- Shows process using port if occupied
- Exits cleanly if port conflict detected

### 7. **System Status Summary** 📊
Displays comprehensive status before starting:
```
Audio Services:
  ✅ PipeWire: Running
  ✅ PipeWire-Pulse: Running
  ✅ WirePlumber: Running

Video Services:
  ✅ mjpg-streamer: Running

Network:
  ✅ Port 3000: Available
```

### 8. **Starts MonsterBox** 🚀
- Launches `node server.js`
- Full server initialization
- Real-time performance monitoring
- WebSocket services
- HTTP endpoints
- Jaw animation integration

---

## Manual Service Management

### Audio Services (User Services)

```bash
# Check status
systemctl --user status pipewire
systemctl --user status pipewire-pulse
systemctl --user status wireplumber

# Start services
systemctl --user start pipewire
systemctl --user start pipewire-pulse
systemctl --user start wireplumber

# Stop services
systemctl --user stop pipewire
systemctl --user stop pipewire-pulse
systemctl --user stop wireplumber

# Restart services
systemctl --user restart pipewire
systemctl --user restart pipewire-pulse
systemctl --user restart wireplumber

# Enable auto-start on login
systemctl --user enable pipewire
systemctl --user enable pipewire-pulse
systemctl --user enable wireplumber

# View logs
journalctl --user -u pipewire -f
journalctl --user -u wireplumber -f
```

### Video Services (System Services)

```bash
# Check status
sudo systemctl status mjpg-streamer

# Start service
sudo systemctl start mjpg-streamer

# Stop service
sudo systemctl stop mjpg-streamer

# Restart service
sudo systemctl restart mjpg-streamer

# Enable auto-start on boot
sudo systemctl enable mjpg-streamer

# View logs
sudo journalctl -u mjpg-streamer -f

# Test HTTP endpoint
curl -I http://localhost:8090/

# Test stream endpoint
curl -I http://localhost:8090/?action=stream
```

### Audio Device Management

```bash
# List all audio devices
wpctl status

# List sinks (output devices)
wpctl status | grep -A 20 "Sinks:"

# List sources (input devices)
wpctl status | grep -A 20 "Sources:"

# Set default sink
wpctl set-default <sink-id>

# Set volume (0.0 to 1.0)
wpctl set-volume <sink-id> 0.8

# Mute/unmute
wpctl set-mute <sink-id> toggle
```

---

## Troubleshooting

### Audio Services Not Starting

**Problem**: PipeWire/WirePlumber won't start

**Solution**:
```bash
# Kill any conflicting processes
pkill -9 pipewire
pkill -9 wireplumber

# Reset user services
systemctl --user daemon-reload

# Start services in order
systemctl --user start pipewire
systemctl --user start pipewire-pulse
systemctl --user start wireplumber

# Check logs
journalctl --user -u pipewire -n 50
journalctl --user -u wireplumber -n 50
```

### mjpg-streamer Not Starting

**Problem**: mjpg-streamer service fails to start

**Solution**:
```bash
# Check camera permissions
ls -la /dev/video*

# Ensure user is in video group
groups remote

# Add user to video group if needed
sudo usermod -a -G video remote

# Kill conflicting processes
sudo pkill -f mjpg_streamer

# Restart service
sudo systemctl restart mjpg-streamer

# Check logs
sudo journalctl -u mjpg-streamer -n 50
```

### Port 3000 Already in Use

**Problem**: Another process is using port 3000

**Solution**:
```bash
# Find process using port 3000
lsof -Pi :3000 -sTCP:LISTEN

# Kill the process
kill -9 <PID>

# Or use the kill script
./scripts/kill-monsterbox.sh
```

### Node.js/npm Issues

**Problem**: Dependencies missing or outdated

**Solution**:
```bash
# Remove node_modules
rm -rf node_modules package-lock.json

# Reinstall dependencies
npm install

# Verify Node.js version
node --version  # Should be v20.x or higher

# Verify npm version
npm --version   # Should be v10.x or higher
```

---

## Alternative Startup Methods

### Method 1: Direct Node.js (No Checks)
```bash
node server.js
```
**Use When**: You've already verified all services manually

### Method 2: npm start (Package.json Script)
```bash
npm start
```
**Use When**: You want the standard npm workflow

### Method 3: PM2 Process Manager
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server.js --name monsterbox

# View logs
pm2 logs monsterbox

# Stop
pm2 stop monsterbox

# Restart
pm2 restart monsterbox

# Auto-start on boot
pm2 startup
pm2 save
```

### Method 4: Systemd Service (Production)
See `docs/SYSTEMD_SERVICE.md` for creating a MonsterBox systemd service.

---

## Startup Script Output Example

```
========================================
  MonsterBox 5.2 Clean Startup
========================================

>>> Step 1: Killing old MonsterBox instances...
✅ All MonsterBox processes killed successfully

>>> Step 2: Checking audio services (PipeWire/WirePlumber)...
✅ PipeWire is running
✅ PipeWire-Pulse is running
✅ WirePlumber is running

>>> Available audio sinks:
 ├─ Sinks:
 │  ├─ 43. USB Audio Adapter [Default]
 │  └─ 44. Built-in Audio

>>> Step 3: Checking mjpg-streamer service...
✅ mjpg-streamer is running
✅ mjpg-streamer HTTP endpoint responding

>>> Step 4: Verifying Node.js environment...
✅ Node.js v20.19.5 installed
✅ npm 10.8.2 installed

>>> Step 5: Checking dependencies...
✅ node_modules directory exists

>>> Step 6: Verifying critical files...
✅ server.js exists
✅ package.json exists
✅ data/character-3/parts.json exists
✅ controllers/partsController.js exists

>>> Step 7: Checking for port conflicts...
✅ Port 3000 is available

========================================
  System Status Summary
========================================

Audio Services:
  ✅ PipeWire: Running
  ✅ PipeWire-Pulse: Running
  ✅ WirePlumber: Running

Video Services:
  ✅ mjpg-streamer: Running

Network:
  ✅ Port 3000: Available

========================================
  Starting MonsterBox 5.2
========================================

🎭 MonsterBox 5.2 server running on port 3000
📱 Dashboard: http://localhost:3000
⚙️  Setup: http://localhost:3000/setup
🎬 Live Mode: http://localhost:3000/live
✅ mjpg-streamer service is running on port 8090
🎥 Webcam streaming: http://localhost:8090/?action=stream
🌐 ElevenLabs Chat WebSocket server listening on port 8795
```

---

## Related Scripts

- **`./scripts/kill-monsterbox.sh`** - Kill all MonsterBox processes
- **`./scripts/setup-mjpg-streamer-service.sh`** - Setup mjpg-streamer service
- **`./scripts/test-mjpg-integration.sh`** - Test mjpg-streamer integration
- **`./scripts/orlok-bringup-test.sh`** - Test Orlok hardware configuration

---

## Support

For issues with startup:

1. **Run the startup script**: `./start-monsterbox.sh`
2. **Check service logs**: See "Manual Service Management" section above
3. **Verify hardware**: Ensure webcam and audio devices are connected
4. **Check permissions**: Ensure user is in `video` and `audio` groups

---

**MonsterBox 5.2** - Halloween Animatronic Control System

