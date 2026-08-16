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

Status and version as observed at the end of the v9.2.0 session (**2026-08-16 10:22**, via
`curl -sk https://<node>:3000/health`). The static IPs are a fallback — nodes discover each
other's live addresses over mDNS.

| # | Character | Address | Status | Version |
|---|---|---|---|---|
| 1 | PumpkinHead | 192.168.8.150 | 🔴 Offline all session — **unverified** | unknown |
| 2 | Mina | 192.168.8.140 | 🟢 Online | 9.2.0 |
| 3 | Orlok | 192.168.8.120 | 🟢 Online (primary dev node) | 9.2.0 |
| 4 | Sir Dragomir | 192.168.8.130 | 🟢 Online | 9.2.0 |
| 5 | Groundbreaker | 192.168.8.200 | 🔴 Offline all session — **unverified** | unknown |
| 6 | Renfield | *(none — `ip: null` by design)* | 🔴 Never networked — **unverified** | n/a |

⚠️ **A fix only exists on a node that received the deploy.** In v9.2.0 the fleet ear-check
caught Sir Dragomir still speaking in his retired voice purely because the deploy had not
reached his Pi yet. **Always confirm the version after deploying**, do not assume:

```bash
curl -sk https://<node>:3000/health     # {"status":"OK","version":"…"}
```

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
2. **Enter the RPi's IP** — recorded in `config/animatronics.json` as a fallback. As of v8.4.1 the
   node also advertises itself over mDNS, so peers discover its live address automatically and this
   static IP is only a fallback (see [Node Discovery](../development/NODE-DISCOVERY.md)).

The installer also:
- **Sets the RPi hostname** to match the character name (lowercase, e.g., "Mina" → `mina`)
- **Registers in `animatronics.json`** — so `getHostnameCharacterId()` auto-selects the correct character on every boot
- **Creates and starts the systemd service** — `Restart=always` ensures it comes back after crashes
- **Verifies the service is responding** — checks HTTPS on port 3000 before finishing

### Deploying to the whole fleet at once

From a dev checkout, push the current code to every node in `config/animatronics.json` and light up
mDNS discovery on each:

```bash
MONSTERBOX_SSH_PASSWORD='…' XI_API_KEY='sk_…' ./scripts/deploy-all.sh --dry-run   # preview
MONSTERBOX_SSH_PASSWORD='…' XI_API_KEY='sk_…' ./scripts/deploy-all.sh             # deploy all
npm run check:discovery                                                           # confirm the fleet sees itself
```

See [Node Discovery Validation](../setup/NODE-DISCOVERY-VALIDATION.md) for the on-hardware checklist.
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

### Character IP Addresses (fallback values — mDNS supplies the live address)
```
192.168.8.150 - PumpkinHead   (Character 1)
192.168.8.140 - Mina          (Character 2, Controller)
192.168.8.120 - Orlok         (Character 3)
192.168.8.130 - Sir Dragomir  (Character 4)
192.168.8.200 - Groundbreaker (Character 5)
(none)        - Renfield      (Character 6) — ip is deliberately null until his Pi exists
```
See the status table above for who was actually reachable and on which version.

---

## Troubleshooting

### Deploy "succeeded" but the node is still running the old build

**Symptom:** `deploy-to-animatronic.sh` prints rsync errors near the end, and afterwards
`curl -sk https://<node>:3000/health` still reports the **previous** version.

**Cause:** rsync exits **23** ("partial transfer due to error") when it hits files it cannot
replace — in practice **root-owned** paths on the node: `certs/`, and a stray root-owned
`data/ai-config/` directory (a known context-fallback artifact, see
[KNOWN-BUGS](../troubleshooting/KNOWN-BUGS.md)). The script runs under `set -e`, so it aborts
**before the `systemctl restart`**. The code lands on disk and the service keeps serving the old
build — a deploy that looks like it did nothing.

This is not hypothetical: it is why Sir Dragomir kept speaking in his retired voice after the
wrong-voice fix was "deployed" to him in v9.2.0.

```bash
# On the node — remove the stray root-owned AI config dir (safe: regenerates per character)
ssh remote@<node-ip> 'sudo rm -rf /home/remote/MonsterBox/data/ai-config'

# Re-deploy, then ALWAYS confirm the version actually changed
./scripts/deploy-to-animatronic.sh <character_id> <node-ip>
curl -sk https://<node-ip>:3000/health

# If the version is still old, the restart was skipped — do it by hand
ssh remote@<node-ip> 'sudo systemctl restart monsterbox.service'
```

`certs/` is expected to be root-owned and should not be deleted — it is excluded from the fix
above on purpose. The real fix (excluding root-owned paths from the rsync set, and not letting
a non-fatal rsync status skip the restart) is **not done**.

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
curl -k https://localhost:3000/setup/parts/api/parts
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

**Last Updated:** 2026-08-16 (v9.2.0 session)
**Current Version:** See package.json (avoid hardcoding)

