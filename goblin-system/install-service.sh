#!/bin/bash

# MonsterBox Goblin Service Installer
# Installs systemd service and sets up log rotation

echo "🎃 MonsterBox Goblin Service Installer"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Create log file with proper permissions
echo "📝 Creating log file..."
touch /var/log/goblin.log
chown remote:remote /var/log/goblin.log
chmod 644 /var/log/goblin.log

# Set up log rotation
echo "🔄 Setting up log rotation..."
cat > /etc/logrotate.d/goblin << 'EOF'
/var/log/goblin.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 remote remote
}
EOF

# Copy service file
echo "📋 Installing systemd service..."
cp goblin.service /etc/systemd/system/goblin.service
chmod 644 /etc/systemd/system/goblin.service

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

# Enable service to start on boot
echo "✅ Enabling service to start on boot..."
systemctl enable goblin.service

# Start the service
echo "🚀 Starting Goblin service..."
systemctl start goblin.service

# Show status
echo ""
echo "✅ Installation complete!"
echo ""
echo "Service status:"
systemctl status goblin.service --no-pager -l

echo ""
echo "📋 Useful commands:"
echo "  sudo systemctl status goblin   - Check service status"
echo "  sudo systemctl restart goblin  - Restart service"
echo "  sudo systemctl stop goblin     - Stop service"
echo "  sudo journalctl -u goblin -f   - View live logs"
echo "  tail -f /var/log/goblin.log    - View log file"
echo ""
echo "🎃 Goblin is now running and will auto-start on boot!"

