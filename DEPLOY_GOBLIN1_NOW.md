# 🎃 Deploy Goblin-1 NOW!

**One-command deployment to Goblin-1 @ 192.168.8.160**

---

## 🚀 Super Quick Deploy (Automated)

```bash
cd goblin-system
./deploy-to-goblin1.sh
```

This will:
- ✅ Test connectivity to Goblin-1
- ✅ Copy all files via SCP
- ✅ Run setup script automatically
- ✅ Configure everything

**Then SSH in and complete:**
```bash
ssh pi@192.168.8.160
# Password: klrklr89!

# If hostname/GPU changed, reboot:
sudo reboot

# Start service:
sudo systemctl start goblin

# Test video:
cd ~/goblin-system
./test-usb-video.sh
```

---

## 🔧 Manual Deploy (If Automated Fails)

### Step 1: Copy Files
```bash
cd MonsterBox
scp -r goblin-system pi@192.168.8.160:~/
# Password: klrklr89!
```

### Step 2: SSH and Setup
```bash
ssh pi@192.168.8.160
# Password: klrklr89!

cd ~/goblin-system
./setup-goblin1.sh
```

### Step 3: Reboot (if needed)
```bash
sudo reboot
```

### Step 4: Start Service
```bash
ssh pi@192.168.8.160
sudo systemctl start goblin
sudo systemctl status goblin
```

### Step 5: Test Video
```bash
cd ~/goblin-system
./test-usb-video.sh
```

---

## ✅ Quick Verification

```bash
# From Goblin-1:
curl http://localhost:3001/health
curl http://localhost:3001/media | jq

# From MonsterBox:
curl http://192.168.8.160:3001/health
curl http://192.168.8.160:3001/media | jq
```

---

## 🎬 Expected Results

### Service Status
```bash
$ sudo systemctl status goblin
● goblin.service - MonsterBox Goblin Media Player
   Loaded: loaded
   Active: active (running)
```

### API Health
```bash
$ curl http://localhost:3001/health
{
  "status": "healthy",
  "goblinId": "goblin1",
  "uptime": 123.45,
  "connected": false
}
```

### Video List
```bash
$ curl http://localhost:3001/media | jq
{
  "video": [
    {
      "filename": "your-video.mp4",
      "size": 12345678,
      "type": "video",
      "source": "usb"
    }
  ]
}
```

### Video Playback
- Video plays fullscreen on TV
- Audio comes through TV speakers
- Playback is smooth (no stuttering)
- Video loops continuously

---

## 🐛 Quick Troubleshooting

### Can't Connect
```bash
ping 192.168.8.160
# If fails: Check power, network cable, IP address
```

### Can't SSH
```bash
ssh pi@192.168.8.160
# Password: klrklr89!
# If fails: Check SSH is enabled on Pi
```

### Service Won't Start
```bash
sudo journalctl -u goblin -n 50
cd ~/goblin && npm install
```

### Video Won't Play
```bash
vcgencmd get_mem gpu  # Should be 128M+
tvservice -s          # Check HDMI
vlc --version         # Check VLC installed
```

### No Audio
```bash
sudo amixer cset numid=3 2  # Force HDMI
sudo amixer set Master 80%  # Set volume
```

---

## 📞 Connection Info

- **Host**: 192.168.8.160
- **User**: pi
- **Password**: klrklr89!
- **Port**: 3001 (API)
- **Hostname**: goblin1

---

## 🎯 Success Checklist

- [ ] Can ping 192.168.8.160
- [ ] Can SSH to pi@192.168.8.160
- [ ] Files copied successfully
- [ ] Setup script completed
- [ ] Service running
- [ ] API responding
- [ ] USB mounted with videos
- [ ] Video plays on TV
- [ ] Audio through TV speakers

---

**Ready? Run: `cd goblin-system && ./deploy-to-goblin1.sh`**

🎃👹

