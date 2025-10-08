# 🎃 Halloween Readiness Deployment Guide 🎃

**Created:** October 8, 2025  
**Purpose:** Ensure all 5 animatronics boot to fully operational state for Halloween

---

## Overview

This deployment ensures that when any animatronic reboots, it automatically comes up in a **fully ready state** with:

- ✅ **Webcam streaming** through MonsterBox on port 8090
- ✅ **Audio system** (PipeWire, WirePlumber) running
- ✅ **STT** (Speech-to-Text) ready via ElevenLabs
- ✅ **TTS** (Text-to-Speech) ready via ElevenLabs
- ✅ **AI Agents** configured and ready
- ✅ **Conversation Mode** accessible and functional

---

## Animatronics

| Name | IP Address | Character ID | Status |
|------|------------|--------------|--------|
| Orlok | 192.168.8.120 | 3 | 🎃 |
| PumpkinHead | 192.168.8.150 | 1 | 🎃 |
| Coffin Breaker | 192.168.8.140 | 2 | 🎃 |
| Skulltalker | 192.168.8.130 | 4 | 🎃 |
| Groundbreaker | 192.168.8.200 | 5 | 🎃 |

---

## What Was Created

### 1. Boot Completion Script
**File:** `scripts/monsterbox-boot-complete.sh`

This script runs after MonsterBox starts and ensures:
- Audio services (PipeWire, PipeWire-Pulse, WirePlumber) are running
- mjpg-streamer is running on port 8090
- MonsterBox application is responding on port 3000
- Conversation mode is enabled with random poses

### 2. Systemd Service
**File:** `scripts/monsterbox-complete.service`

Complete systemd service that:
- Starts MonsterBox on boot
- Runs boot completion script
- Auto-restarts on failure
- Logs to `/var/log/monsterbox.log`

### 3. Playwright Verification Suite
**File:** `tests/playwright/halloween-readiness.spec.js`

Automated browser tests that verify:
- MonsterBox application is running
- Webcam is streaming through MonsterBox
- Audio system is configured
- AI Chat/Conversation mode is accessible
- ElevenLabs agent is configured
- mjpg-streamer is responding
- Full conversation workflow works

### 4. Deployment Scripts

#### Remote Deployment (if network accessible)
**File:** `scripts/deploy-halloween-readiness.sh`
- Deploys to all animatronics via SSH
- Installs service and scripts
- Verifies deployment

#### Local Installation
**File:** `scripts/install-halloween-readiness-local.sh`
- Run ON each animatronic
- Installs complete system
- Verifies installation

#### 5x Reboot Verification
**File:** `scripts/verify-5x-reboot.sh`
- Reboots each animatronic 5 times
- Runs Playwright verification after each boot
- Generates comprehensive report

---

## Installation Instructions

### Option 1: Remote Deployment (Preferred)

If you can reach the animatronics via network:

```bash
cd /home/remote/MonsterBox
./scripts/deploy-halloween-readiness.sh
```

This will deploy to all 5 animatronics automatically.

### Option 2: Local Installation (Per Animatronic)

If animatronics are not network accessible, run on each one:

```bash
# SSH to the animatronic
ssh remote@orlok  # or pumpkinhead, coffin, skulltalker, groundbreaker

# Navigate to MonsterBox
cd /home/remote/MonsterBox

# Pull latest code
git pull origin main

# Run local installation
./scripts/install-halloween-readiness-local.sh
```

### Option 3: Manual Installation

On each animatronic:

```bash
cd /home/remote/MonsterBox

# Make scripts executable
chmod +x scripts/monsterbox-boot-complete.sh

# Install systemd service
sudo cp scripts/monsterbox-complete.service /etc/systemd/system/monsterbox.service
sudo systemctl daemon-reload
sudo systemctl enable monsterbox
sudo systemctl restart monsterbox

# Verify
curl http://localhost:3000/health
```

---

## Verification

### Quick Verification

On each animatronic:

```bash
# Check service status
sudo systemctl status monsterbox

# Check boot log
tail -f /var/log/monsterbox-boot.log

# Check application
curl http://localhost:3000/health

# Check webcam
curl -I http://localhost:8090/
```

### Playwright Verification

Run the automated test suite:

```bash
cd /home/remote/MonsterBox
npx playwright test tests/playwright/halloween-readiness.spec.js
```

This will verify:
- ✅ MonsterBox application
- ✅ Webcam streaming
- ✅ Audio system
- ✅ Conversation mode
- ✅ mjpg-streamer

### 5x Reboot Verification

To verify each animatronic can reboot 5 times successfully:

```bash
cd /home/remote/MonsterBox
./scripts/verify-5x-reboot.sh
```

**Warning:** This will take approximately 25 minutes per animatronic (125 minutes total for all 5).

---

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status monsterbox

# Check logs
sudo journalctl -u monsterbox -n 50

# Check boot log
tail -50 /var/log/monsterbox-boot.log
```

### Webcam Not Working

```bash
# Check mjpg-streamer
sudo systemctl status mjpg-streamer

# Check camera device
ls -la /dev/video*

# Test mjpg-streamer
curl -I http://localhost:8090/
```

### Audio Not Working

```bash
# Check audio services
systemctl --user status pipewire
systemctl --user status wireplumber

# Check audio devices
wpctl status

# Restart audio
systemctl --user restart pipewire pipewire-pulse wireplumber
```

### MonsterBox Not Responding

```bash
# Check if running
pgrep -f 'node.*server.js'

# Check port
lsof -i :3000

# Restart service
sudo systemctl restart monsterbox

# Check logs
tail -100 /var/log/monsterbox.log
```

---

## Testing Conversation Mode

### Via Browser

1. Open browser to `http://<animatronic-ip>:3000/conversation`
2. Verify webcam stream is visible
3. Verify speaker selection is populated
4. Test "Make Character Say" functionality
5. Verify microphone controls are present

### Via Playwright

```bash
npx playwright test tests/playwright/halloween-readiness.spec.js --headed
```

This will open a browser and show you the tests running.

---

## Expected Boot Sequence

When an animatronic boots:

1. **System Boot** (30-60 seconds)
2. **Network Available** (5-10 seconds)
3. **mjpg-streamer Starts** (2-5 seconds)
4. **Audio Services Start** (5-10 seconds)
5. **MonsterBox Service Starts** (10-20 seconds)
6. **Boot Completion Script Runs** (10-30 seconds)
   - Verifies audio services
   - Verifies mjpg-streamer
   - Verifies MonsterBox app
   - Enables conversation mode
7. **READY** (Total: 60-120 seconds)

---

## Success Criteria

Each animatronic is considered **READY** when:

- ✅ MonsterBox responds on port 3000
- ✅ mjpg-streamer responds on port 8090
- ✅ Webcam stream visible in `/conversation` page
- ✅ Audio system (wpctl) is functional
- ✅ Speaker selection populated
- ✅ Microphone controls present
- ✅ Conversation page loads without errors
- ✅ All Playwright tests pass

---

## Maintenance

### View Boot Logs

```bash
tail -f /var/log/monsterbox-boot.log
```

### View Application Logs

```bash
tail -f /var/log/monsterbox.log
```

### Restart Everything

```bash
sudo systemctl restart monsterbox
```

### Disable Auto-Start (for maintenance)

```bash
sudo systemctl disable monsterbox
```

### Re-enable Auto-Start

```bash
sudo systemctl enable monsterbox
```

---

## Files Created

```
scripts/
├── monsterbox-boot-complete.sh          # Boot completion script
├── monsterbox-complete.service          # Systemd service file
├── deploy-halloween-readiness.sh        # Remote deployment script
├── install-halloween-readiness-local.sh # Local installation script
└── verify-5x-reboot.sh                  # 5x reboot verification

tests/playwright/
└── halloween-readiness.spec.js          # Playwright verification suite

HALLOWEEN_READINESS_DEPLOYMENT.md        # This file
```

---

## 🎃 Ready for Halloween! 🎃

Once deployed and verified, all animatronics will:
- Boot automatically to fully operational state
- Have webcam streaming through MonsterBox
- Have audio system ready
- Have AI conversation mode ready
- Be ready to scare visitors!

**No manual intervention required after reboot!**

---

**Last Updated:** October 8, 2025  
**Status:** Ready for Deployment

