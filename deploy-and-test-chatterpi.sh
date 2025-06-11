#!/bin/bash
echo "🎃 ChatterPi Deployment and Testing Script for Skulltalker RPI4b"
echo "=================================================================="

# Configuration
REMOTE_HOST="192.168.8.130"
REMOTE_USER="remote"
REMOTE_PATH="/home/remote/MonsterBox"
LOCAL_PATH="."

echo "📡 Step 1: Testing SSH connectivity..."
if ssh -o ConnectTimeout=10 ${REMOTE_USER}@${REMOTE_HOST} 'echo "SSH connection successful"'; then
    echo "✅ SSH connection to ${REMOTE_HOST} successful"
else
    echo "❌ SSH connection failed. Please check:"
    echo "   - Network connectivity to ${REMOTE_HOST}"
    echo "   - SSH keys are properly configured"
    echo "   - Remote user '${REMOTE_USER}' exists"
    exit 1
fi

echo "📂 Step 2: Checking/Creating MonsterBox directory..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    if [ ! -d '${REMOTE_PATH}' ]; then
        echo 'Creating MonsterBox directory...'
        mkdir -p ${REMOTE_PATH}
        cd ${REMOTE_PATH}
        git clone https://github.com/arwpc/MonsterBox.git .
    else
        echo 'MonsterBox directory exists'
        cd ${REMOTE_PATH}
        git pull origin main
    fi
"

echo "📦 Step 3: Installing dependencies..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    cd ${REMOTE_PATH}
    npm install
"

echo "🔧 Step 4: Setting up environment..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    cd ${REMOTE_PATH}
    export AGENT_ID=agent-2
    export AGENT_FOCUS=chatterpi-chat
    export NODE_ENV=development
    export PORT=3000
"

echo "🚀 Step 5: Starting MonsterBox application..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    cd ${REMOTE_PATH}
    pkill -f 'node.*app.js' 2>/dev/null || true
    pkill -f 'npm.*dev' 2>/dev/null || true
    nohup npm run dev > app.log 2>&1 &
    sleep 15
"

echo "🧪 Step 6: Testing ChatterPi pages..."
echo "Testing main application..."
if curl -s -f http://${REMOTE_HOST}:3000 > /dev/null; then
    echo "✅ Main application is running"
else
    echo "❌ Main application is not accessible"
fi

echo "Testing ChatterPi Chat page..."
if curl -s -f http://${REMOTE_HOST}:3000/chatterpi-chat.html > /dev/null; then
    echo "✅ ChatterPi Chat page is accessible"
    echo "🎯 URL: http://${REMOTE_HOST}:3000/chatterpi-chat.html"
else
    echo "❌ ChatterPi Chat page is not accessible"
fi

echo "Testing ChatterPi AI Chat page..."
if curl -s -f http://${REMOTE_HOST}:3000/chatterpi-ai-chat.html > /dev/null; then
    echo "✅ ChatterPi AI Chat page is accessible"
    echo "🎯 URL: http://${REMOTE_HOST}:3000/chatterpi-ai-chat.html"
else
    echo "❌ ChatterPi AI Chat page is not accessible"
fi

echo "🔍 Step 7: Hardware verification..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    echo 'Checking GPIO pin 18 (jaw servo)...'
    if command -v gpio >/dev/null 2>&1; then
        gpio mode 18 pwm 2>/dev/null && echo '✅ GPIO pin 18 available for PWM' || echo '⚠️ GPIO pin 18 setup may need configuration'
    else
        echo '⚠️ WiringPi gpio command not found - install with: sudo apt install wiringpi'
    fi
    
    echo 'Checking system resources...'
    echo \"CPU: \$(top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1)%\"
    echo \"Memory: \$(free | grep Mem | awk '{printf \"%.1f%%\", \$3/\$2 * 100.0}')\"
    echo \"Temperature: \$(vcgencmd measure_temp 2>/dev/null || echo 'N/A')\"
"

echo "📊 Step 8: Application status..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    cd ${REMOTE_PATH}
    echo 'Node.js processes:'
    ps aux | grep node | grep -v grep || echo 'No Node.js processes found'
    
    echo 'Port 3000 status:'
    netstat -tlnp | grep :3000 || echo 'Port 3000 not in use'
    
    echo 'Recent application logs:'
    tail -10 app.log 2>/dev/null || echo 'No app.log found'
"

echo "=================================================================="
echo "🎃 ChatterPi Deployment Complete!"
echo ""
echo "📱 Test URLs:"
echo "   Main App: http://${REMOTE_HOST}:3000"
echo "   ChatterPi Chat: http://${REMOTE_HOST}:3000/chatterpi-chat.html"
echo "   ChatterPi AI Chat: http://${REMOTE_HOST}:3000/chatterpi-ai-chat.html"
echo ""
echo "🦴 Jaw Animation WebSocket: ws://${REMOTE_HOST}:3000/jaw-animation"
echo "🔧 GPIO Pin 18: Configured for MG90S servo control"
echo "=================================================================="
