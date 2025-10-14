# Deployment Documentation

This directory contains deployment guides, status reports, and procedures for MonsterBox 5.3 deployments.

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

MonsterBox 5.3 supports deployment to multiple animatronic characters across a network.

### Supported Characters
1. **PumpkinHead** (Character 1) - 192.168.8.150
2. **Coffin Breaker** (Character 2) - 192.168.8.140
3. **Orlok** (Character 3) - 192.168.8.120
4. **Groundbreaker** (Character 4) - 192.168.8.130
5. **Goblin** (Character 5) - TBD

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
192.168.8.140 - Coffin Breaker (Character 2)
192.168.8.120 - Orlok (Character 3)
192.168.8.130 - Groundbreaker (Character 4)
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check for port conflicts
sudo lsof -i :3000
sudo fuser -k 3000/tcp

# Check logs
journalctl -u monsterbox -f
```

### Character Not Loading
```bash
# Verify character selection
cat config/app-config.json

# Check character data exists
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

### MonsterBox 5.3 Release
- **Date:** October 2025
- **Status:** ✅ Production Ready
- **Test Results:** 63/63 unit tests passing
- **Key Features:**
  - Single-node architecture
  - Character isolation
  - Hardware abstraction layer
  - Real-time WebSocket communication

---

**Last Updated:** October 14, 2025  
**Current Version:** MonsterBox 5.3

