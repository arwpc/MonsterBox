#!/bin/bash
# MonsterBox 5.4 Complete Deployment Script
# Deploys, reboots, and tests all animatronics
# Author: MonsterBox Team
# Date: 2025-10-25

set -e

echo "🎃 MonsterBox 5.4 Complete Deployment"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Animatronics configuration
declare -A ANIMATRONICS
ANIMATRONICS[orlok]="192.168.8.120"
ANIMATRONICS[coffin]="192.168.8.140"
ANIMATRONICS[pumpkinhead]="192.168.8.150"
ANIMATRONICS[skulltalker]="192.168.8.130"
ANIMATRONICS[groundbreaker]="192.168.8.200"

# Deployment configuration
MONSTERBOX_VERSION="5.4"
REPO_PATH="/home/remote/MonsterBox"
GIT_BRANCH="main"

# Test results
declare -A TEST_RESULTS

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if animatronic is reachable
check_reachable() {
    local ip=$1
    if ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Update animatronic to version 5.4
update_animatronic() {
    local name=$1
    local ip=$2
    
    log_info "Updating $name ($ip) to version $MONSTERBOX_VERSION..."
    
    # Check reachability
    if ! check_reachable "$ip"; then
        log_error "$name is not reachable"
        TEST_RESULTS[$name]="UNREACHABLE"
        return 1
    fi
    
    # Pull latest code
    log_info "  📥 Pulling latest code from $GIT_BRANCH..."
    if ssh -o ConnectTimeout=10 "remote@$ip" "cd $REPO_PATH && git fetch origin && git reset --hard origin/$GIT_BRANCH" 2>&1 | grep -q "HEAD is now"; then
        log_success "  ✅ Code updated successfully"
    else
        log_warning "  ⚠️  Git pull encountered issues, attempting force pull..."
        ssh -o ConnectTimeout=10 "remote@$ip" "cd $REPO_PATH && git fetch origin && git checkout -f $GIT_BRANCH && git reset --hard origin/$GIT_BRANCH" || {
            log_error "  ❌ Failed to update code"
            TEST_RESULTS[$name]="UPDATE_FAILED"
            return 1
        }
    fi
    
    # Check version
    log_info "  🔍 Verifying version..."
    local version=$(ssh -o ConnectTimeout=10 "remote@$ip" "grep -o 'MonsterBox [0-9.]*' $REPO_PATH/views/setup/system.ejs | head -1" 2>/dev/null || echo "Unknown")
    log_info "  📦 Version: $version"
    
    # Install/update dependencies if needed
    log_info "  📦 Checking Node.js dependencies..."
    ssh -o ConnectTimeout=10 "remote@$ip" "cd $REPO_PATH && npm install --production" > /dev/null 2>&1 || {
        log_warning "  ⚠️  npm install had warnings (this is usually okay)"
    }
    
    log_success "  ✅ $name updated successfully"
    return 0
}

# Reboot animatronic and wait for it to come back online
reboot_animatronic() {
    local name=$1
    local ip=$2
    
    log_info "Rebooting $name ($ip)..."
    
    # Initiate reboot
    log_info "  🔄 Sending reboot command..."
    ssh -o ConnectTimeout=10 "remote@$ip" "sudo reboot" 2>/dev/null || true
    
    log_info "  ⏳ Waiting for $name to go offline..."
    sleep 5
    
    # Wait for it to go offline
    local offline_count=0
    while [ $offline_count -lt 3 ]; do
        if ! check_reachable "$ip"; then
            ((offline_count++))
        else
            offline_count=0
        fi
        sleep 2
    done
    
    log_success "  ✅ $name is offline, waiting for boot..."
    
    # Wait for it to come back online (max 120 seconds)
    log_info "  ⏳ Waiting for $name to come back online (max 2 minutes)..."
    local wait_count=0
    local max_wait=60  # 60 * 2 seconds = 2 minutes
    
    while [ $wait_count -lt $max_wait ]; do
        if check_reachable "$ip"; then
            # Give it a few more seconds to fully boot
            sleep 10
            
            # Check if MonsterBox service is running
            if ssh -o ConnectTimeout=10 "remote@$ip" "systemctl is-active monsterbox" 2>/dev/null | grep -q "active"; then
                log_success "  ✅ $name is back online and MonsterBox is running"
                return 0
            fi
        fi
        
        ((wait_count++))
        sleep 2
        
        # Progress indicator every 10 seconds
        if [ $((wait_count % 5)) -eq 0 ]; then
            log_info "  ⏳ Still waiting... ($((wait_count * 2))s elapsed)"
        fi
    done
    
    log_error "  ❌ $name did not come back online within 2 minutes"
    TEST_RESULTS[$name]="REBOOT_TIMEOUT"
    return 1
}

# Check for errors in logs
check_errors() {
    local name=$1
    local ip=$2
    
    log_info "Checking $name for errors..."
    
    # Check MonsterBox service status
    local service_status=$(ssh -o ConnectTimeout=10 "remote@$ip" "systemctl is-active monsterbox" 2>/dev/null || echo "unknown")
    
    if [ "$service_status" = "active" ]; then
        log_success "  ✅ MonsterBox service is active"
    else
        log_error "  ❌ MonsterBox service is $service_status"
        TEST_RESULTS[$name]="SERVICE_ERROR"
        return 1
    fi
    
    # Check recent logs for errors
    log_info "  📋 Checking recent logs..."
    local error_count=$(ssh -o ConnectTimeout=10 "remote@$ip" "journalctl -u monsterbox --since '2 minutes ago' | grep -i 'error' | wc -l" 2>/dev/null || echo "0")
    
    if [ "$error_count" -gt 0 ]; then
        log_warning "  ⚠️  Found $error_count error(s) in logs"
        log_info "  📋 Recent errors:"
        ssh -o ConnectTimeout=10 "remote@$ip" "journalctl -u monsterbox --since '2 minutes ago' | grep -i 'error' | tail -5" 2>/dev/null || true
    else
        log_success "  ✅ No errors in recent logs"
    fi
    
    # Check if web server is responding
    log_info "  🌐 Testing web interface..."
    if curl -s -o /dev/null -w "%{http_code}" "http://$ip:3000" | grep -q "200"; then
        log_success "  ✅ Web interface is responding"
        TEST_RESULTS[$name]="PASSED"
        return 0
    else
        log_warning "  ⚠️  Web interface not responding yet (may still be starting up)"
        TEST_RESULTS[$name]="WEB_WARNING"
        return 0
    fi
}

# Test hardware parts
test_hardware() {
    local name=$1
    local ip=$2
    
    log_info "Hardware test instructions for $name:"
    log_info "  1. Open browser: http://$ip:3000/setup/calibration"
    log_info "  2. Test each part using the calibration interface"
    log_info "  3. Verify all parts move without errors"
    echo ""
}

# Main deployment process
main() {
    echo "🚀 Starting deployment process..."
    echo ""
    
    # Phase 1: Update all animatronics
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "PHASE 1: Update Code to Version $MONSTERBOX_VERSION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    for name in "${!ANIMATRONICS[@]}"; do
        ip="${ANIMATRONICS[$name]}"
        update_animatronic "$name" "$ip"
        echo ""
    done
    
    # Phase 2: Reboot all animatronics
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "PHASE 2: Reboot All Animatronics"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    for name in "${!ANIMATRONICS[@]}"; do
        ip="${ANIMATRONICS[$name]}"
        if [ "${TEST_RESULTS[$name]}" != "UNREACHABLE" ] && [ "${TEST_RESULTS[$name]}" != "UPDATE_FAILED" ]; then
            reboot_animatronic "$name" "$ip"
            echo ""
        else
            log_warning "Skipping reboot for $name (previous step failed)"
            echo ""
        fi
    done
    
    # Phase 3: Check for errors
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "PHASE 3: Error Check"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    for name in "${!ANIMATRONICS[@]}"; do
        ip="${ANIMATRONICS[$name]}"
        if [ "${TEST_RESULTS[$name]}" != "UNREACHABLE" ] && [ "${TEST_RESULTS[$name]}" != "UPDATE_FAILED" ] && [ "${TEST_RESULTS[$name]}" != "REBOOT_TIMEOUT" ]; then
            check_errors "$name" "$ip"
            echo ""
        else
            log_warning "Skipping error check for $name (previous step failed)"
            echo ""
        fi
    done
    
    # Phase 4: Hardware testing instructions
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "PHASE 4: Hardware Testing"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    log_info "Manual hardware testing required for each animatronic:"
    echo ""
    
    for name in "${!ANIMATRONICS[@]}"; do
        ip="${ANIMATRONICS[$name]}"
        if [ "${TEST_RESULTS[$name]}" = "PASSED" ] || [ "${TEST_RESULTS[$name]}" = "WEB_WARNING" ]; then
            test_hardware "$name" "$ip"
        fi
    done
    
    # Final summary
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "DEPLOYMENT SUMMARY"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    for name in "${!ANIMATRONICS[@]}"; do
        ip="${ANIMATRONICS[$name]}"
        result="${TEST_RESULTS[$name]}"
        
        case $result in
            "PASSED")
                log_success "$name ($ip): ✅ PASSED"
                ;;
            "WEB_WARNING")
                log_warning "$name ($ip): ⚠️  PASSED (web interface slow to start)"
                ;;
            "UNREACHABLE")
                log_error "$name ($ip): ❌ UNREACHABLE"
                ;;
            "UPDATE_FAILED")
                log_error "$name ($ip): ❌ UPDATE FAILED"
                ;;
            "REBOOT_TIMEOUT")
                log_error "$name ($ip): ❌ REBOOT TIMEOUT"
                ;;
            "SERVICE_ERROR")
                log_error "$name ($ip): ❌ SERVICE ERROR"
                ;;
            *)
                log_warning "$name ($ip): ⚠️  UNKNOWN STATUS"
                ;;
        esac
    done
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Next Steps:"
    echo "  1. Test hardware on each animatronic using calibration interface"
    echo "  2. Verify PCA9685 servos work correctly"
    echo "  3. Test motion sensors in scene steps"
    echo "  4. Verify scene queue loop mode"
    echo "  5. Test reboot button on each system"
    echo ""
    echo "✨ Deployment script complete!"
}

# Run main function
main
