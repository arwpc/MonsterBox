#!/bin/bash

# MonsterBox 5.5 System Check Script
# Comprehensive verification of all dependencies and functionality

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

check_status() {
    if [ $1 -eq 0 ]; then
        echo "✅"
    else
        echo "❌"
    fi
}

echo "========================================"
echo "    MonsterBox 5.5 System Check"
echo "========================================"
echo ""

# 1. System Information
print_status "System Information:"
echo "  OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "  Kernel: $(uname -r)"
echo "  Architecture: $(uname -m)"
echo "  Hostname: $(hostname)"
echo "  IP Address: $(hostname -I | awk '{print $1}')"
echo ""

# 2. Node.js and npm
print_status "Node.js Environment:"
if command -v node >/dev/null 2>&1; then
    echo "  Node.js: ✅ $(node --version)"
else
    echo "  Node.js: ❌ Not installed"
fi

if command -v npm >/dev/null 2>&1; then
    echo "  npm: ✅ $(npm --version)"
else
    echo "  npm: ❌ Not installed"
fi
echo ""

# 3. Python Environment
print_status "Python Environment:"
if command -v python3 >/dev/null 2>&1; then
    echo "  Python 3: ✅ $(python3 --version)"
else
    echo "  Python 3: ❌ Not installed"
fi

if command -v pip3 >/dev/null 2>&1; then
    echo "  pip3: ✅ $(pip3 --version | cut -d' ' -f2)"
else
    echo "  pip3: ❌ Not installed"
fi
echo ""

# 4. Hardware Interfaces
print_status "Hardware Interfaces:"

# GPIO
if [ -c "/dev/gpiomem" ]; then
    if [ -r "/dev/gpiomem" ] && [ -w "/dev/gpiomem" ]; then
        echo "  GPIO: ✅ Accessible"
    else
        echo "  GPIO: ⚠️  Device exists but permissions may be wrong"
    fi
else
    echo "  GPIO: ❌ Device not found"
fi

# I2C
if [ -c "/dev/i2c-1" ]; then
    if [ -r "/dev/i2c-1" ] && [ -w "/dev/i2c-1" ]; then
        echo "  I2C: ✅ Accessible"
    else
        echo "  I2C: ⚠️  Device exists but permissions may be wrong"
    fi
else
    echo "  I2C: ❌ Device not found"
fi

# SPI
if [ -c "/dev/spidev0.0" ]; then
    echo "  SPI: ✅ Available"
else
    echo "  SPI: ❌ Device not found"
fi

# Camera
if [ -c "/dev/video0" ]; then
    echo "  Camera: ✅ Device found"
else
    echo "  Camera: ❌ Device not found"
fi
echo ""

# 5. System Services
print_status "System Services:"

SERVICES=("pigpiod" "mjpg-streamer")
for service in "${SERVICES[@]}"; do
    if systemctl is-enabled --quiet $service 2>/dev/null; then
        if systemctl is-active --quiet $service 2>/dev/null; then
            echo "  $service: ✅ Enabled and running"
        else
            echo "  $service: ⚠️  Enabled but not running"
        fi
    else
        echo "  $service: ❌ Not enabled"
    fi
done
echo ""

# 6. Hardware Tools
print_status "Hardware Tools:"

TOOLS=("i2cdetect" "v4l2-ctl" "fswebcam" "mjpg_streamer" "amixer")
for tool in "${TOOLS[@]}"; do
    if command -v $tool >/dev/null 2>&1; then
        echo "  $tool: ✅ Available"
    else
        echo "  $tool: ❌ Not found"
    fi
done
echo ""

# 7. Python Packages
print_status "Python Packages:"

PYTHON_PACKAGES=("smbus" "RPi.GPIO" "gpiozero" "cv2" "websockets" "pyaudio")
for package in "${PYTHON_PACKAGES[@]}"; do
    if python3 -c "import $package" >/dev/null 2>&1; then
        echo "  $package: ✅ Available"
    else
        echo "  $package: ❌ Not found"
    fi
done
echo ""

# 8. MonsterBox Application
print_status "MonsterBox Application:"

if [ -f "package.json" ]; then
    echo "  package.json: ✅ Found"
else
    echo "  package.json: ❌ Not found"
fi

if [ -f "server.js" ]; then
    echo "  server.js: ✅ Found"
else
    echo "  server.js: ❌ Not found"
fi

if [ -d "node_modules" ]; then
    echo "  node_modules: ✅ Found"
else
    echo "  node_modules: ❌ Not found (run npm install)"
fi

if [ -d "python_wrappers" ]; then
    echo "  python_wrappers: ✅ Found"
else
    echo "  python_wrappers: ❌ Not found"
fi
echo ""

# 9. Hardware Tests
print_status "Hardware Tests:"

# Test I2C scan
if command -v i2cdetect >/dev/null 2>&1; then
    echo "  I2C Scan:"
    i2cdetect -y 1 2>/dev/null | grep -E "40|70" | while read line; do
        if echo "$line" | grep -q "40"; then
            echo "    PCA9685 (0x40): ✅ Detected"
        fi
        if echo "$line" | grep -q "70"; then
            echo "    Device (0x70): ✅ Detected"
        fi
    done
    
    # Check if no devices found
    if ! i2cdetect -y 1 2>/dev/null | grep -E "[0-9a-f]{2}" >/dev/null; then
        echo "    No I2C devices detected"
    fi
else
    echo "  I2C Scan: ❌ i2cdetect not available"
fi

# Test PCA9685 specifically
if python3 -c "
try:
    import smbus
    bus = smbus.SMBus(1)
    bus.read_byte(0x40)
    print('  PCA9685 Communication: ✅ Working')
except:
    print('  PCA9685 Communication: ❌ Failed')
" 2>/dev/null; then
    :
else
    echo "  PCA9685 Communication: ❌ Failed"
fi

# Test servo control
if [ -f "python_wrappers/servo_cli.py" ]; then
    if python3 python_wrappers/servo_cli.py move_to_pca 0 90 >/dev/null 2>&1; then
        echo "  Servo Control: ✅ Working"
    else
        echo "  Servo Control: ❌ Failed"
    fi
else
    echo "  Servo Control: ❌ servo_cli.py not found"
fi
echo ""

# 10. Network Services
print_status "Network Services:"

# Test MJPG-Streamer HTTP
if curl -s http://localhost:8090 >/dev/null 2>&1; then
    echo "  MJPG-Streamer HTTP: ✅ Accessible"
else
    echo "  MJPG-Streamer HTTP: ❌ Not accessible"
fi

# Test MonsterBox port
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "  MonsterBox HTTP: ✅ Running"
else
    echo "  MonsterBox HTTP: ❌ Not running"
fi
echo ""

# 11. Configuration Files
print_status "Configuration Files:"

CONFIG_FILES=(".env" "config/app-config.json" "data/parts.json" "data/characters.json")
for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  $file: ✅ Found"
    else
        echo "  $file: ❌ Not found"
    fi
done
echo ""

# 12. Disk Space and Memory
print_status "System Resources:"

# Disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    echo "  Disk Usage: ✅ ${DISK_USAGE}% used"
else
    echo "  Disk Usage: ⚠️  ${DISK_USAGE}% used (getting full)"
fi

# Memory
MEM_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ "$MEM_USAGE" -lt 80 ]; then
    echo "  Memory Usage: ✅ ${MEM_USAGE}% used"
else
    echo "  Memory Usage: ⚠️  ${MEM_USAGE}% used (high usage)"
fi

# Temperature
if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
    TEMP=$(cat /sys/class/thermal/thermal_zone0/temp)
    TEMP_C=$((TEMP/1000))
    if [ "$TEMP_C" -lt 70 ]; then
        echo "  CPU Temperature: ✅ ${TEMP_C}°C"
    else
        echo "  CPU Temperature: ⚠️  ${TEMP_C}°C (getting hot)"
    fi
fi
echo ""

# 13. Summary and Recommendations
print_status "Summary and Recommendations:"

# Count issues
ISSUES=0

# Check critical components
[ ! -f "package.json" ] && ISSUES=$((ISSUES+1))
[ ! -d "node_modules" ] && ISSUES=$((ISSUES+1))
[ ! -c "/dev/gpiomem" ] && ISSUES=$((ISSUES+1))
[ ! -c "/dev/i2c-1" ] && ISSUES=$((ISSUES+1))
! command -v node >/dev/null 2>&1 && ISSUES=$((ISSUES+1))
! command -v python3 >/dev/null 2>&1 && ISSUES=$((ISSUES+1))

if [ "$ISSUES" -eq 0 ]; then
    print_success "System appears to be properly configured for MonsterBox 5.5"
    echo "  Ready to run: npm start"
elif [ "$ISSUES" -le 2 ]; then
    print_warning "System has minor issues but should work"
    echo "  Fix the issues above and try running MonsterBox"
else
    print_error "System has significant issues"
    echo "  Run the installation scripts to fix these problems"
fi

echo ""
echo "========================================"
echo "    System Check Complete"
echo "========================================"
