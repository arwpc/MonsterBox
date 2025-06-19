# MonsterBox SSH Troubleshooting Guide

## Overview

This guide helps resolve SSH authentication issues that prevent remote animatronic management in the MonsterBox character interface.

## Common SSH Issues

### 1. "Permission denied (publickey)" Error

**Symptoms:**
- Network ping tests pass
- SSH connection fails with "Permission denied (publickey)"
- Remote system buttons (Collect Logs, System Info, Reboot) don't work

**Root Causes:**
- SSH key authentication is required but keys are not properly configured
- Password authentication is disabled on the remote system
- SSH service configuration mismatch

**Solutions:**

#### Option A: Enable Password Authentication (Quick Fix)
1. SSH into the remote system manually:
   ```bash
   ssh remote@192.168.8.120
   ```

2. Edit SSH configuration:
   ```bash
   sudo nano /etc/ssh/sshd_config
   ```

3. Ensure these settings are enabled:
   ```
   PasswordAuthentication yes
   PubkeyAuthentication yes
   AuthenticationMethods publickey,password
   ```

4. Restart SSH service:
   ```bash
   sudo systemctl restart ssh
   ```

#### Option B: Set Up SSH Key Authentication (Recommended)
1. Generate SSH key pair on MonsterBox system:
   ```bash
   ssh-keygen -t rsa -b 4096 -C "monsterbox@$(hostname)"
   ```

2. Copy public key to each animatronic:
   ```bash
   ssh-copy-id remote@192.168.8.120  # Orlok
   ssh-copy-id remote@192.168.8.140  # Coffin Breaker
   ssh-copy-id remote@192.168.1.200  # PumpkinHead
   ```

3. Test key-based authentication:
   ```bash
   ssh remote@192.168.8.120 "echo 'SSH key test successful'"
   ```

### 2. Network Connectivity Issues

**Symptoms:**
- Ping tests fail
- "Host is not reachable" errors

**Solutions:**
1. Verify IP addresses in character configuration
2. Check network connectivity:
   ```bash
   ping 192.168.8.120
   ```
3. Verify animatronic systems are powered on
4. Check firewall settings on both systems

### 3. Environment Variable Issues

**Symptoms:**
- SSH commands use wrong credentials
- Inconsistent authentication behavior

**Solutions:**
1. Verify environment variables are set:
   ```bash
   env | grep SSH
   ```

2. Check .env file contains:
   ```
   ORLOK_SSH_USER="remote"
   ORLOK_SSH_PASSWORD="your_password"
   COFFIN_SSH_USER="remote"
   COFFIN_SSH_PASSWORD="your_password"
   PUMPKINHEAD_SSH_USER="remote"
   PUMPKINHEAD_SSH_PASSWORD="your_password"
   SKULLTALKER_SSH_USER="remote"
   SKULLTALKER_SSH_PASSWORD="your_password"
   ```

3. Restart MonsterBox application after changes

## Testing SSH Connections

### Manual Testing
Test each animatronic connection manually:

```bash
# Test Orlok
ssh remote@192.168.8.120 "echo 'Orlok SSH test successful'"

# Test Coffin Breaker  
ssh remote@192.168.8.140 "echo 'Coffin SSH test successful'"

# Test PumpkinHead
ssh remote@192.168.1.200 "echo 'PumpkinHead SSH test successful'"

# Test Skulltalker (local)
ssh remote@192.168.8.130 "echo 'Skulltalker SSH test successful'"
```

### Using MonsterBox Interface
1. Navigate to http://192.168.8.130:3000/characters
2. Click the "🧪 Test Connection" button for each character
3. Review the detailed test results in the modal

## Character-Specific Configuration

### Orlok (192.168.8.120)
- Uses environment variable: `ORLOK_SSH_PASSWORD`
- Character config: `password_env: "ORLOK_SSH_PASSWORD"`
- Status: Remote system, requires SSH setup

### Coffin Breaker (192.168.8.140)
- Uses environment variable: `COFFIN_SSH_PASSWORD`
- Character config: `password_env: "COFFIN_SSH_PASSWORD"`
- Status: Remote system, requires SSH setup

### PumpkinHead (192.168.1.200)
- Uses hardcoded password in character config
- Character config: `password: "klrklr89!"`
- Status: Remote system, different network segment

### Skulltalker (192.168.8.130)
- Local system, SSH should work without issues
- Used for testing SSH functionality
- Status: Should always work

## Security Considerations

### SSH Key Management
- Use separate SSH keys for each animatronic if possible
- Store private keys securely with proper permissions (600)
- Consider using SSH agent for key management

### Password Security
- Use strong, unique passwords for each system
- Store passwords in environment variables, not in code
- Consider rotating passwords regularly

### Network Security
- Use VPN or secure network segments for animatronic communication
- Consider firewall rules to restrict SSH access
- Monitor SSH access logs for security issues

## Troubleshooting Commands

### Check SSH Service Status
```bash
# On remote system
sudo systemctl status ssh
sudo journalctl -u ssh -n 20
```

### Test SSH Configuration
```bash
# Test SSH config syntax
sudo sshd -t

# Check SSH configuration
sudo cat /etc/ssh/sshd_config | grep -E "(Password|Pubkey|Authentication)"
```

### Debug SSH Connection
```bash
# Verbose SSH connection for debugging
ssh -vvv remote@192.168.8.120
```

### Check Network Connectivity
```bash
# Test network path
traceroute 192.168.8.120
nmap -p 22 192.168.8.120
```

## Quick Fix Checklist

1. ✅ Verify animatronic systems are powered on and connected
2. ✅ Test network connectivity with ping
3. ✅ Check SSH service is running on remote systems
4. ✅ Verify SSH configuration allows password authentication
5. ✅ Confirm environment variables are properly set
6. ✅ Test SSH connection manually before using interface
7. ✅ Restart MonsterBox application after configuration changes

## Getting Help

If SSH issues persist:
1. Check the character interface testing report: `docs/character-interface-testing-report.md`
2. Review SSH logs on both local and remote systems
3. Test with a minimal SSH configuration
4. Consider using SSH key authentication instead of passwords

## Related Documentation

- [Character Interface Testing Report](character-interface-testing-report.md)
- [MonsterBox Technical Overview](MonsterBox-Technical-Overview.md)
- [Hardware Integration Layer Interfaces](Hardware-Integration-Layer-Interfaces.md)
