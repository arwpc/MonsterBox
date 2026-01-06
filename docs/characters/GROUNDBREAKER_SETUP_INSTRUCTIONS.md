# GroundBreaker Fresh Install - Step-by-Step Instructions

## Quick Summary

GroundBreaker (192.168.8.200) currently has MonsterBox 5.5 running but needs a fresh installation to ensure all components are properly configured. SSH access from other machines is currently blocked (SSH keys not authorized).

## Option 1: Physical Console Access (Recommended)

### Step 1: Connect to GroundBreaker
1. Connect keyboard and monitor to GroundBreaker
2. Login with:
   - Username: `remote`
   - Password: `klrklr89!`

### Step 2: Enable SSH Access (Optional but Recommended)
```bash
# Enable password authentication for SSH
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# OR copy SSH key from another animatronic
# From Orlok or another working animatronic, run:
# ssh-copy-id remote@192.168.8.200
```

### Step 3: Run Fresh Install Script
```bash
cd ~/MonsterBox
bash scripts/groundbreaker-fresh-install.sh
```

This script will:
- ✅ Check system dependencies
- ✅ Stop old MonsterBox instances  
- ✅ Update code from GitHub
- ✅ Install all dependencies
- ✅ Configure hardware
- ✅ Start services
- ✅ Launch MonsterBox

### Step 4: Test Hardware
```bash
# Test all hardware components
bash scripts/test-groundbreaker-hardware.sh
```

### Step 5: Test TTS Extensively
```bash
# Run comprehensive TTS tests
bash scripts/test-groundbreaker-tts.sh
```

## Option 2: Remote Deployment (After SSH Access is Enabled)

Once SSH access is working, you can deploy from another machine:

```bash
# From Orlok or development machine
cd ~/MonsterBox

# Deploy to GroundBreaker
./scripts/deploy-to-animatronic.sh 5 192.168.8.200

# SSH in and run tests
ssh remote@192.168.8.200
cd ~/MonsterBox
bash scripts/test-groundbreaker-tts.sh
```

## What Gets Installed/Configured

### Hardware Components
1. **Head Motor** (BTS7960 Driver)
   - EN Pin: GPIO 17
   - RPWM Pin: GPIO 27  
   - LPWM Pin: GPIO 22
   - Motor: Jeep Wagoneer Wiper Motor

2. **Webcam**
   - Device: /dev/video0
   - Streaming: MJPG-Streamer on port 8090

3. **USB Speaker**
   - Audio System: PipeWire/WirePlumber
   - Playback via pw-play and mpg123

4. **Microphone**
   - Device: default
   - Capture via PyAudio

### Services
- **MonsterBox**: Main application (port 3000)
- **pigpiod**: GPIO daemon for motor control
- **MJPG-Streamer**: Webcam streaming (port 8090)
- **PipeWire**: Audio system
- **WirePlumber**: Audio session manager

### AI Configuration
- **Character**: GroundBreaker (ID: 5)
- **AI Agent**: agent_4201k6s9y384f9v9hqmg67ygc645
- **TTS**: ElevenLabs with character-specific voice
- **STT**: ElevenLabs Scribe v1

## Testing Checklist

After installation, verify each component:

### ✅ 1. Web Interface
- [ ] Dashboard loads: http://192.168.8.200:3000
- [ ] Character shows as "Groundbreaker"
- [ ] No console errors

### ✅ 2. Head Motor
- [ ] Navigate to: http://192.168.8.200:3000/setup/calibration
- [ ] Find "Groundbreaker Head" motor
- [ ] Test forward movement (should move for specified duration)
- [ ] Test reverse movement
- [ ] Emergency stop works

### ✅ 3. Webcam
- [ ] Navigate to: http://192.168.8.200:3000/setup/webcam
- [ ] Live stream displays
- [ ] MJPG-Streamer accessible: http://192.168.8.200:8090/?action=stream

### ✅ 4. Speaker/TTS
- [ ] Run: `bash scripts/test-groundbreaker-tts.sh`
- [ ] Hear audio output from USB speaker
- [ ] Test via web: http://192.168.8.200:3000/conversation
- [ ] Type a message and hear GroundBreaker speak

### ✅ 5. AI Conversation
- [ ] Navigate to: http://192.168.8.200:3000/conversation
- [ ] Type: "Tell me about yourself"
- [ ] Verify AI agent responds (not fallback)
- [ ] Hear TTS audio output

### ✅ 6. Microphone
- [ ] Navigate to: http://192.168.8.200:3000/setup/audio
- [ ] See "Groundbreaker Microphone" listed
- [ ] VU meter shows activity when speaking
- [ ] Input gain slider works

## Manual TTS Testing Commands

```bash
# Simple TTS test
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, I am GroundBreaker, rising from the grave","characterId":5}'

# AI conversation test
curl -X POST http://localhost:3000/api/elevenlabs/conversation/test \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_4201k6s9y384f9v9hqmg67ygc645","text":"Introduce yourself"}'

# Test with different volume levels
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Testing volume at 100 percent","characterId":5,"volume":100}'
```

## Troubleshooting

### SSH Access Issues
**Problem**: Can't SSH into GroundBreaker  
**Solution**: Use physical console access or enable password authentication:
```bash
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### No Audio Output
**Problem**: TTS generates but no sound  
**Solutions**:
1. Check PipeWire is running:
   ```bash
   systemctl --user status pipewire
   systemctl --user status wireplumber
   ```

2. List audio devices:
   ```bash
   aplay -l
   wpctl status
   ```

3. Test speaker directly:
   ```bash
   speaker-test -t wav -c 2
   ```

4. Check speaker configuration in parts.json

### Motor Not Moving
**Problem**: Motor commands sent but no movement  
**Solutions**:
1. Check pigpiod is running:
   ```bash
   sudo pigpiod
   pgrep pigpiod
   ```

2. Verify GPIO access:
   ```bash
   ls -l /dev/gpiomem
   ```

3. Test motor directly:
   ```bash
   python3 python_wrappers/test_groundbreaker_bts7960.py
   ```

4. Check wiring:
   - EN: GPIO 17 (Pin 11, Brown)
   - RPWM: GPIO 27 (Pin 13, Red)
   - LPWM: GPIO 22 (Pin 15, Orange)

### Webcam Not Streaming
**Problem**: No video feed  
**Solutions**:
1. Check device exists:
   ```bash
   ls -l /dev/video0
   v4l2-ctl --device=/dev/video0 --info
   ```

2. Check MJPG-Streamer:
   ```bash
   sudo systemctl status mjpg-streamer
   sudo systemctl restart mjpg-streamer
   ```

3. Test stream directly:
   ```bash
   curl -I http://localhost:8090/?action=stream
   ```

### MonsterBox Won't Start
**Problem**: npm start fails  
**Solutions**:
1. Check logs:
   ```bash
   tail -50 /tmp/monsterbox.log
   ```

2. Kill old processes:
   ```bash
   pkill -f 'node.*server.js'
   ```

3. Reinstall dependencies:
   ```bash
   npm install
   ```

4. Check port 3000:
   ```bash
   netstat -tulpn | grep 3000
   ```

## Files Created/Modified

The fresh install creates/modifies these files:

- `scripts/groundbreaker-fresh-install.sh` - Main installation script
- `scripts/test-groundbreaker-tts.sh` - TTS testing script
- `scripts/test-groundbreaker-hardware.sh` - Hardware testing script
- `docs/GROUNDBREAKER_FRESH_INSTALL.md` - Detailed installation guide
- `data/character-5/parts.json` - Hardware configuration
- `data/character-5/audio-config.json` - Audio settings
- `data/character-5/ai-config/tts-config.json` - TTS settings
- `data/character-5/ai-config/stt-config.json` - STT settings

## Next Steps After Successful Install

1. **Create Poses** - Define GroundBreaker's movements
2. **Create Scenes** - Build scare sequences
3. **Test Full Integration** - Run complete scare routine
4. **Configure Triggers** - Set up motion sensors or manual triggers
5. **Fine-tune TTS** - Adjust voice settings for GroundBreaker's character
6. **Test with Other Animatronics** - Verify multi-character coordination

## Support

If you encounter issues:
1. Check logs: `/tmp/monsterbox.log`
2. Review this guide's troubleshooting section
3. Verify all services are running
4. Check hardware connections
5. Test components individually before integration

## Quick Reference

- **Web Interface**: http://192.168.8.200:3000
- **Webcam Stream**: http://192.168.8.200:8090/?action=stream
- **Character ID**: 5
- **AI Agent**: agent_4201k6s9y384f9v9hqmg67ygc645
- **SSH**: `ssh remote@192.168.8.200` (password: klrklr89!)
- **Logs**: `/tmp/monsterbox.log`

