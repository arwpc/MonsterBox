#!/bin/bash

# MonsterBox Installation Verification Script
# Run this after install.sh to verify everything is working

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🚀 MonsterBox Installation Verification"
echo "========================================"

# 1. Check Python version
print_status "Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1)
if [[ $? -eq 0 ]]; then
    print_success "Python: $PYTHON_VERSION"
else
    print_error "Python 3 not found"
fi

# 2. Check Node.js version
print_status "Checking Node.js version..."
NODE_VERSION=$(node --version 2>&1)
if [[ $? -eq 0 ]]; then
    print_success "Node.js: $NODE_VERSION"
else
    print_error "Node.js not found"
fi

# 3. Check I2C tools
print_status "Checking I2C tools..."
if command -v i2cdetect >/dev/null 2>&1; then
    print_success "i2cdetect available"
    print_status "Scanning I2C bus 1..."
    i2cdetect -y 1 2>/dev/null | grep -E "40|41|42|43|44|45|46|47" && print_success "I2C devices detected" || print_warning "No I2C devices found on bus 1"
else
    print_error "i2cdetect not found - install i2c-tools"
fi

# 4. Check SMBus libraries
print_status "Checking SMBus libraries..."
python3 -c "import smbus2; print('smbus2 OK')" 2>/dev/null && print_success "smbus2 available" || print_warning "smbus2 not available"
python3 -c "import smbus; print('smbus OK')" 2>/dev/null && print_success "smbus available" || print_warning "smbus not available"

# 5. Test PCA9685 control import
print_status "Testing PCA9685 control import..."
if [ -f "python_wrappers/pca9685_control.py" ]; then
    cd "$(dirname "$0")"
    python3 -c "
import sys
sys.path.insert(0, 'python_wrappers')
try:
    from pca9685_control import pca9685_set_angle
    print('PCA9685 control import: OK')
except Exception as e:
    print(f'PCA9685 control import failed: {e}')
    exit(1)
" && print_success "PCA9685 control module imports successfully" || print_error "PCA9685 control module import failed"
else
    print_error "pca9685_control.py not found"
fi

# 6. Check hardware permissions
print_status "Checking hardware permissions..."
if groups | grep -q "gpio"; then
    print_success "User is in gpio group"
else
    print_warning "User not in gpio group - run: sudo usermod -a -G gpio $USER"
fi

if groups | grep -q "i2c"; then
    print_success "User is in i2c group"
else
    print_warning "User not in i2c group - run: sudo usermod -a -G i2c $USER"
fi

# 7. Check services
print_status "Checking system services..."
if systemctl is-active --quiet pigpiod; then
    print_success "pigpiod service is running"
else
    print_warning "pigpiod service not running - run: sudo systemctl start pigpiod"
fi

if systemctl is-active --quiet mjpg-streamer; then
    print_success "mjpg-streamer service is running"
else
    print_warning "mjpg-streamer service not running - run: sudo systemctl start mjpg-streamer"
fi

# 8. Test servo control (if hardware is connected)
print_status "Testing servo control system..."
if [ -f "python_wrappers/servo_cli.py" ]; then
    python3 python_wrappers/servo_cli.py move_to_pca 0 90 >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        print_success "Servo control system working"
    else
        print_warning "Servo control system may have issues (this is normal if no PCA9685 is connected)"
    fi
else
    print_error "servo_cli.py not found"
fi

echo ""
echo "🎯 Verification complete!"
echo "If you see any errors above, please address them before running MonsterBox."
echo "To start MonsterBox: npm start"
