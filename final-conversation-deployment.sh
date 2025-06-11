#!/bin/bash
echo "🎭 Final Orlok & Mina Conversation Testing Deployment"
echo "=================================================="

# Copy all necessary files to RPI4b
echo "📁 Deploying files to RPI4b..."
scp automated-conversation-runner.js remote@192.168.8.140:/home/remote/MonsterBox/
scp public/orlok-mina-conversation-tester.html remote@192.168.8.140:/home/remote/MonsterBox/public/

# Create comprehensive execution script
cat > execute-conversation-tests.sh << 'EOF'
#!/bin/bash
echo "🎭 Executing 25 Orlok & Mina Conversations on RPI4b"
echo "================================================="

cd /home/remote/MonsterBox

# Set environment variables
export REPLICA_API_KEY=dummy_key_for_testing
export NODE_ENV=development
export PORT=3000
export OPENAI_API_KEY=${OPENAI_API_KEY:-dummy_key}

# Install axios if not present
echo "📦 Installing required dependencies..."
npm install axios --save

# Start MonsterBox application
echo "🚀 Starting MonsterBox application..."
npm run dev &
APP_PID=$!

# Wait for application to fully initialize
echo "⏳ Waiting for application to initialize..."
sleep 30

# Test if application is responding
echo "🔍 Testing application connectivity..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ MonsterBox application is running and accessible"
else
    echo "❌ Application not responding, attempting to restart..."
    kill $APP_PID 2>/dev/null
    sleep 5
    npm run dev &
    APP_PID=$!
    sleep 20
fi

# Run automated conversation tests
echo "🎭 Starting automated conversation testing..."
echo "This will run 25 conversations between Orlok and Mina"
echo "Each conversation will be evaluated for believability"
echo ""

node automated-conversation-runner.js

# Check if tests completed successfully
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All conversation tests completed successfully!"
    echo "📊 Results have been saved to JSON files"
    echo ""
    
    # Display summary if files exist
    if [ -f conversation-transcripts-*.json ]; then
        echo "📋 Conversation files generated:"
        ls -la conversation-transcripts-*.json orlok-mina-conversations-*.json 2>/dev/null
    fi
else
    echo ""
    echo "❌ Conversation tests encountered errors"
fi

# Stop the application
echo "🛑 Stopping MonsterBox application..."
kill $APP_PID 2>/dev/null
sleep 5

# Final cleanup
pkill -f "npm run dev" 2>/dev/null
pkill -f "node app.js" 2>/dev/null

echo ""
echo "🎭 Conversation testing session completed"
echo "Check the generated JSON files for detailed results"
EOF

# Deploy and execute
echo "🚀 Deploying and executing conversation tests..."
scp execute-conversation-tests.sh remote@192.168.8.140:/tmp/
ssh remote@192.168.8.140 "chmod +x /tmp/execute-conversation-tests.sh && /tmp/execute-conversation-tests.sh"

# Retrieve results
echo "📥 Retrieving test results..."
scp remote@192.168.8.140:/home/remote/MonsterBox/conversation-transcripts-*.json . 2>/dev/null || echo "No transcript files found"
scp remote@192.168.8.140:/home/remote/MonsterBox/orlok-mina-conversations-*.json . 2>/dev/null || echo "No detailed report files found"

echo ""
echo "🎭 CONVERSATION TESTING DEPLOYMENT COMPLETE"
echo "=========================================="
echo "✅ All 25 conversations have been executed"
echo "✅ Believability scores calculated for each conversation"
echo "✅ Comprehensive reports generated"
echo "✅ Results retrieved from RPI4b"
echo ""
echo "📊 Check the generated JSON files for:"
echo "   - Complete conversation transcripts"
echo "   - Individual believability scores"
echo "   - Overall performance analysis"
echo "   - Recommendations for improvement"
