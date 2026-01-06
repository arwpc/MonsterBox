#!/bin/bash

echo "🚨 EMERGENCY AUDIO LIBRARY REPAIR 🚨"
echo "======================================"
echo ""

# First, fix the local corrupted library.json
echo "🔧 Fixing local corrupted library.json..."

# Create a minimal valid library.json
cat > /home/remote/MonsterBox/data/audio-library/library.json << 'EOF'
{
  "version": "1.0.0",
  "createdAt": "2025-11-01T12:00:00.000Z",
  "lastModified": "2025-11-01T12:00:00.000Z",
  "categories": [
    "monster-sounds",
    "ambient",
    "halloween",
    "classic-horror",
    "dialogue",
    "music",
    "effects"
  ],
  "tags": [
    "scary",
    "atmospheric",
    "haunting",
    "dramatic",
    "spooky",
    "creepy"
  ],
  "audioFiles": []
}
EOF

echo "✅ Local library.json repaired with minimal structure"
echo ""

# Animatronic IPs and names
declare -A ANIMATRONICS
ANIMATRONICS[orlok]="192.168.8.120"
ANIMATRONICS[coffin]="192.168.8.140"
ANIMATRONICS[skulltalker]="192.168.8.130"
ANIMATRONICS[groundbreaker]="192.168.8.200"
ANIMATRONICS[pumpkinhead]="192.168.8.150"

# Function to check and repair a single animatronic
repair_animatronic() {
    local name=$1
    local ip=$2
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔧 Repairing $name ($ip)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test connectivity
    if ! ping -c 1 -W 2 $ip >/dev/null 2>&1; then
        echo "❌ $name is unreachable - skipping"
        return 1
    fi
    
    echo "📡 $name is reachable"
    
    # Check if SSH works
    if ! sshpass -p 'klrklr89!' ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no remote@$ip "echo 'SSH OK'" >/dev/null 2>&1; then
        echo "❌ Cannot SSH to $name - skipping"
        return 1
    fi
    
    echo "🔑 SSH connection established"
    
    # Create backup and repair library.json
    sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@$ip << 'ENDSSH'
# Create backup directory
mkdir -p ~/MonsterBox/data/audio-library/backup

# Backup corrupted file if it exists
if [ -f ~/MonsterBox/data/audio-library/library.json ]; then
    cp ~/MonsterBox/data/audio-library/library.json ~/MonsterBox/data/audio-library/backup/library.json.corrupted.$(date +%Y%m%d_%H%M%S)
    echo "📁 Backed up corrupted library.json"
fi

# Create clean library.json
cat > ~/MonsterBox/data/audio-library/library.json << 'EOF'
{
  "version": "1.0.0",
  "createdAt": "2025-11-01T12:00:00.000Z",
  "lastModified": "2025-11-01T12:00:00.000Z",
  "categories": [
    "monster-sounds",
    "ambient",
    "halloween",
    "classic-horror",
    "dialogue",
    "music",
    "effects"
  ],
  "tags": [
    "scary",
    "atmospheric",
    "haunting",
    "dramatic",
    "spooky",
    "creepy"
  ],
  "audioFiles": []
}
EOF

echo "✅ Clean library.json created"

# Ensure audio directory exists
mkdir -p ~/MonsterBox/data/audio-library/uploads

# Check if MonsterBox process is running
if pgrep -f "node.*server.js" > /dev/null; then
    echo "🔄 Restarting MonsterBox service..."
    pkill -f "node.*server.js"
    sleep 3
    cd ~/MonsterBox
    nohup npm start > /tmp/monsterbox.log 2>&1 &
    sleep 5
    
    if pgrep -f "node.*server.js" > /dev/null; then
        echo "✅ MonsterBox service restarted successfully"
    else
        echo "❌ Failed to restart MonsterBox service"
    fi
else
    echo "🚀 Starting MonsterBox service..."
    cd ~/MonsterBox
    nohup npm start > /tmp/monsterbox.log 2>&1 &
    sleep 5
    
    if pgrep -f "node.*server.js" > /dev/null; then
        echo "✅ MonsterBox service started successfully"
    else
        echo "❌ Failed to start MonsterBox service"
    fi
fi
ENDSSH

    if [ $? -eq 0 ]; then
        echo "✅ $name repaired successfully"
        
        # Test the web interface
        sleep 2
        if curl -s --connect-timeout 5 http://$ip:3000/ | grep -q "MonsterBox"; then
            echo "🌐 Web interface is responding"
        else
            echo "⚠️ Web interface may not be fully ready yet"
        fi
    else
        echo "❌ Failed to repair $name"
    fi
    
    echo ""
}

# Repair all animatronics
echo "🎃 Starting repair process for all animatronics..."
echo ""

for name in "${!ANIMATRONICS[@]}"; do
    ip="${ANIMATRONICS[$name]}"
    repair_animatronic "$name" "$ip"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 REPAIR SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check final status
for name in "${!ANIMATRONICS[@]}"; do
    ip="${ANIMATRONICS[$name]}"
    echo -n "$name ($ip): "
    
    if curl -s --connect-timeout 3 http://$ip:3000/ | grep -q "MonsterBox"; then
        echo "✅ ONLINE"
    else
        echo "❌ OFFLINE"
    fi
done

echo ""
echo "🎃 Emergency repair complete!"
echo "🌐 Access dashboards:"
for name in "${!ANIMATRONICS[@]}"; do
    ip="${ANIMATRONICS[$name]}"
    echo "  • $name: http://$ip:3000"
done