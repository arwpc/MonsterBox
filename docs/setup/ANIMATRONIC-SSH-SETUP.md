# 🎃 MonsterBox Animatronic SSH Setup Guide

## Overview

This guide covers the secure SSH configuration for all MonsterBox animatronic RPIs using individual credential management through environment variables. Each animatronic can have its own distinct SSH credentials for enhanced security and scalability.

## 🎯 SSH Usage Scope

The SSH access configured in this guide is specifically for:
- **MCP (Model Context Protocol) log collection and monitoring**
- **Development work using Augment AI assistant in VS Code**
- **NOT for runtime MonsterBox application functionality** (the main show operations don't require SSH)

## 🔐 Security Features

- **Individual Credentials**: Each animatronic has its own SSH credentials for enhanced security
- **Scalable Design**: Easy to add new animatronics with unique credentials
- **Environment Variables**: No hardcoded credentials in source code
- **Git Security**: `.env` file excluded from version control
- **Fallback Support**: Legacy shared credentials for backward compatibility

## 📋 Prerequisites

- All animatronic RPIs are connected to the network
- SSH is enabled on each RPI
- You have physical access to each RPI for initial setup

## 🚀 Quick Setup

### Step 1: Configure Environment Variables

The SSH credentials are configured with individual credentials per animatronic in your `.env` file:

```bash
# Individual Animatronic SSH Configuration
# Used for MCP log collection and development work with Augment AI assistant
# NOT used for runtime MonsterBox application functionality

ORLOK_SSH_USER="remote"
ORLOK_SSH_PASSWORD="klrklr89!"

PUMPKINHEAD_SSH_USER="remote"
PUMPKINHEAD_SSH_PASSWORD="klrklr89!"

COFFIN_SSH_USER="remote"
COFFIN_SSH_PASSWORD="klrklr89!"

# Legacy fallback credentials (for backward compatibility)
RPI_SSH_USER="remote"
RPI_SSH_PASSWORD="klrklr89!"
```

### Step 2: Test Current Configuration

Run the comprehensive SSH connectivity test:

```bash
npm run test:animatronic-ssh
```

This will test all three animatronics:
- **Orlok** (192.168.8.120)
- **Pumpkinhead** (192.168.1.101) - Currently not running
- **Coffin** (192.168.8.149)

### Step 3: Setup Each Animatronic RPI

For each RPI that fails the connectivity test, follow these steps:

#### On Each RPI (via keyboard/monitor or existing SSH):

1. **Create the remote user:**
   ```bash
   sudo useradd -m -s /bin/bash remote
   sudo passwd remote
   # Enter password: klrklr89!
   ```

2. **Add user to sudo group:**
   ```bash
   sudo usermod -aG sudo remote
   ```

3. **Enable SSH service:**
   ```bash
   sudo systemctl enable ssh
   sudo systemctl start ssh
   ```

4. **Configure log access permissions:**
   ```bash
   echo 'remote ALL=(ALL) NOPASSWD: /bin/journalctl' | sudo tee -a /etc/sudoers.d/monsterbox-logs
   sudo chmod 440 /etc/sudoers.d/monsterbox-logs
   ```

#### From Your Development Machine:

5. **Setup SSH key authentication:**
   ```bash
   # Generate SSH key if you don't have one
   ssh-keygen -t rsa -b 4096 -C "monsterbox@$(hostname)"
   
   # Copy SSH key to each animatronic
   ssh-copy-id remote@192.168.8.120  # Orlok
   ssh-copy-id remote@192.168.1.101  # Pumpkinhead (not currently running)
   ssh-copy-id remote@192.168.8.149  # Coffin
   ```

6. **Test SSH connections:**
   ```bash
   ssh remote@192.168.8.120 "echo 'Orlok SSH test successful'"
   ssh remote@192.168.1.101 "echo 'Pumpkinhead SSH test successful'"
   ssh remote@192.168.8.149 "echo 'Coffin SSH test successful'"
   ```

## 🧪 Testing and Validation

### Comprehensive Test Suite

Run the full MCP test suite including SSH connectivity:

```bash
npm run test:mcp
```

### Animatronic-Specific SSH Tests

Test only SSH connectivity for all animatronics:

```bash
npm run test:animatronic-ssh
```

### Individual Animatronic Management

Use the interactive animatronic manager:

```bash
npm run animatronic:manage
```

Available options:
- ➕ Add New Animatronic
- 🔧 Configure Existing Animatronic
- 📊 View All Animatronics
- 🧪 Test Animatronic Connection
- 📋 Collect Logs from All
- 🔑 Setup SSH Keys for All
- ❌ Remove Animatronic

## 📊 Log Collection

### Manual Log Collection

Collect logs from a specific animatronic:

```bash
# Via web API
curl "http://localhost:3000/logs/rpi/192.168.8.120?lines=50"  # Orlok
curl "http://localhost:3000/logs/rpi/192.168.8.149?lines=50"  # Coffin

# Via animatronic manager
npm run animatronic:manage
# Choose "Collect Logs from All"
```

### Automated Log Collection

The MCP log collector server automatically uses the environment variables:

```javascript
// Example MCP tool call
{
  "name": "collect_rpi_console_logs",
  "arguments": {
    "host": "192.168.8.120",
    "lines": 100
  }
}
```

## 🔧 Troubleshooting

### Common Issues

1. **"Connection refused" errors:**
   - Ensure SSH service is running: `sudo systemctl status ssh`
   - Check firewall settings: `sudo ufw status`

2. **"Permission denied" errors:**
   - Verify user exists: `id remote`
   - Check SSH key setup: `ssh-copy-id remote@IP_ADDRESS`

3. **"sudo: journalctl: command not found":**
   - Install systemd: `sudo apt update && sudo apt install systemd`

4. **Log collection fails:**
   - Verify sudo permissions: `sudo visudo -f /etc/sudoers.d/monsterbox-logs`
   - Test manually: `ssh remote@IP "sudo journalctl -n 5"`

### Diagnostic Commands

```bash
# Test network connectivity
ping -c 1 192.168.8.120  # Orlok
ping -c 1 192.168.8.149  # Coffin

# Test SSH without keys (will prompt for password)
ssh -o PreferredAuthentications=password remote@192.168.8.120  # Orlok
ssh -o PreferredAuthentications=password remote@192.168.8.149  # Coffin

# Test SSH with keys
ssh -o BatchMode=yes remote@192.168.8.120 "echo 'SSH key test'"  # Orlok
ssh -o BatchMode=yes remote@192.168.8.149 "echo 'SSH key test'"  # Coffin

# Test log access
ssh remote@192.168.8.120 "sudo journalctl -n 5 --no-pager"  # Orlok
ssh remote@192.168.8.149 "sudo journalctl -n 5 --no-pager"  # Coffin
```

## 🔒 Security Best Practices

### Environment Variable Security

- ✅ `.env` file is in `.gitignore`
- ✅ Credentials are not hardcoded in source files
- ✅ Environment variables are loaded at runtime
- ✅ Default fallback values provided for development

### SSH Security

- ✅ SSH key authentication preferred over passwords
- ✅ Limited sudo access (only journalctl command)
- ✅ Dedicated user account (not root or pi)
- ✅ Connection timeouts configured

### Network Security

- 🔧 Consider changing default SSH port (22)
- 🔧 Implement fail2ban for brute force protection
- 🔧 Use VPN for remote access
- 🔧 Regular security updates on all RPIs

## 📁 File Structure

```
MonsterBox/
├── .env                           # SSH credentials (secure)
├── .env.example                   # Template with placeholders
├── data/
│   └── animatronics.json         # Animatronic configurations
├── scripts/
│   ├── test-animatronic-ssh.js   # SSH connectivity tests
│   ├── test-mcp-setup.js         # Comprehensive MCP tests
│   ├── animatronic-manager.js    # Interactive management
│   └── setup-ssh-keys.ps1        # PowerShell setup script
└── mcp-servers/
    └── log-collector-server.js   # MCP log collection server
```

## 🎯 Next Steps

After completing the SSH setup:

1. **Run comprehensive tests:**
   ```bash
   npm run test:mcp
   ```

2. **Start log collection:**
   ```bash
   npm run collect:rpi-logs
   ```

3. **Monitor animatronic status:**
   ```bash
   npm run animatronic:view
   ```

4. **Set up automated monitoring** (optional)
5. **Configure alerting for connection failures** (optional)

## 📞 Support

If you encounter issues:

1. Check the test output: `npm run test:animatronic-ssh`
2. Review the logs in `log/` directory
3. Use the interactive manager: `npm run animatronic:manage`
4. Verify environment variables are loaded correctly

The SSH setup provides a secure, scalable foundation for managing all current and future animatronic RPIs in the MonsterBox system.
