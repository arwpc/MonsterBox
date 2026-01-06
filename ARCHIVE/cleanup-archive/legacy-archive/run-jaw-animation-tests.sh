#!/bin/bash

# Jaw Animation Super Power Test Runner
# Comprehensive test execution for jaw animation system
# Includes unit tests, integration tests, and UI tests with Halloween theming

echo "🎃 Starting Jaw Animation Super Power Test Suite 🎃"
echo "============================================================"

# Colors for Halloween-themed output
ORANGE='\033[0;33m'
RED='\033[0;31m'
GREEN='\033[0;32m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Test configuration
TEST_CONFIG="./test/jaw-animation.config.js"
RESULTS_DIR="./test-results"
LOG_FILE="$RESULTS_DIR/jaw-animation-test.log"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Start logging
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

echo -e "${ORANGE}Test Suite: Jaw Animation Super Power${NC}"
echo -e "${ORANGE}Framework: MonsterBox 4.0${NC}"
echo -e "${ORANGE}Theme: Halloween 🎃${NC}"
echo -e "${ORANGE}Date: $(date)${NC}"
echo ""

# Function to run test category
run_test_category() {
    local category=$1
    local description=$2
    local test_pattern=$3
    
    echo -e "${PURPLE}🧙 Running $description...${NC}"
    echo "----------------------------------------"
    
    if [ "$category" == "unit" ]; then
        # Run unit tests with Mocha
        npm test -- --grep "jaw-animation-service-unit"
        test_result=$?
    elif [ "$category" == "api" ]; then
        # Run API integration tests with Mocha
        npm test -- --grep "jaw-animation-super-power"
        test_result=$?
    elif [ "$category" == "ui" ]; then
        # Run UI tests with Playwright
        npx playwright test --config="$TEST_CONFIG" --project=jaw-animation-ui-tests
        test_result=$?
    elif [ "$category" == "mobile" ]; then
        # Run mobile UI tests with Playwright
        npx playwright test --config="$TEST_CONFIG" --project=jaw-animation-mobile-ui
        test_result=$?
    else
        echo -e "${RED}❌ Unknown test category: $category${NC}"
        return 1
    fi
    
    if [ $test_result -eq 0 ]; then
        echo -e "${GREEN}✅ $description completed successfully${NC}"
    else
        echo -e "${RED}❌ $description failed with exit code $test_result${NC}"
    fi
    
    echo ""
    return $test_result
}

# Check if MonsterBox server is running
echo -e "${ORANGE}🏠 Checking MonsterBox server status...${NC}"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MonsterBox server is running${NC}"
else
    echo -e "${RED}❌ MonsterBox server is not running${NC}"
    echo -e "${RED}Please start the server with: npm start${NC}"
    exit 1
fi
echo ""

# Initialize test results tracking
total_tests=0
passed_tests=0
failed_tests=0

# Run Unit Tests
echo -e "${ORANGE}=== UNIT TESTS ===${NC}"
run_test_category "unit" "Unit Tests (Service Logic)" "jaw-animation-service-unit.test.js"
unit_result=$?
total_tests=$((total_tests + 1))
if [ $unit_result -eq 0 ]; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Run API Integration Tests
echo -e "${ORANGE}=== API INTEGRATION TESTS ===${NC}"
run_test_category "api" "API Integration Tests" "jaw-animation-super-power.test.js"
api_result=$?
total_tests=$((total_tests + 1))
if [ $api_result -eq 0 ]; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Run UI Tests (Desktop)
echo -e "${ORANGE}=== UI TESTS (DESKTOP) ===${NC}"
run_test_category "ui" "UI Tests (Desktop Bootstrap)" "jaw-animation-ui.spec.js"
ui_result=$?
total_tests=$((total_tests + 1))
if [ $ui_result -eq 0 ]; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Run UI Tests (Mobile)
echo -e "${ORANGE}=== UI TESTS (MOBILE) ===${NC}"
run_test_category "mobile" "UI Tests (Mobile Responsive)" "jaw-animation-ui.spec.js"
mobile_result=$?
total_tests=$((total_tests + 1))
if [ $mobile_result -eq 0 ]; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Generate test reports
echo -e "${ORANGE}=== GENERATING REPORTS ===${NC}"
echo -e "${PURPLE}📊 Generating HTML test report...${NC}"

# Combine Playwright reports if they exist
if [ -d "$RESULTS_DIR/jaw-animation-html-report" ]; then
    echo -e "${GREEN}✅ Playwright HTML report available at: $RESULTS_DIR/jaw-animation-html-report/index.html${NC}"
fi

# Generate summary report
SUMMARY_FILE="$RESULTS_DIR/jaw-animation-summary.html"
cat > "$SUMMARY_FILE" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jaw Animation Test Results 🎃</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #1a1a1a; color: #ffffff; }
        .card { background-color: #2d2d2d; border-color: #ff4500; }
        .text-halloween { color: #ff4500; }
        .bg-halloween { background-color: #ff4500; }
    </style>
</head>
<body>
    <div class="container mt-5">
        <div class="row justify-content-center">
            <div class="col-lg-8">
                <div class="card">
                    <div class="card-header bg-halloween text-white text-center">
                        <h1><i class="fas fa-magic"></i> Jaw Animation Test Results 🎃</h1>
                        <p class="mb-0">MonsterBox 4.0 Super Powers Test Suite</p>
                    </div>
                    <div class="card-body">
                        <div class="row text-center mb-4">
                            <div class="col-md-4">
                                <h3 class="text-success">$passed_tests</h3>
                                <p>Passed</p>
                            </div>
                            <div class="col-md-4">
                                <h3 class="text-danger">$failed_tests</h3>
                                <p>Failed</p>
                            </div>
                            <div class="col-md-4">
                                <h3 class="text-info">$total_tests</h3>
                                <p>Total</p>
                            </div>
                        </div>
                        
                        <div class="progress mb-4">
                            <div class="progress-bar bg-success" style="width: $(($passed_tests * 100 / $total_tests))%"></div>
                            <div class="progress-bar bg-danger" style="width: $(($failed_tests * 100 / $total_tests))%"></div>
                        </div>
                        
                        <div class="accordion">
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#unit-tests">
                                        Unit Tests $([ $unit_result -eq 0 ] && echo "✅" || echo "❌")
                                    </button>
                                </h2>
                                <div id="unit-tests" class="accordion-collapse collapse show">
                                    <div class="accordion-body">
                                        Service logic and method testing
                                        <br><strong>Status:</strong> $([ $unit_result -eq 0 ] && echo "<span class='text-success'>PASSED</span>" || echo "<span class='text-danger'>FAILED</span>")
                                    </div>
                                </div>
                            </div>
                            
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#api-tests">
                                        API Integration Tests $([ $api_result -eq 0 ] && echo "✅" || echo "❌")
                                    </button>
                                </h2>
                                <div id="api-tests" class="accordion-collapse collapse">
                                    <div class="accordion-body">
                                        REST API endpoints and integration
                                        <br><strong>Status:</strong> $([ $api_result -eq 0 ] && echo "<span class='text-success'>PASSED</span>" || echo "<span class='text-danger'>FAILED</span>")
                                    </div>
                                </div>
                            </div>
                            
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#ui-tests">
                                        UI Tests (Desktop) $([ $ui_result -eq 0 ] && echo "✅" || echo "❌")
                                    </button>
                                </h2>
                                <div id="ui-tests" class="accordion-collapse collapse">
                                    <div class="accordion-body">
                                        Bootstrap UI and user interactions
                                        <br><strong>Status:</strong> $([ $ui_result -eq 0 ] && echo "<span class='text-success'>PASSED</span>" || echo "<span class='text-danger'>FAILED</span>")
                                    </div>
                                </div>
                            </div>
                            
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#mobile-tests">
                                        UI Tests (Mobile) $([ $mobile_result -eq 0 ] && echo "✅" || echo "❌")
                                    </button>
                                </h2>
                                <div id="mobile-tests" class="accordion-collapse collapse">
                                    <div class="accordion-body">
                                        Responsive design and mobile interactions
                                        <br><strong>Status:</strong> $([ $mobile_result -eq 0 ] && echo "<span class='text-success'>PASSED</span>" || echo "<span class='text-danger'>FAILED</span>")
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mt-4 text-center">
                            <p><strong>Test Run:</strong> $(date)</p>
                            <p><strong>Framework:</strong> MonsterBox 4.0</p>
                            <p><strong>Theme:</strong> Halloween 🎃</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
EOF

echo -e "${GREEN}✅ Summary report generated: $SUMMARY_FILE${NC}"

# Final results
echo ""
echo -e "${ORANGE}============================================================${NC}"
echo -e "${ORANGE}🎃 JAW ANIMATION TEST SUITE RESULTS 🎃${NC}"
echo -e "${ORANGE}============================================================${NC}"
echo -e "${GREEN}✅ Passed: $passed_tests${NC}"
echo -e "${RED}❌ Failed: $failed_tests${NC}"
echo -e "${PURPLE}📊 Total:  $total_tests${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! The Jaw Animation Super Power is ready for Halloween! 🎃${NC}"
    echo -e "${GREEN}👻 Your MonsterBox characters can now animate their jaws with spooky precision!${NC}"
    exit 0
else
    echo -e "${RED}💀 SOME TESTS FAILED! Please check the logs and fix issues before deployment.${NC}"
    echo -e "${RED}🧙 The Halloween spirits are not pleased with these failures...${NC}"
    exit 1
fi