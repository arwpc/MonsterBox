# Skulltalker Offline Status

**Character:** Skulltalker (Character 4)  
**IP Address:** 192.168.8.130  
**Status:** ⚠️ OFFLINE  
**Last Known Version:** Unknown  
**Date Reported:** October 30, 2025

## Current Status

Skulltalker is currently offline and not reachable on the MonsterNet network.

### Symptoms
- Not responding to ping requests
- "Destination Host Unreachable" from Coffin Breaker (192.168.8.140)
- Port 3000 not accessible
- SSH connection fails
- No web interface access

### Network Test Results
```bash
$ ping -c 2 192.168.8.130
From 192.168.8.140 icmp_seq=1 Destination Host Unreachable
From 192.168.8.140 icmp_seq=2 Destination Host Unreachable
--- 192.168.8.130 ping statistics ---
2 packets transmitted, 0 received, +2 errors, 100% packet loss
```

## Troubleshooting Steps

### 1. Physical Inspection Required
- [ ] Check power supply and power cable
- [ ] Verify Raspberry Pi 4B power LED is on
- [ ] Check network cable connection
- [ ] Verify network switch/router port has link lights
- [ ] Check SD card is properly seated

### 2. Network Connectivity
- [ ] Verify network cable is good (try different cable)
- [ ] Test network port with another device
- [ ] Check router/switch for DHCP lease to 192.168.8.130
- [ ] Verify no IP address conflicts on network

### 3. Raspberry Pi Boot Issues
If power is on but network is down:
- [ ] Check SD card health (try on another Pi if available)
- [ ] Look for boot errors via HDMI monitor
- [ ] Check system logs after recovery
- [ ] Verify SD card wasn't corrupted

### 4. Recovery Steps

#### If Accessible via HDMI/Keyboard:
```bash
# Check network status
ip addr show
sudo systemctl status networking

# Check MonsterBox service
sudo systemctl status monsterbox.service

# Check network configuration
cat /etc/network/interfaces
cat /etc/dhcpcd.conf

# Restart networking
sudo systemctl restart networking
```

#### If SD Card Needs Recovery:
1. Remove SD card and mount on another system
2. Back up `/home/remote/MonsterBox/data/character-4/` directory
3. Check filesystem integrity: `sudo fsck /dev/sdX`
4. If corrupted, restore from backup or re-flash OS
5. Restore character data after OS reinstall

## Once Back Online

After resolving connectivity issues, update to latest version:

```bash
# SSH into Skulltalker
ssh remote@192.168.8.130

# Navigate to MonsterBox directory
cd /home/remote/MonsterBox

# Stash any local changes
git stash push -m 'Auto-stash before update'

# Clean untracked files
git clean -fd

# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Restart service
sudo systemctl restart monsterbox.service

# Verify
curl http://localhost:3000/health
```

## Required Updates

Once Skulltalker is back online, it will need:
1. Update to commit f2f11caf (latest as of Oct 30, 2025)
2. MonsterBox 5.5 installation
3. Health check verification
4. Character data validation

## Contact Information

For hardware issues or if unable to resolve:
- Check with site technical lead
- Document any hardware failures
- Consider replacement Pi if SD card corruption is recurring

## Related Documentation
- [Main README](../../README.md)
- [Deployment Guide](../deployment/README.md)
- [Troubleshooting Section](../deployment/README.md#troubleshooting)

---

**Status Updates:**
- 2025-10-30: Initial offline report - network unreachable from Coffin Breaker
