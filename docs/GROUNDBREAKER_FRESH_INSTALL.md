# GroundBreaker Fresh Installation Guide

Complete guide for performing a fresh installation of MonsterBox on GroundBreaker.

## System Information

- **Character Name**: GroundBreaker
- **Character ID**: 5
- **IP Address**: 192.168.8.200
- **Hostname**: groundbreaker.lan
- **User**: remote
- **AI Agent ID**: agent_4201k6s9y384f9v9hqmg67ygc645

## Hardware Configuration

### Head Motor
- **Type**: BTS7960 Motor Driver
- **Motor**: Jeep Wagoneer Wiper Motor
- **Wiring**:
  - EN Pin: GPIO 17 (Physical Pin 11, Brown wire)
  - RPWM Pin: GPIO 27 (Physical Pin 13, Red wire)
  - LPWM Pin: GPIO 22 (Physical Pin 15, Orange wire)
- **Max Duration**: 10000ms

### Webcam
- **Device**: /dev/video0
- **Name**: Groundbreaker Cam
- **Type**: USB Webcam
- **Streaming**: MJPG-Streamer on port 8090

### Speaker
- **Type**: USB Speaker
- **Audio System**: PipeWire/WirePlumber
- **Default Device**: Check with `aplay -l`

### Microphone
- **Name**: Groundbreaker Microphone
- **Device ID**: default
- **Type**: system

## Installation Methods

### Method 1: Automated Fresh Install (Recommended)

If you have physical or SSH access to GroundBreaker:

```bash
# 1. SSH into GroundBreaker
ssh remote@192.168.8.200

# 2. Navigate to MonsterBox directory
cd ~/MonsterBox

# 3. Run the fresh install script
bash scripts/groundbreaker-fresh-install.sh
```

This script will:
- ✅ Check system dependencies (Node.js, Python, pigpiod, MJPG-Streamer)
- ✅ Stop old MonsterBox instances
- ✅ Update code from GitHub
- ✅ Install all dependencies (npm and Python)
- ✅ Configure hardware (GPIO, webcam, audio)
- ✅ Start all required services
- ✅ Launch MonsterBox

### Method 2: Manual Fresh Install

If you prefer to do it step-by-step:

#### Step 1: OS-Level Installation (if needed)

```bash
# Run as root
sudo bash install.sh
```

This installs:
- Node.js 20 LTS
- Python 3 and dependencies
- Hardware libraries (pigpio, I2C tools)
- Audio system (PipeWire, WirePlumber)
- Video system (MJPG-Streamer)
- GPIO access

#### Step 2: MonsterBox Application Setup

```bash
# Run as regular user
cd ~/MonsterBox
bash setup-monsterbox.sh
```

This configures:
- Node.js dependencies
- Python dependencies
- Hardware interfaces
- Environment variables
- Systemd services

#### Step 3: Update Code

```bash
cd ~/MonsterBox
git pull origin main
npm install
```

#### Step 4: Start Services

```bash
# Start pigpiod
sudo pigpiod

# Start MJPG-Streamer
sudo systemctl start mjpg-streamer

# Start PipeWire/WirePlumber
systemctl --user start pipewire
systemctl --user start wireplumber

# Start MonsterBox
npm start
```

## Testing

### Test 1: Hardware Testing

Run the comprehensive hardware test:

```bash
bash scripts/test-groundbreaker-hardware.sh
```

This tests:
- ✅ GPIO access
- ✅ pigpiod service
- ✅ BTS7960 motor configuration
- ✅ Webcam device
- ✅ USB speaker
- ✅ I2C interface
- ✅ Network connectivity

### Test 2: TTS Testing

Run the comprehensive TTS test:

```bash
bash scripts/test-groundbreaker-tts.sh
```

This tests:
- ✅ Server status
- ✅ Audio system (PipeWire/WirePlumber)
- ✅ Simple TTS generation and playback
- ✅ AI agent conversation
- ✅ Multiple TTS phrases
- ✅ Volume levels
- ✅ Speaker configuration

### Test 3: Manual TTS Test

Test TTS via curl:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, I am GroundBreaker","characterId":5}'
```

### Test 4: AI Conversation Test

Test AI agent:

```bash
curl -X POST http://localhost:3000/api/elevenlabs/conversation/test \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_4201k6s9y384f9v9hqmg67ygc645","text":"Tell me about yourself"}'
```

### Test 5: Motor Test

Test the head motor:

```bash
python3 python_wrappers/test_groundbreaker_bts7960.py
```

Or via the web interface:
- Navigate to: http://192.168.8.200:3000/setup/calibration
- Find "Groundbreaker Head" motor
- Test forward/reverse movement

### Test 6: Webcam Test

Via web interface:
- Navigate to: http://192.168.8.200:3000/setup/webcam
- View live stream

Or check MJPG-Streamer directly:
- http://192.168.8.200:8090/?action=stream

## Web Interface Access

Once MonsterBox is running:

- **Main Dashboard**: http://192.168.8.200:3000
- **Calibration**: http://192.168.8.200:3000/setup/calibration
- **Webcam**: http://192.168.8.200:3000/setup/webcam
- **AI Settings**: http://192.168.8.200:3000/ai-settings
- **Conversation**: http://192.168.8.200:3000/conversation
- **Audio Config**: http://192.168.8.200:3000/setup/audio

## Troubleshooting

### SSH Access Issues

If you can't SSH into GroundBreaker:

1. **Check network connectivity**:
   ```bash
   ping 192.168.8.200
   ```

2. **Copy SSH key** (from another animatronic):
   ```bash
   ssh-copy-id remote@192.168.8.200
   ```

3. **Physical access**: Connect keyboard/monitor directly to GroundBreaker

### TTS Not Working

1. **Check audio system**:
   ```bash
   systemctl --user status pipewire
   systemctl --user status wireplumber
   ```

2. **List audio devices**:
   ```bash
   aplay -l
   ```

3. **Test speaker**:
   ```bash
   speaker-test -t wav -c 2
   ```

4. **Check speaker configuration** in parts.json:
   ```bash
   cat data/character-5/parts.json | grep -A 5 speaker
   ```

### Motor Not Working

1. **Check pigpiod**:
   ```bash
   sudo pigpiod
   pgrep pigpiod
   ```

2. **Check GPIO access**:
   ```bash
   ls -l /dev/gpiomem
   ```

3. **Verify wiring**:
   - EN: GPIO 17 (Pin 11, Brown)
   - RPWM: GPIO 27 (Pin 13, Red)
   - LPWM: GPIO 22 (Pin 15, Orange)

4. **Test motor directly**:
   ```bash
   python3 python_wrappers/test_groundbreaker_bts7960.py
   ```

### Webcam Not Working

1. **Check device**:
   ```bash
   ls -l /dev/video0
   v4l2-ctl --device=/dev/video0 --info
   ```

2. **Check MJPG-Streamer**:
   ```bash
   sudo systemctl status mjpg-streamer
   sudo systemctl start mjpg-streamer
   ```

3. **Test stream**:
   - http://192.168.8.200:8090/?action=stream

### MonsterBox Won't Start

1. **Check logs**:
   ```bash
   tail -50 /tmp/monsterbox.log
   ```

2. **Check port 3000**:
   ```bash
   netstat -tulpn | grep 3000
   ```

3. **Kill old processes**:
   ```bash
   pkill -f 'node.*server.js'
   ```

4. **Restart**:
   ```bash
   npm start
   ```

## Service Management

### Start MonsterBox on Boot

```bash
sudo systemctl enable monsterbox
sudo systemctl start monsterbox
```

### Check Service Status

```bash
sudo systemctl status monsterbox
sudo systemctl status mjpg-streamer
systemctl --user status pipewire
systemctl --user status wireplumber
```

### View Logs

```bash
# MonsterBox logs
tail -f /tmp/monsterbox.log

# System logs
journalctl -u monsterbox -f
journalctl -u mjpg-streamer -f
```

## Configuration Files

Key configuration files for GroundBreaker:

- **Parts**: `data/character-5/parts.json`
- **Audio**: `data/character-5/audio-config.json`
- **STT**: `data/character-5/ai-config/stt-config.json`
- **TTS**: `data/character-5/ai-config/tts-config.json`
- **Character**: `data/characters.json` (entry for ID 5)
- **Animatronics**: `config/animatronics.json`

## Next Steps After Installation

1. ✅ **Test TTS extensively** - Run `bash scripts/test-groundbreaker-tts.sh`
2. ✅ **Test motor movement** - Via web interface or Python script
3. ✅ **Test webcam** - Verify streaming works
4. ✅ **Test AI conversation** - Use conversation page
5. ✅ **Configure speaker** - Add speaker part if not present
6. ✅ **Set up poses** - Create poses for GroundBreaker
7. ✅ **Set up scenes** - Create scare sequences
8. ✅ **Test full integration** - Run complete scare sequence

## Support

For issues or questions:
- Check logs: `/tmp/monsterbox.log`
- Review this guide
- Check hardware connections
- Verify all services are running

