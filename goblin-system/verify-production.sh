#!/bin/bash

# MonsterBox Goblin Production Verification Script
# Verifies that a goblin is production-ready

set -e

# Color output functions
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> ✗ $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> ✓ $1\e[0m"
}

print_warning() {
    echo -e "\e[1;33m>>> ⚠ $1\e[0m"
}

GOBLIN_DIR="${GOBLIN_DIR:-$HOME/goblin}"
ERRORS=0
WARNINGS=0

echo ""
print_status "🎃 MonsterBox Goblin Production Verification"
print_status "============================================="
echo ""

# 1. Check if goblin directory exists
print_status "Checking goblin directory..."
if [ -d "$GOBLIN_DIR" ]; then
    print_success "Goblin directory exists: $GOBLIN_DIR"
else
    print_error "Goblin directory not found: $GOBLIN_DIR"
    ((ERRORS++))
fi

# 2. Check if server.js exists
print_status "Checking server files..."
if [ -f "$GOBLIN_DIR/server.js" ]; then
    print_success "server.js found"
else
    print_error "server.js not found"
    ((ERRORS++))
fi

# 3. Check if node_modules exists
print_status "Checking dependencies..."
if [ -d "$GOBLIN_DIR/node_modules" ]; then
    print_success "Node modules installed"
else
    print_error "Node modules not installed"
    ((ERRORS++))
fi

# 4. Check if config file exists
print_status "Checking configuration..."
if [ -f "$GOBLIN_DIR/config/goblin.json" ]; then
    print_success "Configuration file found"
    
    # Display config
    GOBLIN_ID=$(grep -o '"goblinId": "[^"]*"' "$GOBLIN_DIR/config/goblin.json" | cut -d'"' -f4)
    print_status "  Goblin ID: $GOBLIN_ID"
else
    print_error "Configuration file not found"
    ((ERRORS++))
fi

# 5. Check systemd service
print_status "Checking systemd service..."
if [ -f "/etc/systemd/system/goblin.service" ]; then
    print_success "Systemd service file exists"
    
    # Check if enabled
    if systemctl is-enabled --quiet goblin.service 2>/dev/null; then
        print_success "Service is enabled (will start on boot)"
    else
        print_error "Service is not enabled"
        ((ERRORS++))
    fi
    
    # Check if running
    if systemctl is-active --quiet goblin.service 2>/dev/null; then
        print_success "Service is running"
    else
        print_error "Service is not running"
        ((ERRORS++))
    fi
else
    print_error "Systemd service file not found"
    ((ERRORS++))
fi

# 6. Check if port is listening
print_status "Checking network..."
GOBLIN_PORT=$(grep -o '"port": [0-9]*' "$GOBLIN_DIR/config/goblin.json" 2>/dev/null | grep -o '[0-9]*' || echo "3001")
if netstat -tuln 2>/dev/null | grep -q ":$GOBLIN_PORT " || ss -tuln 2>/dev/null | grep -q ":$GOBLIN_PORT "; then
    print_success "Goblin is listening on port $GOBLIN_PORT"
else
    print_warning "Goblin is not listening on port $GOBLIN_PORT"
    ((WARNINGS++))
fi

# 7. Check media directory
print_status "Checking media directory..."
if [ -d "$GOBLIN_DIR/media" ]; then
    print_success "Media directory exists"
    
    # Count video files
    VIDEO_COUNT=$(find "$GOBLIN_DIR/media" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) 2>/dev/null | wc -l)
    if [ "$VIDEO_COUNT" -gt 0 ]; then
        print_success "Found $VIDEO_COUNT video files"
    else
        print_warning "No video files found in media directory"
        ((WARNINGS++))
    fi
else
    print_error "Media directory not found"
    ((ERRORS++))
fi

# 8. Check logs
print_status "Checking logs..."
if [ -d "$GOBLIN_DIR/logs" ]; then
    print_success "Logs directory exists"
    
    if [ -f "$GOBLIN_DIR/logs/goblin.log" ]; then
        LOG_SIZE=$(du -h "$GOBLIN_DIR/logs/goblin.log" | cut -f1)
        print_success "Log file exists (size: $LOG_SIZE)"
        
        # Check for recent activity
        if [ -n "$(find "$GOBLIN_DIR/logs/goblin.log" -mmin -5 2>/dev/null)" ]; then
            print_success "Log file has recent activity (last 5 minutes)"
        else
            print_warning "Log file has no recent activity"
            ((WARNINGS++))
        fi
    else
        print_warning "Log file not found (may not have started yet)"
        ((WARNINGS++))
    fi
else
    print_error "Logs directory not found"
    ((ERRORS++))
fi

# 9. Check Node.js and npm
print_status "Checking Node.js environment..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js not found"
    ((ERRORS++))
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm installed: $NPM_VERSION"
else
    print_error "npm not found"
    ((ERRORS++))
fi

# 10. Check mpv (video player)
print_status "Checking video player..."
if command -v mpv &> /dev/null; then
    MPV_VERSION=$(mpv --version | head -n1)
    print_success "mpv installed: $MPV_VERSION"
else
    print_error "mpv not found (required for video playback)"
    ((ERRORS++))
fi

# 11. Test HTTP endpoint
print_status "Testing HTTP endpoint..."
CURRENT_IP=$(hostname -I | awk '{print $1}')
if curl -s --connect-timeout 5 "http://localhost:$GOBLIN_PORT/api/status" > /dev/null 2>&1; then
    print_success "HTTP endpoint responding"
    print_status "  Endpoint: http://$CURRENT_IP:$GOBLIN_PORT"
else
    print_warning "HTTP endpoint not responding"
    ((WARNINGS++))
fi

# 12. Check for MonsterBox connectivity
print_status "Checking MonsterBox connectivity..."
if [ -f "$GOBLIN_DIR/config/goblin.json" ]; then
    MONSTERBOX_HOST=$(grep -o '"monsterboxHost": "[^"]*"' "$GOBLIN_DIR/config/goblin.json" | cut -d'"' -f4)
    if [ -n "$MONSTERBOX_HOST" ]; then
        print_status "  MonsterBox host: $MONSTERBOX_HOST"
        
        if ping -c 1 -W 2 "$MONSTERBOX_HOST" > /dev/null 2>&1; then
            print_success "Can reach MonsterBox host"
        else
            print_warning "Cannot reach MonsterBox host (may be offline)"
            ((WARNINGS++))
        fi
    fi
fi

# Summary
echo ""
print_status "============================================="
print_status "Verification Summary"
print_status "============================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    print_success "🎉 All checks passed! Goblin is production-ready!"
    echo ""
    print_status "Production Features Verified:"
    echo "  ✓ Auto-start on boot configured"
    echo "  ✓ Service is running"
    echo "  ✓ Configuration is valid"
    echo "  ✓ Dependencies installed"
    echo "  ✓ Media directory ready"
    echo "  ✓ Logging configured"
    echo ""
    print_status "Next Steps:"
    echo "  1. Test with: curl http://localhost:$GOBLIN_PORT/api/status"
    echo "  2. View logs: tail -f $GOBLIN_DIR/logs/goblin.log"
    echo "  3. Reboot test: sudo reboot (verify auto-start)"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    print_warning "⚠️  Verification completed with $WARNINGS warning(s)"
    echo ""
    print_status "The goblin should work, but review warnings above."
    echo ""
    exit 0
else
    print_error "❌ Verification failed with $ERRORS error(s) and $WARNINGS warning(s)"
    echo ""
    print_status "Please fix the errors above before deploying to production."
    echo ""
    print_status "Common fixes:"
    echo "  - Run: ./deploy-production.sh"
    echo "  - Check logs: sudo journalctl -u goblin -n 50"
    echo "  - Restart service: sudo systemctl restart goblin"
    echo ""
    exit 1
fi

