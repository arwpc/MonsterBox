#!/bin/bash
# Fix jaw animation server issues

echo "🔧 Fixing jaw animation server issues..."

# Configure git
echo "Setting up git configuration..."
ssh remote@192.168.8.130 << 'EOF'
cd /home/remote/MonsterBox
git config user.email "arwpersonal@gmail.com"
git config user.name "Aaron Warner"
echo "Git configured"

# Fix servo configuration
echo "Fixing servo configuration..."
sed -i 's/"pin": 3,/"pin": 18,/' data/parts.json
sed -i 's/"usePCA9685": true,/"usePCA9685": false,/' data/parts.json
sed -i 's/"channel": 0,/"channel": null,/' data/parts.json
echo "Servo configuration updated"

# Check for merge conflicts
echo "Checking for merge conflicts..."
if grep -r ">>>" . --include="*.js" --exclude-dir=node_modules; then
    echo "Found merge conflicts - need manual resolution"
else
    echo "No merge conflicts found"
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull origin Skulltalker

# Restart server
echo "Restarting server..."
pkill -f "node app.js"
sleep 2
nohup node app.js > server.log 2>&1 &
sleep 3

# Check server status
echo "Checking server status..."
if pgrep -f "node app.js" > /dev/null; then
    echo "✅ Server is running"
    echo "📄 Server log:"
    tail -5 server.log
else
    echo "❌ Server failed to start"
    echo "📄 Error log:"
    tail -10 server.log
fi

# Test deployment
echo "Testing deployment..."
if [ -f "test-jaw-animation-deployment.js" ]; then
    node test-jaw-animation-deployment.js
else
    echo "Test script not found - deployment test skipped"
fi

echo "🎯 Fix completed!"
EOF

echo "✅ Server fix completed!"
