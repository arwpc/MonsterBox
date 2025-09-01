# MonsterBox Port 80 Fix - Complete Solution

## Problem
MonsterBox was failing to start with the error:
```
Port 80 requires elevated privileges
```

This happened because binding to privileged ports (1-1023) normally requires root access.

## Solution Implemented

### 1. Linux Capabilities Fix
Used `setcap` to grant Node.js the `CAP_NET_BIND_SERVICE` capability, allowing it to bind to privileged ports without running as root.

**Files Created:**
- `scripts/setup-port-capabilities.sh` - One-time setup script
- `scripts/verify-port-capabilities.sh` - Verification script

**What it does:**
```bash
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node
```

This grants Node.js the specific capability to bind to privileged ports while maintaining security.

### 2. Port Configuration Updated
Updated default ports to match your requirements:
- **HTTP**: Port 80 (was 3000)
- **HTTPS**: Port 8080 (already configured)

**Files Modified:**
- `app.js` - Changed default port from 3000 to 80

## Usage

### First Time Setup
```bash
# Run once to set up capabilities
./scripts/setup-port-capabilities.sh
```

### Verify Setup
```bash
# Check if capabilities are still set
./scripts/verify-port-capabilities.sh
```

### Normal Operation
```bash
# Now works without sudo!
npm start
# or
node app.js
```

## Important Notes

1. **Node.js Updates**: If you update Node.js, you'll need to run the setup script again
2. **Security**: This is more secure than running the entire application as root
3. **Persistence**: The capability persists across reboots and system restarts
4. **Verification**: Use the verify script to check if capabilities are still set

## Ports Used
- **HTTP**: 80 (main web interface)
- **HTTPS**: 8080 (secure web interface)
- **WebSocket Services**: 8765-8780 (hardware services)
- **ElevenLabs**: 8771, 8778 (AI services)
- **SSL Proxies**: 8872, 8873 (secure WebSocket proxies)

## Troubleshooting

If you get port 80 errors again:
1. Run `./scripts/verify-port-capabilities.sh`
2. If capabilities are missing, run `./scripts/setup-port-capabilities.sh`
3. If Node.js was updated, the capabilities need to be reapplied

## Status
✅ **FIXED** - MonsterBox now starts without sudo and uses port 80 for HTTP, 8080 for HTTPS as requested.
