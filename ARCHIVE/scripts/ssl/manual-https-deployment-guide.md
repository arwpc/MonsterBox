# MonsterBox HTTPS Manual Deployment Guide

## Overview
This guide provides step-by-step instructions for manually deploying HTTPS to each MonsterBox device when automated SSH deployment fails.

## Prerequisites
- Skulltalker device is working (✅ confirmed)
- SSL certificates generated for all devices
- Physical or SSH access to each device

## Device Information
- **Skulltalker**: 192.168.8.130 (✅ HTTPS Working)
- **Orlok**: 192.168.8.120 (⏳ Needs deployment)
- **Coffin**: 192.168.8.140 (⏳ Needs deployment)  
- **Pumpkinhead**: 192.168.8.200 (⏳ Needs deployment)

## Deployment Steps for Each Device

### Step 1: Copy SSL Certificates

For each device, copy the certificates from Skulltalker:

```bash
# From Skulltalker, copy certificates to each device
scp /home/remote/MonsterBox/scripts/ssl/certificates/orlok.* remote@192.168.8.120:/tmp/
scp /home/remote/MonsterBox/scripts/ssl/certificates/coffin.* remote@192.168.8.140:/tmp/
scp /home/remote/MonsterBox/scripts/ssl/certificates/pumpkinhead.* remote@192.168.8.200:/tmp/
```

### Step 2: Install Certificates on Each Device

SSH into each device and run:

```bash
# Create SSL directory
sudo mkdir -p /etc/ssl/monsterbox/

# Copy certificates (replace DEVICE_NAME with actual device name)
sudo cp /tmp/DEVICE_NAME.crt /etc/ssl/monsterbox/
sudo cp /tmp/DEVICE_NAME.key /etc/ssl/monsterbox/

# Set proper permissions
sudo chown root:root /etc/ssl/monsterbox/DEVICE_NAME.crt
sudo chmod 644 /etc/ssl/monsterbox/DEVICE_NAME.crt
sudo chown remote:remote /etc/ssl/monsterbox/DEVICE_NAME.key
sudo chmod 600 /etc/ssl/monsterbox/DEVICE_NAME.key

# Create symlinks
sudo ln -sf /etc/ssl/monsterbox/DEVICE_NAME.crt /etc/ssl/monsterbox/server.crt
sudo ln -sf /etc/ssl/monsterbox/DEVICE_NAME.key /etc/ssl/monsterbox/server.key

# Create SSL config
sudo tee /etc/ssl/monsterbox/ssl-config.json > /dev/null << EOF
{
  "device": "DEVICE_NAME",
  "certificates": {
    "key": "/etc/ssl/monsterbox/DEVICE_NAME.key",
    "cert": "/etc/ssl/monsterbox/DEVICE_NAME.crt",
    "keySymlink": "/etc/ssl/monsterbox/server.key",
    "certSymlink": "/etc/ssl/monsterbox/server.crt"
  },
  "https": {
    "enabled": true,
    "port": 8080,
    "redirectHttp": true
  },
  "websocket": {
    "secure": true,
    "port": 8765
  },
  "installation": {
    "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "1.0.0"
  }
}
EOF

# Clean up temp files
rm -f /tmp/DEVICE_NAME.*
```

### Step 3: Update MonsterBox Code

On each device:

```bash
cd /home/remote/MonsterBox
git pull
npm install --no-optional
```

### Step 4: Start MonsterBox with HTTPS

On each device, stop any existing processes and start with HTTPS:

```bash
# Stop existing processes
sudo pkill -f "node.*app.js" || true

# Start with HTTPS enabled
sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js
```

### Step 5: Test Each Device

Test HTTP and HTTPS endpoints:

```bash
# Test HTTP
curl -s http://DEVICE_IP:80/health

# Test HTTPS  
curl -k -s https://DEVICE_IP:8080/health
```

## Quick Deployment Commands

### For Orlok (192.168.8.120):
```bash
# On Skulltalker
scp /home/remote/MonsterBox/scripts/ssl/certificates/orlok.* remote@192.168.8.120:/tmp/

# On Orlok
sudo mkdir -p /etc/ssl/monsterbox/
sudo cp /tmp/orlok.crt /etc/ssl/monsterbox/
sudo cp /tmp/orlok.key /etc/ssl/monsterbox/
sudo chown root:root /etc/ssl/monsterbox/orlok.crt
sudo chmod 644 /etc/ssl/monsterbox/orlok.crt
sudo chown remote:remote /etc/ssl/monsterbox/orlok.key
sudo chmod 600 /etc/ssl/monsterbox/orlok.key
sudo ln -sf /etc/ssl/monsterbox/orlok.crt /etc/ssl/monsterbox/server.crt
sudo ln -sf /etc/ssl/monsterbox/orlok.key /etc/ssl/monsterbox/server.key
cd /home/remote/MonsterBox && git pull && npm install --no-optional
sudo pkill -f "node.*app.js" || true
sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js &
```

### For Coffin (192.168.8.140):
```bash
# On Skulltalker  
scp /home/remote/MonsterBox/scripts/ssl/certificates/coffin.* remote@192.168.8.140:/tmp/

# On Coffin
sudo mkdir -p /etc/ssl/monsterbox/
sudo cp /tmp/coffin.crt /etc/ssl/monsterbox/
sudo cp /tmp/coffin.key /etc/ssl/monsterbox/
sudo chown root:root /etc/ssl/monsterbox/coffin.crt
sudo chmod 644 /etc/ssl/monsterbox/coffin.crt
sudo chown remote:remote /etc/ssl/monsterbox/coffin.key
sudo chmod 600 /etc/ssl/monsterbox/coffin.key
sudo ln -sf /etc/ssl/monsterbox/coffin.crt /etc/ssl/monsterbox/server.crt
sudo ln -sf /etc/ssl/monsterbox/coffin.key /etc/ssl/monsterbox/server.key
cd /home/remote/MonsterBox && git pull && npm install --no-optional
sudo pkill -f "node.*app.js" || true
sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js &
```

### For Pumpkinhead (192.168.8.200):
```bash
# On Skulltalker
scp /home/remote/MonsterBox/scripts/ssl/certificates/pumpkinhead.* remote@192.168.8.200:/tmp/

# On Pumpkinhead
sudo mkdir -p /etc/ssl/monsterbox/
sudo cp /tmp/pumpkinhead.crt /etc/ssl/monsterbox/
sudo cp /tmp/pumpkinhead.key /etc/ssl/monsterbox/
sudo chown root:root /etc/ssl/monsterbox/pumpkinhead.crt
sudo chmod 644 /etc/ssl/monsterbox/pumpkinhead.crt
sudo chown remote:remote /etc/ssl/monsterbox/pumpkinhead.key
sudo chmod 600 /etc/ssl/monsterbox/pumpkinhead.key
sudo ln -sf /etc/ssl/monsterbox/pumpkinhead.crt /etc/ssl/monsterbox/server.crt
sudo ln -sf /etc/ssl/monsterbox/pumpkinhead.key /etc/ssl/monsterbox/server.key
cd /home/remote/MonsterBox && git pull && npm install --no-optional
sudo pkill -f "node.*app.js" || true
sudo PORT=80 HTTPS_PORT=8080 SSL_ENABLED=true node --no-deprecation app.js &
```

## Final Testing

After deploying to all devices, run the comprehensive test:

```bash
./scripts/ssl/test-https-deployment.sh --test-all
```

## Troubleshooting

- If SSH fails, use physical access or check SSH key configuration
- If npm install fails with permissions, run: `sudo chown -R remote:remote node_modules package-lock.json`
- If Python errors occur, they can be ignored for basic HTTPS functionality
- If services don't start, check logs: `journalctl -f`
