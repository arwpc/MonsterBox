#!/bin/bash

# Fix Goblin Video Playback - REAL FIX
# Updates the ACTUAL goblin directory with proper fixes

GOBLIN_IP="$1"
PASSWORD="klrklr89!"

if [ -z "$GOBLIN_IP" ]; then
    echo "Usage: $0 <goblin_ip>"
    echo "Example: $0 192.168.8.160"
    exit 1
fi

echo "🎃 Fixing Goblin at $GOBLIN_IP"
echo "================================"
echo ""

# Create the fix script that will run on the goblin
cat > /tmp/goblin-fix.sh << 'FIXSCRIPT'
#!/bin/bash

echo "🔧 Applying fixes to /home/remote/goblin/"
cd /home/remote/goblin

# Backup current files
echo "📦 Creating backups..."
cp mediaPlayer.js mediaPlayer.js.backup-$(date +%Y%m%d-%H%M%S)
cp server.js server.js.backup-$(date +%Y%m%d-%H%M%S)

# Fix 1: Change resolution to 720p60 for smooth playback
echo "🎬 Fixing video resolution (1080p60 -> 720p60)..."
sed -i "s/'--drm-mode=1920x1080@60'/'--drm-mode=1280x720@60'/g" mediaPlayer.js
sed -i "s/'--vf=scale=1920:1080'/'--vf=scale=1280:720'/g" mediaPlayer.js

# Fix 2: Enable loop by default (change "if (options.loop)" to "if (options.loop !== false)")
echo "🔁 Enabling loop by default..."
sed -i 's/if (options\.loop)/if (options.loop !== false)/g' mediaPlayer.js

# Fix 3: Change server.js default loop from false to true
echo "🔁 Changing server default loop to true..."
sed -i 's/loop = false/loop = true/g' server.js

# Fix 4: Suppress all console output to prevent text on HDMI
echo "🔇 Suppressing console output..."
sed -i "s/stdio: \['pipe', 'pipe', 'pipe'\]/stdio: ['ignore', 'ignore', 'ignore']/g" mediaPlayer.js

# Fix 5: Add auto-play on startup
echo "🎬 Adding auto-play on startup..."
if ! grep -q "autoPlayFirstVideo" server.js; then
    # Find the line with "console.log('✅ Goblin" and add auto-play after it
    sed -i "/console\.log('✅ Goblin.*ready/a\\
\\
      // AUTO-PLAY FIRST VIDEO ON STARTUP\\
      await this.autoPlayFirstVideo();\\
" server.js

    # Add the autoPlayFirstVideo method before the last closing brace
    cat >> server.js << 'AUTOPLAY'

  /**
   * Auto-play first available video on startup
   */
  async autoPlayFirstVideo() {
    try {
      console.log('🎬 Auto-play: Looking for first video...');
      
      // Wait 2 seconds for file system to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mediaList = this.fileManager.getMediaList();
      
      if (mediaList.video && mediaList.video.length > 0) {
        const firstVideo = mediaList.video[0];
        console.log(\`🎬 Auto-play: Playing \${firstVideo.name}\`);
        
        // Play with loop enabled by default
        await this.mediaPlayer.playVideo(firstVideo.path, { 
          loop: true,
          volume: 0.8 
        });
        
        console.log('🎬 Auto-play: Video started successfully');
      } else {
        console.log('🎬 Auto-play: No videos found');
      }
    } catch (error) {
      console.error('❌ Auto-play failed:', error);
      // Don't crash the server if auto-play fails
    }
  }
AUTOPLAY
fi

echo ""
echo "✅ Fixes applied!"
echo ""
echo "📋 Changes made:"
echo "   1. Resolution: 1080p60 -> 720p60 (smoother playback)"
echo "   2. Loop: Enabled by default (videos loop forever)"
echo "   3. Console: Output suppressed (no text on HDMI)"
echo "   4. Auto-play: First video plays on boot"
echo ""
echo "🔄 Restarting goblin service..."
sudo systemctl restart goblin

echo ""
echo "✅ Goblin fixed and restarted!"
echo ""
echo "📊 Service status:"
sudo systemctl status goblin --no-pager -l | head -15
FIXSCRIPT

# Copy the fix script to the goblin
echo "📤 Copying fix script to goblin..."
sshpass -p "$PASSWORD" scp /tmp/goblin-fix.sh remote@$GOBLIN_IP:/tmp/

# Run the fix script on the goblin
echo "🔧 Running fix script on goblin..."
sshpass -p "$PASSWORD" ssh remote@$GOBLIN_IP "chmod +x /tmp/goblin-fix.sh && /tmp/goblin-fix.sh"

# Clean up
rm /tmp/goblin-fix.sh

echo ""
echo "🎉 Goblin fix complete!"
echo ""
echo "🧪 Test checklist:"
echo "   1. Check HDMI - should see video playing (no text)"
echo "   2. Wait for video to end - should loop automatically"
echo "   3. Video should be smooth (not choppy)"
echo "   4. Reboot goblin - first video should auto-play"
echo ""

