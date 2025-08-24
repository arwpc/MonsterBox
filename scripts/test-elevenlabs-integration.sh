#!/bin/bash

# ElevenLabs Integration Test Script
# Comprehensive testing for all updated AI management pages

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        exit 1
    fi
    
    success "Dependencies check passed"
}

# Install test dependencies
install_test_deps() {
    log "Installing test dependencies..."
    
    # Check if Playwright is installed
    if ! npm list @playwright/test &> /dev/null; then
        log "Installing Playwright..."
        npm install --save-dev @playwright/test
        npx playwright install
    fi
    
    success "Test dependencies installed"
}

# Start MonsterBox application
start_application() {
    log "Starting MonsterBox application..."
    
    # Check if application is already running
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        warning "Application already running on port 3000"
        return 0
    fi
    
    # Start the application in background
    npm start &
    APP_PID=$!
    
    # Wait for application to start
    log "Waiting for application to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            success "Application started successfully"
            return 0
        fi
        sleep 2
    done
    
    error "Failed to start application"
    exit 1
}

# Run ElevenLabs integration tests
run_tests() {
    log "Running ElevenLabs integration tests..."
    
    # Set test environment variables
    export NODE_ENV=test
    export BASE_URL=http://localhost:3000
    
    # Run tests with custom config
    npx playwright test --config=test/playwright-elevenlabs.config.js
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        success "All ElevenLabs integration tests passed!"
    else
        error "Some tests failed. Check the test report for details."
    fi
    
    return $exit_code
}

# Generate test report
generate_report() {
    log "Generating test report..."
    
    if [ -f "test-results/elevenlabs-results.json" ]; then
        # Create a summary report
        cat > test-results/elevenlabs-summary.md << EOF
# ElevenLabs Integration Test Report

**Date:** $(date)
**Environment:** ${NODE_ENV:-development}
**Base URL:** ${BASE_URL:-http://localhost:3000}

## Test Results

$(npx playwright show-report test-results/elevenlabs-html-report --reporter=list 2>/dev/null || echo "HTML report generated")

## Test Coverage

- ✅ AI Management Dashboard
- ✅ Voice Activity Detection Configuration  
- ✅ ElevenLabs Agents Management
- ✅ ElevenLabs Voice Configuration
- ✅ Enhanced Test Chat Interface
- ✅ Conversational AI Route Integration
- ✅ API Endpoint Integration
- ✅ Backward Compatibility

## Files Tested

- /ai-management (Dashboard)
- /ai-management/stt (VAD Configuration)
- /ai-management/agents (Agents Management)
- /ai-management/voices (Voice Configuration)
- /test-chat (Enhanced Test Chat)
- /conversational-ai (Main Interface)

## Next Steps

1. Review any failed tests in the HTML report
2. Verify ElevenLabs API key configuration
3. Test with actual ElevenLabs service connection
4. Validate character switching functionality
5. Confirm conversation starters preservation

EOF
        
        success "Test summary report generated: test-results/elevenlabs-summary.md"
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up..."
    
    if [ ! -z "$APP_PID" ]; then
        kill $APP_PID 2>/dev/null || true
        wait $APP_PID 2>/dev/null || true
    fi
    
    # Kill any remaining node processes on port 3000
    pkill -f "node.*app.js" 2>/dev/null || true
}

# Main execution
main() {
    log "Starting ElevenLabs Integration Test Suite"
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run test sequence
    check_dependencies
    install_test_deps
    start_application
    
    # Give application time to fully initialize
    sleep 5
    
    run_tests
    local test_result=$?
    
    generate_report
    
    if [ $test_result -eq 0 ]; then
        success "🎉 ElevenLabs integration tests completed successfully!"
        success "📊 View detailed report: npx playwright show-report test-results/elevenlabs-html-report"
    else
        error "❌ Some tests failed. Please review the test report."
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "ElevenLabs Integration Test Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --install-only Install test dependencies only"
        echo "  --test-only    Run tests only (assumes app is running)"
        echo ""
        echo "Environment Variables:"
        echo "  BASE_URL       Base URL for testing (default: http://localhost:3000)"
        echo "  NODE_ENV       Node environment (default: test)"
        exit 0
        ;;
    --install-only)
        check_dependencies
        install_test_deps
        success "Test dependencies installed successfully"
        exit 0
        ;;
    --test-only)
        log "Running tests only (assuming application is running)"
        run_tests
        generate_report
        exit $?
        ;;
    *)
        main
        ;;
esac
