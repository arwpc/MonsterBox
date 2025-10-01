# Goblin-1 Deployment Guide

Complete guide for setting up Goblin-1 on Raspberry Pi with USB video playback.

## 🎯 Target Configuration

- **Hostname**: `goblin1`
- **IP Address**: `192.168.8.160` (static)
- **Port**: `3001`
- **Video Source**: USB stick (mounted at `/media/usb`)
- **Video Output**: HDMI1 (TV)
- **OS**: Raspberry Pi OS (fully updated)

---

## 📋 Prerequisites

### Hardware
- Raspberry Pi 4B (4GB RAM recommended) or Pi 3B+
- USB stick with video files (MP4, AVI, MKV, MOV)
- HDMI cable connected to TV
- Network connection (Ethernet or WiFi)
- Power supply (5V 3A for Pi 4, 5V 2.5A for Pi 3)

### Software
- Raspberry Pi OS (Lite or Full, fully updated)
- SSH access enabled
- User with sudo privileges

---

## 🚀 Quick Deployment

### Option 1: Automated Setup (Recommended)

1. **Copy deployment files to Goblin-1:**
   ```bash
   # From your development machine
   scp -r goblin-system pi@192.168.8.160:~/
   ```

2. **SSH into Goblin-1:**
   ```bash
   ssh pi@192.168.8.160
   ```

3. **Run setup script:**
   ```bash
   cd ~/goblin-system
   chmod +x setup-goblin1.sh
   ./setup-goblin1.sh
   ```

4. **Reboot if hostname or GPU settings changed:**
   ```bash
   sudo reboot
   ```

5. **Start Goblin service:**
   ```bash
   sudo systemctl start goblin
   sudo systemctl status goblin
   ```

### Option 2: Manual Setup

See detailed steps below.

---

## 📝 Manual Setup Steps

### 1. Set Hostname

```bash
# Set hostname to goblin1
echo "goblin1" | sudo tee /etc/hostname
sudo sed -i "s/127.0.1.1.*/127.0.1.1\tgoblin1/" /etc/hosts
```

### 2. Configure Static IP

Edit `/etc/dhcpcd.conf`:
```bash
sudo nano /etc/dhcpcd.conf
```

Add at the end:
```
interface eth0
static ip_address=192.168.8.160/24
static routers=192.168.8.1
static domain_name_servers=192.168.8.1 8.8.8.8
```

Or configure via router DHCP reservation.

### 3. Update System

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get dist-upgrade -y
```

### 4. Install Dependencies

```bash
sudo apt-get install -y \
    vlc \
    ffmpeg \
    alsa-utils \
    v4l-utils \
    curl \
    git \
    nodejs \
    npm
```

### 5. Mount USB Stick

```bash
# Create mount point
sudo mkdir -p /media/usb

# Find USB device (usually /dev/sda1)
lsblk

# Mount USB stick
sudo mount /dev/sda1 /media/usb

# Add to /etc/fstab for auto-mount
echo "/dev/sda1 /media/usb auto defaults,nofail,x-systemd.device-timeout=1 0 0" | sudo tee -a /etc/fstab
```

### 6. Configure HDMI Output

Edit `/boot/config.txt`:
```bash
sudo nano /boot/config.txt
```

Add/ensure these lines:
```
# GPU memory for video playback
gpu_mem=128

# Force HDMI output
hdmi_force_hotplug=1
hdmi_drive=2
```

Set HDMI audio:
```bash
sudo amixer cset numid=3 2
```

### 7. Install Goblin System

```bash
# Create Goblin directory
mkdir -p ~/goblin
cd ~/goblin

# Copy Goblin files (from goblin-system/src/)
# ... copy server.js, mediaPlayer.js, beacon.js, etc.

# Install Node.js dependencies
npm install express axios cors multer node-schedule uuid ws
```

### 8. Create Systemd Service

Create `/etc/systemd/system/goblin.service`:
```ini
[Unit]
Description=MonsterBox Goblin Media Player
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/goblin
Environment="GOBLIN_ID=goblin1"
Environment="GOBLIN_PORT=3001"
Environment="USB_VIDEO_PATH=/media/usb"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /home/pi/goblin/server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/pi/goblin/logs/goblin.log
StandardError=append:/home/pi/goblin/logs/goblin-error.log

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable goblin
sudo systemctl start goblin
```

---

## 🧪 Testing

### Test USB Video Playback

```bash
cd ~/goblin-system
chmod +x test-usb-video.sh
./test-usb-video.sh
```

This will:
1. Check USB mount
2. List available videos
3. Let you select a video to play
4. Play video fullscreen on HDMI with looping

### Test Goblin API

```bash
# Health check
curl http://localhost:3001/health

# List media files
curl http://localhost:3001/media | jq

# Get Goblin info
curl http://localhost:3001/info | jq

# Play a video via API
curl -X POST http://localhost:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "your-video.mp4", "loop": true}'
```

### Test from MonsterBox

```bash
# From MonsterBox server
curl http://192.168.8.160:3001/health
curl http://192.168.8.160:3001/media
```

---

## 📊 Monitoring

### View Logs

```bash
# Real-time logs
sudo journalctl -u goblin -f

# Or from log files
tail -f ~/goblin/logs/goblin.log
tail -f ~/goblin/logs/goblin-error.log
```

### Check Service Status

```bash
sudo systemctl status goblin
```

### Check System Resources

```bash
# CPU and memory
htop

# GPU memory
vcgencmd get_mem gpu

# Temperature
vcgencmd measure_temp

# HDMI status
tvservice -s
```

---

## 🔧 Troubleshooting

### Video Won't Play

1. **Check HDMI connection:**
   ```bash
   tvservice -s
   ```

2. **Check GPU memory:**
   ```bash
   vcgencmd get_mem gpu
   # Should be 128M or higher
   ```

3. **Test VLC directly:**
   ```bash
   vlc --fullscreen /media/usb/your-video.mp4
   ```

### No Audio

1. **Check audio output:**
   ```bash
   aplay -l
   ```

2. **Force HDMI audio:**
   ```bash
   sudo amixer cset numid=3 2
   sudo amixer set Master 80%
   ```

3. **Test audio:**
   ```bash
   speaker-test -c2 -twav
   ```

### USB Not Mounting

1. **Check USB device:**
   ```bash
   lsblk
   dmesg | tail -20
   ```

2. **Try manual mount:**
   ```bash
   sudo mount -t vfat /dev/sda1 /media/usb
   # or
   sudo mount -t exfat /dev/sda1 /media/usb
   ```

3. **Install filesystem support:**
   ```bash
   sudo apt-get install exfat-fuse exfat-utils
   ```

### Goblin Service Won't Start

1. **Check logs:**
   ```bash
   sudo journalctl -u goblin -n 50
   ```

2. **Check Node.js:**
   ```bash
   node --version
   npm --version
   ```

3. **Check dependencies:**
   ```bash
   cd ~/goblin
   npm install
   ```

---

## 🎬 Video File Management

### Supported Formats
- MP4 (H.264/H.265)
- AVI
- MKV
- MOV
- WebM
- FLV

### Recommended Settings
- **Resolution**: 1080p (1920x1080) for Pi 4, 720p for Pi 3
- **Codec**: H.264
- **Bitrate**: 5-10 Mbps for 1080p
- **Audio**: AAC or MP3, 128-192 kbps

### USB Stick Organization

```
/media/usb/
├── halloween/
│   ├── ghosts/
│   │   ├── ghost1.mp4
│   │   └── ghost2.mp4
│   ├── fire/
│   │   └── fire-loop.mp4
│   └── scares/
│       └── jumpscare.mp4
└── test/
    └── test-video.mp4
```

Videos in subdirectories will be accessible as:
- `halloween/ghosts/ghost1.mp4`
- `halloween/fire/fire-loop.mp4`
- etc.

---

## 🔄 Updates

### Update Goblin System

```bash
# Stop service
sudo systemctl stop goblin

# Pull latest code
cd ~/MonsterBox
git pull

# Copy updated files
cp -r goblin-system/src/* ~/goblin/

# Restart service
sudo systemctl start goblin
```

---

## ✅ Verification Checklist

- [ ] Hostname set to `goblin1`
- [ ] Static IP configured: `192.168.8.160`
- [ ] System fully updated
- [ ] VLC/ffmpeg installed
- [ ] USB stick mounted at `/media/usb`
- [ ] Videos accessible on USB
- [ ] HDMI output configured
- [ ] GPU memory set to 128M+
- [ ] Audio output set to HDMI
- [ ] Goblin service installed and enabled
- [ ] Goblin service running
- [ ] API responding on port 3001
- [ ] Test video plays smoothly on TV
- [ ] MonsterBox can reach Goblin

---

**Ready to haunt! 🎃👹**

