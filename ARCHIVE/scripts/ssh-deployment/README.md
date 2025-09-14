# MonsterBox SSH Deployment System

## Overview

This SSH deployment system provides secure, standardized SSH configuration for MonsterBox Raspberry Pi 4B devices. It eliminates PowerShell dependencies and creates a consistent remote development environment across multiple devices.

## Features

- **Secure SSH Configuration**: Key-based authentication only, no password authentication
- **Multi-Device Deployment**: Consistent configuration across multiple Raspberry Pi 4B devices
- **Role-Based Access**: Separate keys for development and deployment with different permissions
- **Zero PowerShell Dependency**: Pure bash/shell implementation
- **Automated Setup**: Scripts handle all configuration automatically
- **Security Hardening**: Following SSH security best practices

## Quick Start

### 1. Generate SSH Keys and Configuration

```bash
cd scripts/ssh-deployment
chmod +x setup-ssh-keys.sh
./setup-ssh-keys.sh
```

This creates:
- SSH key pairs for development and deployment
- Configuration templates
- Deployment package

### 2. Deploy to Raspberry Pi 4B

Copy the deployment package to your target Pi and extract it:

```bash
# On target Pi
tar -xzf monsterbox-ssh-deployment-*.tar.gz
cd monsterbox-ssh-deployment-*/
sudo ./deploy-ssh-config.sh
./configs/install-on-target.sh
```

### 3. Configure Client Machine

```bash
# Copy private keys
cp keys/monsterbox-dev ~/.ssh/
cp keys/monsterbox-deploy ~/.ssh/
chmod 600 ~/.ssh/monsterbox-*

# Add SSH configuration
cat configs/ssh_config_template >> ~/.ssh/config
# Edit ~/.ssh/config and replace REPLACE_WITH_PI_IP with actual IP
```

### 4. Connect

```bash
# Development access (full permissions)
ssh monsterbox-dev

# Deployment access (restricted commands)
ssh monsterbox-deploy
```

## File Structure

```
scripts/ssh-deployment/
├── deploy-ssh-config.sh          # Main deployment script for Pi
├── setup-ssh-keys.sh             # Key generation and setup script
├── README.md                     # This documentation
├── keys/                         # Generated SSH keys
│   ├── monsterbox-dev            # Development private key
│   ├── monsterbox-dev.pub        # Development public key
│   ├── monsterbox-deploy         # Deployment private key
│   └── monsterbox-deploy.pub     # Deployment public key
└── configs/                      # Configuration templates
    ├── ssh_config_template       # Client SSH configuration
    ├── authorized_keys_template  # Server authorized keys
    ├── monsterbox-deploy-wrapper.sh  # Deployment command wrapper
    └── install-on-target.sh      # Target Pi installation script
```

## Security Features

### SSH Server Configuration

- **Port**: 22 (standard, can be customized)
- **Authentication**: Public key only, passwords disabled
- **Root Login**: Disabled
- **User Restrictions**: Only 'remote' user allowed
- **Connection Limits**: Max 3 auth tries, 10 sessions
- **Timeouts**: 2-minute login grace time, 5-minute client alive interval

### Key-Based Access Control

#### Development Key (`monsterbox-dev`)
- Full SSH access for development work
- Can run any command
- Used for VS Code Remote SSH, debugging, etc.

#### Deployment Key (`monsterbox-deploy`)
- Restricted to specific deployment commands
- Commands executed through wrapper script
- All activities logged
- No interactive shell access

### Allowed Deployment Commands

- `git pull`, `git fetch`, `git status`
- `npm install`, `npm run build`
- `systemctl restart monsterbox`, `systemctl status monsterbox`
- `docker-compose up -d`, `docker-compose down`, `docker-compose restart`

## Multi-Device Deployment

### Deploying to Multiple Raspberry Pi 4B Devices

1. **Generate keys once** on your development machine
2. **Create device-specific configurations**:

```bash
# For each device, create specific SSH config entry
Host monsterbox-pi1
    HostName 192.168.1.101
    User remote
    IdentityFile ~/.ssh/monsterbox-dev

Host monsterbox-pi2
    HostName 192.168.1.102
    User remote
    IdentityFile ~/.ssh/monsterbox-dev
```

3. **Deploy to each device** using the same deployment package
4. **Use device-specific hostnames** for connections

### Batch Deployment Script

```bash
#!/bin/bash
# Deploy to multiple devices

DEVICES=("192.168.1.101" "192.168.1.102" "192.168.1.103")
PACKAGE="monsterbox-ssh-deployment-*.tar.gz"

for device in "${DEVICES[@]}"; do
    echo "Deploying to $device..."
    scp "$PACKAGE" "pi@$device:/tmp/"
    ssh "pi@$device" "cd /tmp && tar -xzf $PACKAGE && cd monsterbox-ssh-deployment-*/ && sudo ./deploy-ssh-config.sh && ./configs/install-on-target.sh"
done
```

## VS Code Remote SSH Integration

### Setup

1. Install "Remote - SSH" extension in VS Code
2. Add SSH configuration to `~/.ssh/config`
3. Connect using Command Palette: "Remote-SSH: Connect to Host"

### Configuration

```
Host monsterbox-dev
    HostName YOUR_PI_IP
    User remote
    IdentityFile ~/.ssh/monsterbox-dev
    RemoteCommand cd /home/remote/MonsterBox
```

### Features

- Full IntelliSense and debugging support
- Integrated terminal with bash (no PowerShell)
- File synchronization
- Extension installation on remote host

## Troubleshooting

### Connection Issues

```bash
# Test SSH connection
ssh -v monsterbox-dev

# Check SSH service on Pi
sudo systemctl status ssh

# View SSH logs
sudo journalctl -u ssh -f
```

### Key Permission Issues

```bash
# Fix key permissions
chmod 600 ~/.ssh/monsterbox-*
chmod 700 ~/.ssh
```

### Deployment Command Restrictions

```bash
# View allowed commands
ssh monsterbox-deploy
# Will show list of allowed commands

# Check deployment logs on Pi
sudo tail -f /var/log/monsterbox-deployment.log
```

## Customization

### Adding New Deployment Commands

Edit `configs/monsterbox-deploy-wrapper.sh` and add to `ALLOWED_COMMANDS` array:

```bash
ALLOWED_COMMANDS=(
    "git pull"
    "npm install"
    "your-custom-command"
)
```

### Changing SSH Port

Set environment variable before deployment:

```bash
SSH_PORT=2222 sudo ./deploy-ssh-config.sh
```

### Adding New Users

Edit the SSH configuration and add to `AllowUsers`:

```
AllowUsers remote newuser
```

## Security Best Practices

1. **Key Management**:
   - Keep private keys secure
   - Use different keys for different environments
   - Rotate keys regularly

2. **Network Security**:
   - Use VPN for remote access when possible
   - Consider changing default SSH port
   - Monitor SSH logs regularly

3. **Access Control**:
   - Use deployment key for automated processes
   - Limit development key usage to trusted developers
   - Regularly audit authorized_keys

4. **Monitoring**:
   - Monitor SSH connection logs
   - Set up alerts for failed authentication attempts
   - Review deployment command logs

## Integration with MonsterBox

This SSH system integrates seamlessly with MonsterBox development workflow:

- **Hardware Services**: SSH access to WebSocket services on ports 8765-8780
- **Character Management**: Remote access to character configuration files
- **AI Integration**: Secure access to AI service configurations
- **Deployment**: Automated deployment of MonsterBox updates

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review SSH logs: `sudo journalctl -u ssh`
3. Verify key permissions and configuration
4. Test with verbose SSH: `ssh -v hostname`

## License

This SSH deployment system is part of the MonsterBox project and follows the same licensing terms.
