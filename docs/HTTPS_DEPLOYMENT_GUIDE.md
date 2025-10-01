# MonsterBox HTTPS Deployment Guide

This guide provides comprehensive instructions for deploying HTTPS support across MonsterBox Raspberry Pi 4B devices using self-signed SSL certificates.

## Overview

The MonsterBox HTTPS implementation provides:
- **Dual Protocol Support**: Both HTTP and HTTPS servers running simultaneously
- **Automatic Protocol Detection**: Client-side JavaScript automatically detects and uses the appropriate protocol
- **Self-Signed Certificates**: Development-friendly SSL certificates for internal network use
- **WebSocket Security**: Both WS and WSS (WebSocket Secure) support
- **Backward Compatibility**: Existing HTTP functionality remains intact

## Supported Devices

- **Skulltalker** (192.168.8.130) - Primary ChatterPi AI system
- **Orlok** (192.168.8.120) - Animatronic control
- **Coffin** (192.168.8.140) - Animatronic control
- **Pumpkinhead** (192.168.8.200) - Animatronic control

## Port Configuration

### HTTP Services
- **Main MonsterBox App**: Port 3000 (HTTP) → Port 3443 (HTTPS)
- **Webcam Server**: Port 3000 (HTTP) → Port 3443 (HTTPS)
- **ChatterPi Chat**: Port 8080 (HTTP) → Port 8443 (HTTPS)

### WebSocket Services
- **Jaw Control**: Port 8765 (WS) → Port 8865 (WSS)
- **AI Bridge**: Port 8766 (WS) → Port 8866 (WSS)
- **Chat WebSocket**: Port 8767 (WS) → Port 8867 (WSS)
- **Video Stream**: Port 8768 (WS) → Port 8868 (WSS)
- **Audio Stream**: Port 8769 (WS) → Port 8869 (WSS)

## Quick Start

### 1. Generate SSL Certificates

```bash
cd /home/remote/MonsterBox
sudo ./scripts/ssl/generate-ssl-certificates.sh --all
```

This generates certificates for all four devices with proper hostnames and IP addresses.

### 2. Install Certificates (Local Device)

```bash
sudo ./scripts/ssl/install-ssl-certificates.sh --auto
```

This auto-detects the current device and installs the appropriate certificates.

### 3. Deploy HTTPS (Local Device)

```bash
sudo ./scripts/ssl/deploy-https.sh --auto
```

This configures and starts HTTPS services on the current device.

### 4. Restart Services

```bash
# Stop existing services
sudo pkill -f "node.*app.js"
sudo pkill -f "python3.*gpio_jaw_server.py"
sudo pkill -f "python3.*ai_websocket_bridge.py"

# Start with HTTPS support
cd /home/remote/MonsterBox
nohup node --no-deprecation app.js > app-https.log 2>&1 &
nohup python3 scripts/chatterpi/gpio_jaw_server.py --host 0.0.0.0 --port 8765 > jaw-server-https.log 2>&1 &
nohup python3 scripts/chatterpi/ai_websocket_bridge.py --host 0.0.0.0 --port 8766 > ai-bridge-https.log 2>&1 &
```

## Detailed Deployment Steps

### Certificate Generation

The certificate generation script creates self-signed certificates with:
- **10-year validity** for development use
- **Multiple Subject Alternative Names** (SANs):
  - Device hostname (e.g., `skulltalker`)
  - Local domain (e.g., `skulltalker.local`)
  - MonsterBox domain (e.g., `skulltalker.monsterbox.local`)
  - IP address (e.g., `192.168.8.130`)
  - Localhost variants

### Certificate Installation

Certificates are installed to `/etc/ssl/monsterbox/` with:
- **Private keys**: 600 permissions, owned by the service user
- **Certificates**: 644 permissions, readable by all
- **Configuration file**: JSON metadata for applications
- **Symbolic links**: Easy access via `server.key` and `server.crt`

### Service Configuration

#### Node.js Applications (app.js, webcam server)
- Automatically detect SSL certificates on startup
- Create both HTTP and HTTPS servers
- Use secure cookies when HTTPS is available
- Graceful fallback to HTTP-only mode

#### Python WebSocket Services
- SSL configuration module (`ssl_config.py`)
- Automatic WSS port mapping
- Dual WS/WSS server creation
- SSL context management

#### Client-Side JavaScript
- Protocol detection utility (`protocol-utils.js`)
- Automatic HTTPS/WSS URL generation
- Connection fallback mechanisms
- Browser compatibility handling

## Browser Security Warnings

Since we use self-signed certificates, browsers will show security warnings:

### Chrome/Edge
1. Click "Advanced"
2. Click "Proceed to [hostname] (unsafe)"

### Firefox
1. Click "Advanced"
2. Click "Accept the Risk and Continue"

### Safari
1. Click "Show Details"
2. Click "visit this website"
3. Click "Visit Website" in the popup

### Adding Certificates to Browser (Optional)

For a better user experience, you can add the certificates to your browser's trusted store:

1. Download the certificate: `https://device-ip:3443/ssl-certificate`
2. Import into browser's certificate manager
3. Mark as trusted for SSL/TLS

## Troubleshooting

### Common Issues

#### 1. Permission Denied Errors
```bash
# Fix certificate permissions
sudo chown remote:remote /etc/ssl/monsterbox/*.key
sudo chmod 600 /etc/ssl/monsterbox/*.key
```

#### 2. Port Already in Use
```bash
# Check what's using the port
sudo lsof -i :3443
sudo lsof -i :8765

# Kill conflicting processes
sudo pkill -f "process-name"
```

#### 3. SSL Certificate Not Found
```bash
# Verify certificate files exist
ls -la /etc/ssl/monsterbox/

# Regenerate if missing
sudo ./scripts/ssl/generate-ssl-certificates.sh device-name
sudo ./scripts/ssl/install-ssl-certificates.sh device-name
```

#### 4. WebSocket Connection Failures
- Check if both WS and WSS servers are running
- Verify firewall allows the ports
- Test with browser developer tools

### Log Files

Monitor these log files for troubleshooting:
- **Main App**: `app-https.log`
- **Jaw Server**: `jaw-server-https.log`
- **AI Bridge**: `ai-bridge-https.log`
- **SSL Generation**: `scripts/ssl/ssl-generation.log`
- **SSL Installation**: `scripts/ssl/ssl-installation.log`

### Testing HTTPS Endpoints

```bash
# Test HTTPS health endpoint
curl -k https://192.168.8.130:3443/health

# Test main page
curl -k https://192.168.8.130:3443/

# Test WebSocket (requires wscat)
wscat -c wss://192.168.8.130:8866 --no-check
```

## Security Considerations

### Development Use Only
- Self-signed certificates are **NOT suitable for production**
- Browsers will always show security warnings
- Certificates are not validated by a Certificate Authority

### Network Security
- Certificates are valid for the MonsterNet (192.168.8.x) network only
- SSL provides encryption but not identity verification
- Suitable for internal development and testing

### Certificate Management
- Certificates are valid for 10 years
- No automatic renewal (manual regeneration required)
- Private keys should be kept secure

## Advanced Configuration

### Custom Certificate Parameters

Edit `scripts/ssl/generate-ssl-certificates.sh` to modify:
- Certificate validity period
- Subject Alternative Names
- Key size and encryption

### Port Customization

Modify port mappings in:
- `scripts/chatterpi/ssl_config.py` - WebSocket port mappings
- SSL configuration JSON files
- Application startup scripts

### Firewall Configuration

```bash
# Allow HTTPS ports
sudo ufw allow 3443/tcp comment "MonsterBox HTTPS"
sudo ufw allow 8443/tcp comment "ChatterPi HTTPS"
sudo ufw allow 8865:8869/tcp comment "MonsterBox WSS"
```

## Maintenance

### Certificate Renewal

```bash
# Check certificate expiration
./scripts/ssl/renew-ssl-certificates.sh --status

# Renew certificates (when needed)
./scripts/ssl/renew-ssl-certificates.sh --check-all

# Force renewal
./scripts/ssl/renew-ssl-certificates.sh --force device-name
```

### Automated Renewal Setup

```bash
# Setup weekly certificate check
./scripts/ssl/renew-ssl-certificates.sh --setup-cron
```

### Health Monitoring

```bash
# Check service status
curl -k https://device-ip:3443/health

# Monitor logs
tail -f app-https.log jaw-server-https.log ai-bridge-https.log
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review log files for error messages
3. Verify certificate and service status
4. Test with curl commands for basic connectivity

## File Structure

```
MonsterBox/
├── scripts/ssl/
│   ├── generate-ssl-certificates.sh    # Certificate generation
│   ├── install-ssl-certificates.sh     # Certificate installation
│   ├── deploy-https.sh                 # HTTPS deployment
│   ├── renew-ssl-certificates.sh       # Certificate renewal
│   ├── remote-deploy-https.sh          # Remote deployment
│   ├── certificates/                   # Generated certificates
│   ├── configs/                        # OpenSSL configurations
│   └── *.log                          # Operation logs
├── scripts/chatterpi/
│   └── ssl_config.py                   # Python SSL configuration
├── public/js/
│   └── protocol-utils.js               # Client-side protocol detection
└── docs/
    └── HTTPS_DEPLOYMENT_GUIDE.md       # This guide
```
