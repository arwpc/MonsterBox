# 🎃 MonsterBox Animatronic Setup Guide

## Overview

This guide will help you set up log collection for all your animatronic RPIs. Each animatronic (Orlok, Pumpkinhead, Mina, etc.) will have its own RPI that needs to be configured for remote log collection.

## Provisioning a new node — the standard path (v9.3.0+)

1. **Image the Pi** and set the hostname to the character's hostname from `config/animatronics.json` — hostname drives character identity at boot.
2. **Register the character first if it's new**: run `/add-character` in Claude Code (updates `data/characters.json` + `config/animatronics.json`).
3. **Clone the repo and run `sudo bash install.sh`** — it now applies the FULL node baseline automatically: system deps, mjpg-streamer with the portable by-id camera launcher (640x480@15fps q60 default, override in `/etc/default/monsterbox-cam`), journald persistent+64M, logrotate for app logs, `monsterbox.service` with priority + secrets drop-ins, boot readiness check unit, git hooks (pre-push gate + every-10-commits log review), avahi advertisement file ownership, log-file ownership, and the `/etc/monsterbox/env` scaffold.
4. **Fill in secrets**: `/etc/monsterbox/env` (`MONSTERBOX_SSH_PASSWORD`, `MB_ADMIN_TOKEN`) and `/etc/monsterbox/elevenlabs.key`; restart the service.
5. **Record the node's ear-verified speaker level** as `sinkVolume` in `config/animatronics.json` (commit it).
6. **Verify**: `npm run log:review` (clean), `npm run earcheck --nodes <id>` (AUDIBLE + canonical voice), `curl -sk https://localhost:3000/health`.

> **Note:** nodes built before 2026-08-17 predate the automated baseline; `docs/troubleshooting/KNOWN-BUGS.md` and the `node-os-baseline` Claude memory describe hand-application.

## 🚀 Quick Setup (Automated)

### Option 1: PowerShell Script (Recommended for Windows)
```powershell
# Run the automated setup script
.\scripts\setup-ssh-keys.ps1
```

This script will:
- ✅ Generate SSH keys if needed
- ✅ Set up SSH access to all your animatronic RPIs
- ✅ Configure log access permissions
- ✅ Test connections
- ✅ Create animatronic configuration file

### Option 2: Web Interface Management
Access animatronic management through the MonsterBox web interface:
1. Navigate to **Characters** in the main menu
2. Select a character with animatronic features enabled
3. Click **Edit** to access animatronic management options

## 🔧 Manual Setup (Step by Step)

### Step 1: Find Your RPI IP Addresses

**On each RPI, run:**
```bash
hostname -I
```

**Or check your router's admin panel for:**
- Device names like "raspberrypi", "orlok", "pumpkinhead", "mina"
- MAC addresses starting with common RPI prefixes

### Step 2: Set Up SSH Keys

**Generate SSH key (if you don't have one):**
```bash
ssh-keygen -t rsa -b 4096 -C "monsterbox@$(hostname)"
```

**Copy keys to each animatronic:**
```bash
# For Orlok
ssh-copy-id pi@192.168.1.100

# For Pumpkinhead  
ssh-copy-id pi@192.168.1.101

# For Mina
ssh-copy-id pi@192.168.1.102
```

### Step 3: Configure Log Access

**On each RPI, set up sudo access for log collection:**
```bash
# SSH into each RPI
ssh pi@192.168.1.100

# Add log access permissions
echo 'pi ALL=(ALL) NOPASSWD: /bin/journalctl' | sudo tee -a /etc/sudoers.d/monsterbox-logs

# Test log access
sudo journalctl -n 5 --no-pager
```

### Step 4: Add Animatronics to MonsterBox

Add animatronics through the web interface:
1. Navigate to **Characters** > **Add New Character**
2. Enable **Animatronic Features** in the character form
3. Configure RPI4b settings (IP address, SSH credentials, etc.)
4. Save the character configuration

## 📋 Default Animatronic Configuration

### Orlok (Count Orlok)
- **IP**: 192.168.1.100
- **Character**: Vampire with moving arms and glowing eyes
- **Parts**: Right Arm of Satan, Left Arm of Manipulation, Hand of Azura, Eye of Orlok
- **Services**: monsterbox, ssh, gpio-control, servo-control

### Pumpkinhead
- **IP**: 192.168.1.101  
- **Character**: Pumpkin-headed demon with articulated limbs
- **Services**: monsterbox, ssh, gpio-control, led-control

### Mina
- **IP**: 192.168.1.102
- **Character**: Mina with opening lid and emerging figure
- **Services**: monsterbox, ssh, linear-actuator, sound

## 🧪 Testing Your Setup

### Test Individual Animatronic
Test specific animatronic connection via web interface:
1. Navigate to **Characters** > **[Character Name]** > **Edit**
2. Click **🧪 Test Connection** button
3. Review the connection test results in the modal dialog

### Test All Animatronics
```bash
# View all animatronic status
npm run animatronic:view

# Test complete MCP setup
npm run test:mcp
```

### Collect Logs from All
```bash
# Collect logs from all configured animatronics
npm run collect:rpi-logs
```

## 📊 Management Commands

### View All Animatronics
Navigate to **Characters** in the web interface to view all configured animatronics with their status indicators.

### Add New Animatronic
1. Navigate to **Characters** > **Add New Character**
2. Enable **Animatronic Features** checkbox
3. Configure RPI4b settings and SSH credentials
4. Save the character

### Configure Existing Animatronic
1. Navigate to **Characters** > **[Character Name]** > **Edit**
2. Modify animatronic settings in the **Animatronic Configuration** section
3. Use management buttons for testing, log collection, and system operations

## 🔧 Troubleshooting

### SSH Connection Failed
```bash
# Check if RPI is reachable
ping 192.168.1.100

# Check SSH service on RPI
ssh pi@192.168.1.100
sudo systemctl status ssh
sudo systemctl enable ssh
sudo systemctl start ssh
```

### Log Access Denied
```bash
# On the RPI, check sudo configuration
sudo visudo -c
sudo cat /etc/sudoers.d/monsterbox-logs

# Re-add permissions if needed
echo 'pi ALL=(ALL) NOPASSWD: /bin/journalctl' | sudo tee -a /etc/sudoers.d/monsterbox-logs
```

### IP Address Changed
Update animatronic IP address via web interface:
1. Navigate to **Characters** > **[Character Name]** > **Edit**
2. Update the **IP Address** field in the **RPI4b Configuration** section
3. Click **🔍 Test SSH Connection** to verify the new IP address
4. Save the character configuration

## 📁 Configuration Files

### Animatronic Configuration
- **Location**: `data/animatronics.json`
- **Contains**: All animatronic definitions, IPs, services, parts

### Log Storage
- **Location**: `log/rpi-logs-YYYY-MM-DD.log`
- **Format**: JSON entries with timestamp and animatronic data

## 🎯 Adding New Animatronics

When you add a new animatronic:

1. **Set up the RPI** with Raspberry Pi OS
2. **Configure network** and note the IP address
3. **Enable SSH** on the RPI
4. **Add via web interface**:
   - Navigate to **Characters** > **Add New Character**
   - Enable **Animatronic Features**
   - Configure RPI4b settings with the new IP address
   - Save the character configuration
5. **Test the connection**:
   - Navigate to **Characters** > **[Character Name]** > **Edit**
   - Click **🧪 Test Connection** button
   - Verify all tests pass (ping, SSH, log collection)

## 🌐 Web Interface

Access your animatronic logs through:
- **Main Logs**: `http://localhost:3000/logs`
- **Health Status**: `http://localhost:3000/health`
- **Real-time Stream**: `http://localhost:3000/logs/stream`

## 🎃 Complete MCP Status

After setup, your MonsterBox will have:
- ✅ **Browser Log Collection** - Client-side error tracking
- ✅ **GitHub Log Collection** - Repository activity monitoring  
- ✅ **Animatronic Log Collection** - RPI system monitoring
- ✅ **Application Log Collection** - MonsterBox internal logs
- ✅ **Health Monitoring** - System status endpoints
- ✅ **Real-time Streaming** - Live log monitoring

## 🚀 Next Steps

1. **Run the automated setup**: `.\scripts\setup-ssh-keys.ps1`
2. **Test your setup**: `npm run test:mcp`
3. **View your animatronics**: `npm run animatronic:view`
4. **Collect logs**: `npm run collect:rpi-logs`
5. **Monitor in real-time**: Visit `http://localhost:3000/logs`

Your MonsterBox MCP log collection system will be fully operational and ready to monitor all your Halloween animatronics! 🎃👻🤖
