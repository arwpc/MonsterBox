# 🎃 MonsterBox Animatronic Setup Guide

## Overview

This guide will help you set up log collection for all your animatronic RPIs. Each animatronic (Orlok, Pumpkinhead, Coffin, etc.) will have its own RPI that needs to be configured for remote log collection.

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

### Option 2: Interactive Manager
```bash
# Use the interactive animatronic manager
npm run animatronic:manage
```

## 🔧 Manual Setup (Step by Step)

### Step 1: Find Your RPI IP Addresses

**On each RPI, run:**
```bash
hostname -I
```

**Or check your router's admin panel for:**
- Device names like "raspberrypi", "orlok", "pumpkinhead", "coffin"
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

# For Coffin
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

```bash
# Add each animatronic interactively
npm run animatronic:manage
```

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

### Coffin
- **IP**: 192.168.1.102
- **Character**: Coffin with opening lid and emerging figure
- **Services**: monsterbox, ssh, linear-actuator, sound

## 🧪 Testing Your Setup

### Test Individual Animatronic
```bash
# Test specific animatronic connection
npm run animatronic:manage
# Choose "Test Animatronic Connection"
```

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
```bash
npm run animatronic:view
```

### Add New Animatronic
```bash
npm run animatronic:manage
# Choose "Add New Animatronic"
```

### Configure Existing Animatronic
```bash
npm run animatronic:manage
# Choose "Configure Existing Animatronic"
```

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
```bash
# Update animatronic IP address
npm run animatronic:manage
# Choose "Configure Existing Animatronic"
```

## 📁 Configuration Files

### Animatronic Configuration
- **Location**: `config/animatronics.json`
- **Contains**: All animatronic definitions, IPs, services, parts

### Log Storage
- **Location**: `log/rpi-logs-YYYY-MM-DD.log`
- **Format**: JSON entries with timestamp and animatronic data

## 🎯 Adding New Animatronics

When you add a new animatronic:

1. **Set up the RPI** with Raspberry Pi OS
2. **Configure network** and note the IP address
3. **Enable SSH** on the RPI
4. **Run the setup**:
   ```bash
   npm run animatronic:manage
   # Choose "Add New Animatronic"
   ```
5. **Test the connection**:
   ```bash
   npm run animatronic:manage
   # Choose "Test Animatronic Connection"
   ```

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
