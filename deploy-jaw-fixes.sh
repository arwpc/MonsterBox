#!/bin/bash
# Deploy jaw animation fixes to server

echo "🚀 Deploying jaw animation fixes..."

# SSH to server and update
ssh remote@192.168.8.130 << 'EOF'
cd /home/remote/MonsterBox
echo "📥 Pulling latest changes..."
git pull origin Skulltalker

echo "🔄 Restarting server..."
pkill -f "node app.js"
sleep 2
nohup node app.js > server.log 2>&1 &

echo "⏳ Waiting for server to start..."
sleep 5

echo "✅ Deployment complete!"
echo "🌐 Test page: http://192.168.8.130:3000/jaw-animation/test"

# Check if server is running
if pgrep -f "node app.js" > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server failed to start"
    tail -10 server.log
fi
EOF

echo "🎯 Deployment finished!"
