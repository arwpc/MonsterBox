#!/bin/bash

# MonsterBox 4.0 Application Setup Script
# Run after system installation and reboot
# Run with: bash setup-monsterbox.sh

set -e  # Exit on any error

# Color output functions
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

print_warning() {
    echo -e "\e[1;33m>>> Warning: $1\e[0m"
}

# Get current user and directory
CURRENT_USER=$(whoami)
CURRENT_DIR=$(pwd)

print_status "Setting up MonsterBox 4.0 application for user: $CURRENT_USER"
print_status "Working directory: $CURRENT_DIR"

# Check if we're in a MonsterBox directory
if [ ! -f "package.json" ] || [ ! -f "server.js" ]; then
    print_error "This doesn't appear to be a MonsterBox directory"
    print_error "Please navigate to your MonsterBox directory and run this script again"
    exit 1
fi

# 1. Install Node.js Dependencies
print_status "Installing Node.js dependencies..."
npm install

if [ $? -eq 0 ]; then
    print_success "Node.js dependencies installed successfully"
else
    print_error "Failed to install Node.js dependencies"
    exit 1
fi

# 2. Install Python Dependencies
print_status "Installing Python dependencies..."

# Install from requirements.txt if it exists
if [ -f "utils/requirements.txt" ]; then
    python3 -m pip install --user -r utils/requirements.txt
    print_success "Python dependencies installed from requirements.txt"
else
    # Install essential Python packages manually
    print_status "Installing essential Python packages..."
    python3 -m pip install --user \
        websockets \
        pyaudio \
        opencv-python \
        pyserial \
        adafruit-circuitpython-motor \
        adafruit-circuitpython-servo
    print_success "Essential Python packages installed"
fi

# 3. Set Up Python Wrapper Permissions
print_status "Setting up Python wrapper permissions..."
chmod +x python_wrappers/*.py
print_success "Python wrapper permissions set"

# 4. Test Hardware Interfaces
print_status "Testing hardware interfaces..."

# Test I2C
if command -v i2cdetect >/dev/null 2>&1; then
    print_status "Testing I2C interface..."
    i2cdetect -y 1 > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        print_success "I2C interface working"
    else
        print_warning "I2C interface may not be working properly"
    fi
else
    print_warning "i2cdetect not available - install i2c-tools"
fi

# Test GPIO access
print_status "Testing GPIO access..."
if [ -c "/dev/gpiomem" ]; then
    if [ -r "/dev/gpiomem" ] && [ -w "/dev/gpiomem" ]; then
        print_success "GPIO access working"
    else
        print_warning "GPIO access permissions may be incorrect"
    fi
else
    print_warning "GPIO device not found"
fi

# Test camera access
print_status "Testing camera access..."
if [ -c "/dev/video0" ]; then
    if [ -r "/dev/video0" ]; then
        print_success "Camera device accessible"
    else
        print_warning "Camera device permissions may be incorrect"
    fi
else
    print_warning "No camera device found at /dev/video0"
fi

# 5. Test PCA9685 Communication
print_status "Testing PCA9685 servo controller..."
if python3 -c "
try:
    import smbus
    bus = smbus.SMBus(1)
    bus.read_byte(0x40)
    print('PCA9685 detected at address 0x40')
except:
    print('PCA9685 not detected or not connected')
" 2>/dev/null; then
    print_success "PCA9685 servo controller detected"
else
    print_warning "PCA9685 servo controller not detected - check wiring"
fi

# 6. Test Servo Control
print_status "Testing servo control system..."
if python3 python_wrappers/servo_cli.py move_to_pca 0 90 >/dev/null 2>&1; then
    print_success "Servo control system working"
else
    print_warning "Servo control system may have issues"
fi

# 7. Set Up MJPG-Streamer Service
print_status "Configuring MJPG-Streamer service..."

# Check if MJPG-Streamer is installed
if command -v mjpg_streamer >/dev/null 2>&1; then
    print_success "MJPG-Streamer is installed"
    
    # Start the service if not running
    if ! systemctl is-active --quiet mjpg-streamer; then
        print_status "Starting MJPG-Streamer service..."
        sudo systemctl start mjpg-streamer
        if systemctl is-active --quiet mjpg-streamer; then
            print_success "MJPG-Streamer service started"
        else
            print_warning "Failed to start MJPG-Streamer service"
        fi
    else
        print_success "MJPG-Streamer service already running"
    fi
else
    print_warning "MJPG-Streamer not installed - run install.sh first"
fi

# 8. Create Environment File
print_status "Setting up environment configuration..."

if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# MonsterBox 4.0 Environment Configuration
NODE_ENV=production
PORT=3000

# Hardware Configuration
ENABLE_HARDWARE=true
ENABLE_SERVO_CONTROL=true
ENABLE_CAMERA=true
ENABLE_AUDIO=true

# PCA9685 Configuration
PCA9685_ADDRESS=0x40
PCA9685_FREQUENCY=50

# Camera Configuration
CAMERA_DEVICE=/dev/video0
CAMERA_RESOLUTION=640x480
CAMERA_FPS=15

# Audio Configuration
AUDIO_SAMPLE_RATE=44100
AUDIO_CHANNELS=2

# Logging
LOG_LEVEL=info
EOF
    print_success "Environment file created"
else
    print_success "Environment file already exists"
fi

# 9. Test MonsterBox Server
print_status "Testing MonsterBox server startup..."

# Start server in background for testing
timeout 10s npm start > /tmp/monsterbox-test.log 2>&1 &
SERVER_PID=$!

sleep 5

# Check if server is responding
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    print_success "MonsterBox server is working"
    kill $SERVER_PID 2>/dev/null || true
else
    print_warning "MonsterBox server may have startup issues"
    kill $SERVER_PID 2>/dev/null || true
    print_status "Check /tmp/monsterbox-test.log for details"
fi

# 10. Create Startup Service
print_status "Creating MonsterBox startup service..."

sudo tee /etc/systemd/system/monsterbox.service > /dev/null << EOF
[Unit]
Description=MonsterBox 4.0 Animatronic Control System
After=network.target mjpg-streamer.service

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable monsterbox

print_success "MonsterBox startup service created and enabled"

# 11. Final System Check
print_status "Performing final system check..."

# Check all required services
SERVICES=("pigpiod" "mjpg-streamer")
for service in "${SERVICES[@]}"; do
    if systemctl is-enabled --quiet $service; then
        if systemctl is-active --quiet $service; then
            print_success "$service: enabled and running"
        else
            print_warning "$service: enabled but not running"
        fi
    else
        print_warning "$service: not enabled"
    fi
done

# Check hardware access
print_status "Hardware access summary:"
[ -c "/dev/gpiomem" ] && echo "  ✅ GPIO device available" || echo "  ❌ GPIO device missing"
[ -c "/dev/i2c-1" ] && echo "  ✅ I2C device available" || echo "  ❌ I2C device missing"
[ -c "/dev/video0" ] && echo "  ✅ Camera device available" || echo "  ❌ Camera device missing"

print_success "MonsterBox 4.0 setup complete!"
print_status "You can now start MonsterBox with: npm start"
print_status "Or enable automatic startup with: sudo systemctl start monsterbox"
print_status "Access the web interface at: http://$(hostname -I | awk '{print $1}'):3000"

# Display next steps
echo ""
print_status "Next Steps:"
echo "  1. Test servo movement through the web interface"
echo "  2. Configure your animatronic parts in the Parts section"
echo "  3. Set up poses and sequences"
echo "  4. Test camera streaming"
echo "  5. Configure audio settings"
echo ""
print_success "MonsterBox 4.0 is ready to use!"
