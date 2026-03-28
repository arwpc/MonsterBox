# Deployment Documentation

This directory contains deployment guides, status reports, and procedures for MonsterBox deployments.

## Quick Links

### Current Deployment Status
- **[Halloween 2025 Ready](HALLOWEEN_2025_READY.md)** - Final Halloween 2025 deployment status
- **[Halloween Readiness Complete](HALLOWEEN_READINESS_COMPLETE.md)** - Readiness checklist completion
- **[Halloween Final Status](HALLOWEEN_FINAL_STATUS.md)** - Final system status

### Deployment Guides
- **[Deployment Complete](DEPLOYMENT_COMPLETE.md)** - Main deployment completion report
- **[Halloween Deployment Complete](HALLOWEEN_DEPLOYMENT_COMPLETE.md)** - Halloween-specific deployment
- **[Halloween Deployment Status](HALLOWEEN_DEPLOYMENT_STATUS.md)** - Deployment progress tracking
- **[Halloween Readiness Deployment](HALLOWEEN_READINESS_DEPLOYMENT.md)** - Readiness deployment procedures

---

## Deployment Overview

MonsterBox supports deployment to multiple animatronic characters across a network.

### Supported Characters
1. **PumpkinHead** (Character 1) - 192.168.8.150 ✅
2. **Mina** (Character 2) - 192.168.8.140 ✅ (Controller)
3. **Orlok** (Character 3) - 192.168.8.120 ✅
4. **Sir Dragomir** (Character 4) - 192.168.8.130 ⚠️ Currently offline
5. **Groundbreaker** (Character 5) - 192.168.8.200 ✅

---

## Fresh RPi Installation

The `install.sh` script handles everything for a new Raspberry Pi 4B:

```bash
git clone git@github.com:arwpc/MonsterBox.git
cd MonsterBox
sudo bash install.sh
```

During install, you'll be prompted to:
1. **Enter a character name** — creates the character in `characters.json`, scaffolds data files
2. **Enter the RPi's static IP** — registers in `config/animatronics.json` for network discovery

The installer also:
- **Sets the RPi hostname** to match the character name (lowercase, e.g., "Mina" → `mina`)
- **Registers in `animatronics.json`** — so `getHostnameCharacterId()` auto-selects the correct character on every boot
- **Creates and starts the systemd service** — `Restart=always` ensures it comes back after crashes
- **Verifies the service is responding** — checks HTTPS on port 3000 before finishing
- **Generates SSL certificates** — required for browser microphone access

After install, a reboot is recommended for I2C/SPI/GPU changes. The service starts automatically on boot.

### Key: Hostname → Character Auto-Select

Each RPi's hostname must match an entry in `config/animatronics.json`. On startup, `getHostnameCharacterId()` reads the hostname and selects the matching character. This means:
- **You cannot switch characters by editing `app-config.json`** — it gets overwritten on startup
- **The hostname IS the character identity** — changing it changes which character the server loads
- **All RPis share the same codebase** — character data is isolated in `data/character-{id}/`

---

## Deployment Scripts

### Deploy to Single Animatronic
```bash
./scripts/deploy-to-animatronic.sh <character_id> <ip_address>
```

Example:
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120  # Deploy to Orlok
```

### Deploy to All Animatronics
```bash
./scripts/force-pull-all-animatronics.sh  # Force pull latest code
./scripts/start-all-animatronics.sh       # Start all servers
./scripts/stop-all-animatronics.sh        # Stop all servers
./scripts/test-all-animatronics.sh        # Test all systems
```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing locally
- [ ] Character configuration verified
- [ ] Hardware parts configured
- [ ] GPIO assignments verified
- [ ] Audio system tested
- [ ] Webcam streaming tested
- [ ] AI agent configured

### Deployment
- [ ] Code deployed to target animatronic
- [ ] Dependencies installed (`npm ci`)
- [ ] Environment variables set
- [ ] Services started
- [ ] Port accessibility verified

### Post-Deployment
- [ ] Server responding on port 3000
- [ ] Character selection correct
- [ ] Parts loading correctly
- [ ] Hardware responding
- [ ] Audio input/output working
- [ ] Webcam streaming
- [ ] AI agent responding
- [ ] WebSocket connections stable

---

## Network Configuration

### Port Assignments
- **3000** - Main MonsterBox server
- **3100** - Test server (development)
- **8090** - MJPG-Streamer (webcam)
- **8795** - ElevenLabs WebSocket

### Character IP Addresses
```
192.168.8.150 - PumpkinHead (Character 1)
192.168.8.140 - Mina (Character 2, Controller)
192.168.8.120 - Orlok (Character 3)
192.168.8.130 - Sir Dragomir (Character 4) - Currently offline
192.168.8.200 - Groundbreaker (Character 5)
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check service status and logs
systemctl status monsterbox.service
sudo tail -50 /var/log/monsterbox.log
sudo tail -50 /var/log/monsterbox.err

# Check for port conflicts
sudo lsof -i :3000
sudo fuser -k 3000/tcp

# Restart the service
sudo systemctl restart monsterbox.service
```

### Character Not Loading (Wrong Character Selected)
The server auto-selects a character based on the RPi hostname via `config/animatronics.json`.
```bash
# Check current hostname
hostname

# Verify it matches an entry in animatronics.json
cat config/animatronics.json | python3 -m json.tool

# If hostname doesn't match, set it (requires reboot or service restart):
sudo hostnamectl set-hostname mina
sudo systemctl restart monsterbox.service

# Verify character data exists
ls -la data/character-{id}/
```

### Hardware Not Responding
```bash
# Test GPIO access
python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); print('GPIO OK')"

# Check parts configuration
curl http://localhost:3000/setup/parts/api/parts
```

### Audio Issues
```bash
# List audio devices
aplay -l
arecord -l

# Test speaker
speaker-test -c 2 -r 48000 -D hw:4,0 -t sine -f 440 -l 1

# Test microphone
arecord -D hw:3,0 -f S16_LE -r 16000 -c 1 -d 3 /tmp/test.wav
```

---

## Related Documentation

- **[Orlok Deployment Guide](../ORLOK_DEPLOYMENT.md)** - Detailed Orlok deployment
- **[Quick Reference](../QUICK_REFERENCE.md)** - Commands and endpoints
- **[Character Documentation](../characters/)** - Character-specific guides
- **[Setup Guides](../setup/)** - Installation procedures
- **[Hardware Documentation](../hardware/)** - GPIO and wiring

---

## Deployment History

### Halloween 2025 Deployment
- **Date:** October 2025
- **Status:** ✅ Complete
- **Characters Deployed:** 5/5
- **Features:**
  - ElevenLabs AI agents per character
  - BTS7960 motor driver support
  - Random poses during conversation
  - Goblin video display integration
  - Complete audio pipeline

### MonsterBox 5.5 Release (Historical)
- **Date:** October 2025
- **Status:** ✅ Production Ready
- **Current Commit:** f2f11caf
- **Key Features:**
  - Single-node architecture
  - Character isolation
  - Hardware abstraction layer
  - Real-time WebSocket communication
  - Test stabilization and audio improvements
  - Dedicated AI telemetry endpoints

---

**Last Updated:** March 2026
**Current Version:** See package.json (avoid hardcoding)

