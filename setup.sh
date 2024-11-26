#!/bin/bash

# Update package lists
sudo apt-get update

# Install system dependencies
sudo apt-get install -y python3-pip python3-dev
sudo apt-get install -y nodejs npm
sudo apt-get install -y python3-pigpio
sudo apt-get install -y i2c-tools

# Enable I2C and GPIO if not already enabled
if ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt; then
    echo "dtparam=i2c_arm=on" | sudo tee -a /boot/config.txt
fi
if ! grep -q "^dtparam=gpio=on" /boot/config.txt; then
    echo "dtparam=gpio=on" | sudo tee -a /boot/config.txt
fi

# Start pigpiod daemon
sudo systemctl enable pigpiod
sudo systemctl start pigpiod

# Install Python dependencies
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

# Install Node.js dependencies
npm install chai mocha --save-dev

# Add user to required groups
sudo usermod -a -G gpio,i2c,spi $USER

echo "Setup complete! Please reboot your system for all changes to take effect."
