#!/bin/bash

# Update and upgrade the system
sudo apt update && sudo apt upgrade -y

# Install Node.js and npm
curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git
sudo apt install -y git

# Clone the MonsterBox repository
git clone https://github.com/arwpc/MonsterBox.git /home/pi/monsterbox
cd /home/pi/monsterbox

# Install dependencies
npm install

# Set up systemd service for auto-start
sudo tee /etc/systemd/system/monsterbox.service > /dev/null <<EOT
[Unit]
Description=MonsterBox Application
After=network.target

[Service]
ExecStart=/usr/bin/node /home/pi/monsterbox/app.js
Restart=always
User=pi
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/home/pi/monsterbox

[Install]
WantedBy=multi-user.target
EOT

# Enable and start the service
sudo systemctl enable monsterbox
sudo systemctl start monsterbox

echo "MonsterBox installation complete!"
