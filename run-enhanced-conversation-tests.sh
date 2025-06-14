#!/bin/bash

# Enhanced Orlok & Mina Conversation Testing with Performance Optimization
# This script runs 3 iterations of 25 conversations each, with improvements between iterations

echo "🎭 ENHANCED ORLOK & MINA CONVERSATION TESTING"
echo "=============================================="
echo "📊 Testing 25 conversations across 3 iterations"
echo "🎯 Focus: Believability scoring + Performance optimization"
echo "⚡ Target: <3s response time, 75+ believability score"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Check if the enhanced tester exists
if [ ! -f "enhanced-conversation-tester.js" ]; then
    echo "❌ enhanced-conversation-tester.js not found"
    exit 1
fi

# Check if required dependencies are available
echo "🔍 Checking dependencies..."
if ! node -e "require('axios'); require('fs'); require('path')" 2>/dev/null; then
    echo "⚠️ Installing required dependencies..."
    npm install axios
fi

# Check if the local MonsterBox API is accessible
echo "🔗 Checking local MonsterBox API connectivity..."
if curl -s --connect-timeout 5 "http://localhost:3000/health" > /dev/null 2>&1; then
    echo "✅ Local MonsterBox API is accessible"
else
    echo "❌ Local MonsterBox API is not accessible at http://localhost:3000"
    echo "   Please ensure the MonsterBox server is running locally"
    exit 1
fi

# Create results directory
RESULTS_DIR="conversation-test-results-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"
cd "$RESULTS_DIR"

# Copy the tester script
cp "../enhanced-conversation-tester.js" .

echo ""
echo "🚀 Starting Enhanced Conversation Testing..."
echo "📁 Results will be saved in: $RESULTS_DIR"
echo ""

# Run the enhanced conversation tester
node enhanced-conversation-tester.js

# Check if the test completed successfully
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Enhanced conversation testing completed successfully!"
    echo ""
    echo "📊 RESULTS SUMMARY"
    echo "=================="
    echo "📁 Results directory: $RESULTS_DIR"
    echo "📄 Files generated:"
    ls -la *.json 2>/dev/null | while read line; do
        echo "   📄 $line"
    done
    
    echo ""
    echo "🎯 KEY METRICS TO REVIEW:"
    echo "========================"
    echo "1. 📈 Believability progression across iterations"
    echo "2. ⚡ Response time optimization"
    echo "3. 💬 Conversation length and engagement"
    echo "4. 🎭 Character consistency (especially Orlok's short responses)"
    echo "5. 🔄 Improvement effectiveness between iterations"
    
    echo ""
    echo "📋 NEXT STEPS:"
    echo "=============="
    echo "1. Review the final-conversation-report-*.json for comprehensive analysis"
    echo "2. Check iteration-*-results-*.json for detailed per-iteration data"
    echo "3. Implement the suggested improvements in the AI configuration"
    echo "4. Consider running additional iterations if targets weren't met"
    
else
    echo ""
    echo "❌ Enhanced conversation testing failed!"
    echo "📋 Troubleshooting steps:"
    echo "1. Check MonsterBox API connectivity"
    echo "2. Verify AI character configurations"
    echo "3. Review error logs above"
    echo "4. Ensure sufficient system resources"
fi

echo ""
echo "🎭 Enhanced Conversation Testing Complete"
echo "========================================"
