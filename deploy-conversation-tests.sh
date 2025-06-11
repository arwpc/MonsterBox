#!/bin/bash
echo "🎭 Deploying Orlok & Mina Conversation Tests to RPI4b"
echo "===================================================="

# Copy test files to RPI4b
echo "📁 Copying test files..."
scp tests/orlok-mina-conversation-test.js remote@192.168.8.140:/home/remote/MonsterBox/tests/
scp scripts/chatterpi/ai_integration.js remote@192.168.8.140:/home/remote/MonsterBox/scripts/chatterpi/

# Create comprehensive test runner script
cat > run-conversation-tests.sh << 'EOF'
#!/bin/bash
echo "🎭 Starting Orlok & Mina Conversation Tests on RPI4b"
echo "=================================================="

cd /home/remote/MonsterBox

# Set environment variables
export REPLICA_API_KEY=dummy_key_for_testing
export NODE_ENV=test
export OPENAI_API_KEY=${OPENAI_API_KEY:-dummy_key}

# Install puppeteer if not present
echo "📦 Installing puppeteer..."
npm install puppeteer --save-dev

# Start MonsterBox application in background
echo "🚀 Starting MonsterBox application..."
npm run dev &
APP_PID=$!

# Wait for application to start
echo "⏳ Waiting for application to initialize..."
sleep 20

# Check if application is running
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ MonsterBox application is running"
else
    echo "❌ Failed to start MonsterBox application"
    kill $APP_PID 2>/dev/null
    exit 1
fi

# Run conversation tests
echo "🎭 Running 25 Orlok & Mina conversation tests..."
npm test -- tests/orlok-mina-conversation-test.js

# Kill application
echo "🛑 Stopping MonsterBox application..."
kill $APP_PID 2>/dev/null

echo "✅ Conversation tests completed"
EOF

# Copy and execute test runner
scp run-conversation-tests.sh remote@192.168.8.140:/tmp/
ssh remote@192.168.8.140 "chmod +x /tmp/run-conversation-tests.sh && /tmp/run-conversation-tests.sh"
