#!/bin/bash

# Fix Goblin Auto-Play - Add auto-play call to server.js

GOBLIN_IP="$1"
PASSWORD="klrklr89!"

if [ -z "$GOBLIN_IP" ]; then
    echo "Usage: $0 <goblin_ip>"
    echo "Example: $0 192.168.8.160"
    exit 1
fi

echo "🎃 Adding auto-play to Goblin at $GOBLIN_IP"
echo "==========================================="
echo ""

# Create the fix script that will run on the goblin
cat > /tmp/goblin-autoplay-fix.sh << 'FIXSCRIPT'
#!/bin/bash

cd /home/remote/goblin

echo "🔧 Checking if auto-play is already called..."
if grep -q "await this.autoPlayFirstVideo()" server.js; then
    echo "✅ Auto-play already configured!"
    exit 0
fi

echo "📦 Creating backup..."
cp server.js server.js.backup-autoplay-$(date +%Y%m%d-%H%M%S)

echo "🎬 Adding auto-play call..."

# Find the line with "ready for haunting" and add auto-play after it
LINE_NUM=$(grep -n "ready for haunting" server.js | cut -d: -f1)

if [ -z "$LINE_NUM" ]; then
    echo "❌ Could not find insertion point"
    exit 1
fi

# Insert the auto-play call after the "ready for haunting" line
sed -i "${LINE_NUM}a\\
\\
      // AUTO-PLAY FIRST VIDEO ON STARTUP\\
      await this.autoPlayFirstVideo();" server.js

echo "✅ Auto-play call added!"
echo ""
echo "🔄 Restarting goblin service..."
sudo systemctl restart goblin

sleep 3

echo ""
echo "📊 Service status:"
sudo systemctl status goblin --no-pager -l | head -15

echo ""
echo "📋 Checking logs for auto-play..."
sleep 2
tail -20 /home/remote/goblin/logs/goblin.log | grep -E "Auto-play|ready for haunting"
FIXSCRIPT

# Copy the fix script to the goblin
echo "📤 Copying fix script to goblin..."
sshpass -p "$PASSWORD" scp /tmp/goblin-autoplay-fix.sh remote@$GOBLIN_IP:/tmp/

# Run the fix script on the goblin
echo "🔧 Running fix script on goblin..."
sshpass -p "$PASSWORD" ssh remote@$GOBLIN_IP "chmod +x /tmp/goblin-autoplay-fix.sh && /tmp/goblin-autoplay-fix.sh"

# Clean up
rm /tmp/goblin-autoplay-fix.sh

echo ""
echo "🎉 Auto-play fix complete!"

