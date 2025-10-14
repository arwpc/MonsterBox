# GroundBreaker Fresh Installation Package

## 📦 Complete Installation Package Created

All scripts and documentation have been created for a fresh installation of MonsterBox on GroundBreaker.

## 🎯 Current Status

- **GroundBreaker IP**: 192.168.8.200
- **MonsterBox Status**: Running (version 5.2)
- **Web Interface**: ✅ Accessible at http://192.168.8.200:3000
- **SSH Access**: ❌ Blocked (SSH keys not authorized, password auth disabled)
- **Character**: Groundbreaker (ID: 5)

## 📋 Installation Scripts Created

### 1. Main Installation Script
**File**: `scripts/groundbreaker-fresh-install.sh`
- Complete fresh installation automation
- Checks dependencies, updates code, installs packages
- Configures hardware and services
- Starts MonsterBox
- **Run on GroundBreaker**: `bash scripts/groundbreaker-fresh-install.sh`

### 2. TTS Testing Script
**File**: `scripts/test-groundbreaker-tts.sh`
- Comprehensive TTS testing suite
- Tests simple TTS, AI agent, multiple phrases, volume levels
- Verifies audio system and speaker configuration
- **Run on GroundBreaker**: `bash scripts/test-groundbreaker-tts.sh`

### 3. Hardware Testing Script
**File**: `scripts/test-groundbreaker-hardware.sh`
- Tests all hardware components
- GPIO, pigpiod, BTS7960 motor, webcam, USB speaker, I2C
- Network connectivity verification
- **Run on GroundBreaker**: `bash scripts/test-groundbreaker-hardware.sh`

### 4. SSH Access Enabler
**File**: `scripts/enable-ssh-access.sh`
- Enables password authentication for SSH
- Allows remote access from other machines
- **Run on GroundBreaker**: `sudo bash scripts/enable-ssh-access.sh`

## 📚 Documentation Created

### 1. Fresh Install Guide
**File**: `docs/GROUNDBREAKER_FRESH_INSTALL.md`
- Complete installation guide
- Hardware configuration details
- Testing procedures
- Troubleshooting section

### 2. Setup Instructions
**File**: `GROUNDBREAKER_SETUP_INSTRUCTIONS.md`
- Step-by-step instructions
- Physical console access guide
- Remote deployment option
- Testing checklist

### 3. This Package Summary
**File**: `GROUNDBREAKER_INSTALLATION_PACKAGE.md`
- Overview of all created files
- Quick start guide
- Next steps

## 🚀 Quick Start Guide

### Option A: Physical Console Access (Recommended)

1. **Connect to GroundBreaker**
   - Connect keyboard and monitor
   - Login: `remote` / `klrklr89!`

2. **Enable SSH Access** (Optional but recommended)
   ```bash
   cd ~/MonsterBox
   sudo bash scripts/enable-ssh-access.sh
   ```

3. **Run Fresh Install**
   ```bash
   bash scripts/groundbreaker-fresh-install.sh
   ```

4. **Test Hardware**
   ```bash
   bash scripts/test-groundbreaker-hardware.sh
   ```

5. **Test TTS Extensively**
   ```bash
   bash scripts/test-groundbreaker-tts.sh
   ```

### Option B: Remote Access (After SSH is Enabled)

1. **From another animatronic or dev machine**:
   ```bash
   # Enable SSH on GroundBreaker first (requires physical access)
   # Then from remote machine:
   ssh remote@192.168.8.200
   cd ~/MonsterBox
   bash scripts/groundbreaker-fresh-install.sh
   ```

## 🔧 Hardware Configuration

### Head Motor (BTS7960)
- **Type**: Jeep Wagoneer Wiper Motor
- **Control Board**: BTS7960
- **Wiring**:
  - EN Pin: GPIO 17 (Pin 11, Brown wire)
  - RPWM Pin: GPIO 27 (Pin 13, Red wire)
  - LPWM Pin: GPIO 22 (Pin 15, Orange wire)
- **Max Duration**: 10000ms

### Webcam
- **Device**: /dev/video0
- **Name**: Groundbreaker Cam
- **Streaming**: MJPG-Streamer (port 8090)
- **URL**: http://192.168.8.200:8090/?action=stream

### USB Speaker
- **Audio System**: PipeWire/WirePlumber
- **Playback**: pw-play, mpg123
- **Configuration**: Auto-detected

### Microphone
- **Name**: Groundbreaker Microphone
- **Device**: default (system)
- **Capture**: PyAudio with PipeWire

## 🤖 AI Configuration

- **Character ID**: 5
- **Character Name**: Groundbreaker
- **AI Agent ID**: agent_4201k6s9y384f9v9hqmg67ygc645
- **TTS Provider**: ElevenLabs
- **STT Provider**: ElevenLabs (Scribe v1)
- **Voice**: Character-specific (configured in tts-config.json)

## ✅ Testing Checklist

After installation, verify:

- [ ] Web interface loads (http://192.168.8.200:3000)
- [ ] Character shows as "Groundbreaker"
- [ ] Head motor moves (forward/reverse)
- [ ] Webcam streams video
- [ ] TTS generates and plays audio
- [ ] AI agent responds (not fallback)
- [ ] Microphone captures audio
- [ ] VU meters show activity

## 🎯 Manual Testing Commands

### TTS Test
```bash
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, I am GroundBreaker","characterId":5}'
```

### AI Conversation Test
```bash
curl -X POST http://localhost:3000/api/elevenlabs/conversation/test \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent_4201k6s9y384f9v9hqmg67ygc645","text":"Tell me about yourself"}'
```

### Motor Test
```bash
python3 python_wrappers/test_groundbreaker_bts7960.py
```

## 📁 Configuration Files

Key files for GroundBreaker:

- `data/character-5/parts.json` - Hardware parts
- `data/character-5/audio-config.json` - Audio settings
- `data/character-5/ai-config/tts-config.json` - TTS configuration
- `data/character-5/ai-config/stt-config.json` - STT configuration
- `data/characters.json` - Character definition (ID 5)
- `config/animatronics.json` - Network configuration

## 🔍 Troubleshooting

### Can't SSH into GroundBreaker
**Solution**: Use physical console access and run:
```bash
sudo bash scripts/enable-ssh-access.sh
```

### No Audio Output
**Check**:
1. PipeWire running: `systemctl --user status pipewire`
2. Audio devices: `aplay -l`
3. Speaker test: `speaker-test -t wav -c 2`

### Motor Not Moving
**Check**:
1. pigpiod running: `pgrep pigpiod`
2. GPIO access: `ls -l /dev/gpiomem`
3. Wiring connections

### Webcam Not Streaming
**Check**:
1. Device exists: `ls -l /dev/video0`
2. MJPG-Streamer: `sudo systemctl status mjpg-streamer`
3. Stream URL: `curl -I http://localhost:8090/?action=stream`

## 📊 Services Required

- **MonsterBox**: Main application (port 3000)
- **pigpiod**: GPIO daemon for motor control
- **MJPG-Streamer**: Webcam streaming (port 8090)
- **PipeWire**: Audio system
- **WirePlumber**: Audio session manager

## 🎬 Next Steps After Installation

1. **Test All Components** - Run all testing scripts
2. **Create Poses** - Define GroundBreaker's movements
3. **Create Scenes** - Build scare sequences
4. **Configure Triggers** - Set up activation methods
5. **Fine-tune Voice** - Adjust TTS settings
6. **Integration Test** - Test with other animatronics

## 📞 Support Resources

- **Main Documentation**: `docs/GROUNDBREAKER_FRESH_INSTALL.md`
- **Setup Instructions**: `GROUNDBREAKER_SETUP_INSTRUCTIONS.md`
- **Logs**: `/tmp/monsterbox.log`
- **Web Interface**: http://192.168.8.200:3000

## 🎃 Ready for Halloween!

Once all tests pass, GroundBreaker will be fully operational with:
- ✅ Head motor movement
- ✅ Webcam streaming
- ✅ AI-powered conversation
- ✅ Text-to-speech audio
- ✅ Speech-to-text input
- ✅ Full MonsterBox 5.2 integration

---

**Created**: October 7, 2025
**For**: GroundBreaker (Character ID 5, IP 192.168.8.200)
**MonsterBox Version**: 5.2

