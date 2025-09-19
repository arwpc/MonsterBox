#!/bin/bash

# MonsterBox 4.0 Webcam Setup Script
# Ensures camera functionality works properly on fresh RPi4B installations

set -e

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

print_status "Setting up webcam and camera functionality for MonsterBox 4.0"

# 1. Check if running as root for system changes
if [ "$EUID" -eq 0 ]; then
    SUDO_CMD=""
    print_status "Running as root"
else
    SUDO_CMD="sudo"
    print_status "Running as user, will use sudo for system changes"
fi

# 2. Enable camera interface
print_status "Enabling camera interface..."
$SUDO_CMD raspi-config nonint do_camera 0
print_success "Camera interface enabled"

# 3. Configure GPU memory for camera
print_status "Configuring GPU memory for camera support..."
if ! grep -q "gpu_mem=" /boot/config.txt; then
    echo "gpu_mem=256" | $SUDO_CMD tee -a /boot/config.txt
else
    $SUDO_CMD sed -i 's/^gpu_mem=.*/gpu_mem=256/' /boot/config.txt
fi

if ! grep -q "start_x=" /boot/config.txt; then
    echo "start_x=1" | $SUDO_CMD tee -a /boot/config.txt
else
    $SUDO_CMD sed -i 's/^start_x=.*/start_x=1/' /boot/config.txt
fi

print_success "GPU memory configured for camera"

# 4. Install camera-related packages
print_status "Installing camera packages..."
$SUDO_CMD apt-get update
$SUDO_CMD apt-get install -y \
    v4l-utils \
    fswebcam \
    libv4l-dev \
    python3-picamera2 \
    python3-libcamera

print_success "Camera packages installed"

# 5. Set up video device permissions
print_status "Setting up video device permissions..."
echo 'SUBSYSTEM=="video4linux", GROUP="video", MODE="0666"' | $SUDO_CMD tee /etc/udev/rules.d/99-camera.rules
$SUDO_CMD udevadm control --reload-rules
$SUDO_CMD udevadm trigger

print_success "Video device permissions configured"

# 6. Test camera detection
print_status "Testing camera detection..."
sleep 2  # Give time for devices to initialize

if [ -c "/dev/video0" ]; then
    print_success "Camera device /dev/video0 detected"
    
    # Test camera capabilities
    if command -v v4l2-ctl >/dev/null 2>&1; then
        print_status "Camera capabilities:"
        v4l2-ctl --device=/dev/video0 --list-formats-ext 2>/dev/null | head -20 || print_warning "Could not read camera capabilities"
    fi
else
    print_warning "Camera device /dev/video0 not found"
    print_status "Available video devices:"
    ls -la /dev/video* 2>/dev/null || print_warning "No video devices found"
fi

# 7. Install and configure MJPG-Streamer if not already done
print_status "Checking MJPG-Streamer installation..."

if ! command -v mjpg_streamer >/dev/null 2>&1; then
    print_status "Installing MJPG-Streamer..."
    
    # Install dependencies
    $SUDO_CMD apt-get install -y \
        libjpeg-dev \
        imagemagick \
        cmake \
        git \
        build-essential
    
    # Clone and build MJPG-Streamer
    cd /tmp
    if [ -d "mjpg-streamer" ]; then
        rm -rf mjpg-streamer
    fi
    
    git clone https://github.com/jacksonliam/mjpg-streamer.git
    cd mjpg-streamer/mjpg-streamer-experimental
    
    make clean
    make all
    $SUDO_CMD make install
    
    print_success "MJPG-Streamer installed"
else
    print_success "MJPG-Streamer already installed"
fi

# 8. Create MJPG-Streamer systemd service
print_status "Configuring MJPG-Streamer service..."

$SUDO_CMD tee /etc/systemd/system/mjpg-streamer.service > /dev/null << 'EOF'
[Unit]
Description=MJPG Streamer for MonsterBox
After=network.target
Wants=network.target

[Service]
Type=forking
User=root
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 640x480 -f 15 -q 85" -o "output_http.so -p 8090 -w /usr/local/share/mjpg-streamer/www"
ExecStop=/bin/kill -TERM $MAINPID
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

$SUDO_CMD systemctl daemon-reload
$SUDO_CMD systemctl enable mjpg-streamer

print_success "MJPG-Streamer service configured"

# 9. Test camera capture
print_status "Testing camera capture..."

if [ -c "/dev/video0" ]; then
    # Test with fswebcam
    if command -v fswebcam >/dev/null 2>&1; then
        print_status "Testing camera with fswebcam..."
        if fswebcam -d /dev/video0 --no-banner -r 640x480 /tmp/test_capture.jpg >/dev/null 2>&1; then
            if [ -f "/tmp/test_capture.jpg" ]; then
                print_success "Camera capture test successful"
                rm -f /tmp/test_capture.jpg
            else
                print_warning "Camera capture test failed - no image created"
            fi
        else
            print_warning "Camera capture test failed"
        fi
    fi
    
    # Test with v4l2
    if command -v v4l2-ctl >/dev/null 2>&1; then
        print_status "Testing camera with v4l2..."
        if v4l2-ctl --device=/dev/video0 --set-fmt-video=width=640,height=480,pixelformat=MJPG >/dev/null 2>&1; then
            print_success "Camera v4l2 configuration successful"
        else
            print_warning "Camera v4l2 configuration failed"
        fi
    fi
else
    print_warning "Cannot test camera - no device found"
fi

# 10. Start MJPG-Streamer service
print_status "Starting MJPG-Streamer service..."

if $SUDO_CMD systemctl start mjpg-streamer; then
    sleep 3
    if $SUDO_CMD systemctl is-active --quiet mjpg-streamer; then
        print_success "MJPG-Streamer service started successfully"
        
        # Test HTTP stream
        if curl -s http://localhost:8090 >/dev/null 2>&1; then
            print_success "MJPG-Streamer HTTP interface accessible"
        else
            print_warning "MJPG-Streamer HTTP interface not accessible"
        fi
    else
        print_warning "MJPG-Streamer service failed to start"
        print_status "Service status:"
        $SUDO_CMD systemctl status mjpg-streamer --no-pager -l
    fi
else
    print_warning "Failed to start MJPG-Streamer service"
fi

# 11. Create camera test script
print_status "Creating camera test script..."

cat > /tmp/test-camera.sh << 'EOF'
#!/bin/bash

echo "=== MonsterBox Camera Test ==="
echo ""

echo "1. Checking video devices:"
ls -la /dev/video* 2>/dev/null || echo "No video devices found"
echo ""

echo "2. Checking camera capabilities:"
if command -v v4l2-ctl >/dev/null 2>&1; then
    v4l2-ctl --device=/dev/video0 --list-formats-ext 2>/dev/null | head -10 || echo "Could not read capabilities"
else
    echo "v4l2-ctl not available"
fi
echo ""

echo "3. Testing camera capture:"
if command -v fswebcam >/dev/null 2>&1; then
    if fswebcam -d /dev/video0 --no-banner -r 640x480 /tmp/camera_test.jpg >/dev/null 2>&1; then
        if [ -f "/tmp/camera_test.jpg" ]; then
            echo "✅ Camera capture successful"
            ls -la /tmp/camera_test.jpg
        else
            echo "❌ Camera capture failed - no image"
        fi
    else
        echo "❌ Camera capture failed"
    fi
else
    echo "fswebcam not available"
fi
echo ""

echo "4. Checking MJPG-Streamer:"
if systemctl is-active --quiet mjpg-streamer; then
    echo "✅ MJPG-Streamer service running"
    if curl -s http://localhost:8090 >/dev/null 2>&1; then
        echo "✅ MJPG-Streamer HTTP accessible"
    else
        echo "❌ MJPG-Streamer HTTP not accessible"
    fi
else
    echo "❌ MJPG-Streamer service not running"
fi
echo ""

echo "=== Camera Test Complete ==="
EOF

chmod +x /tmp/test-camera.sh

print_success "Camera test script created at /tmp/test-camera.sh"

# 12. Final summary
print_status "Webcam setup summary:"
echo "  Camera interface: $([ -c "/dev/video0" ] && echo "✅ Available" || echo "❌ Not found")"
echo "  MJPG-Streamer: $(command -v mjpg_streamer >/dev/null 2>&1 && echo "✅ Installed" || echo "❌ Not installed")"
echo "  Service status: $($SUDO_CMD systemctl is-active mjpg-streamer 2>/dev/null || echo "inactive")"
echo "  HTTP stream: $(curl -s http://localhost:8090 >/dev/null 2>&1 && echo "✅ Accessible" || echo "❌ Not accessible")"

print_success "Webcam setup complete!"
print_status "Test your camera with: bash /tmp/test-camera.sh"
print_status "Access MJPG stream at: http://$(hostname -I | awk '{print $1}'):8090"
print_warning "A reboot may be required for all camera changes to take effect"
