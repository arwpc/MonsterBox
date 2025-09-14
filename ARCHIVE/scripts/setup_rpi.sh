#!/bin/bash

# Must be run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (sudo)"
    exit 1
fi

# Install required packages
apt-get update
apt-get install -y python3-gpiozero python3-pigpio pigpio

# Start pigpio daemon
systemctl enable pigpiod
systemctl start pigpiod

# Set GPU memory to 512MB
if ! grep -q "^gpu_mem=" /boot/config.txt; then
    echo "gpu_mem=512" >> /boot/config.txt
else
    sed -i 's/^gpu_mem=.*/gpu_mem=512/' /boot/config.txt
fi

# Add user to required groups
usermod -a -G gpio,video,i2c,spi $SUDO_USER

# Enable I2C and SPI if not already enabled
raspi-config nonint do_i2c 0
raspi-config nonint do_spi 0

# Set correct permissions
chown root:gpio /dev/gpiomem
chmod g+rw /dev/gpiomem
chown root:gpio /dev/spidev*
chmod g+rw /dev/spidev*
chown root:i2c /dev/i2c*
chmod g+rw /dev/i2c*

echo "Setup complete! Please reboot for all changes to take effect."
echo "After reboot, run 'sudo pigpiod' to start the pigpio daemon."
