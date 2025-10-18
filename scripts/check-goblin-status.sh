#!/bin/bash
#
# Check status of all Goblins and background processes
#

echo "🎃 MonsterBox Goblin Status Check"
echo "=================================="
echo ""

# Check background processes
echo "📋 Background Processes:"
echo "------------------------"

if ps aux | grep -q "[a]uto-deploy-goblins.sh"; then
    echo "✅ Auto-deploy monitor: RUNNING"
    echo "   Log: logs/auto-deploy-goblins.log"
else
    echo "❌ Auto-deploy monitor: NOT RUNNING"
fi

if ps aux | grep -q "[c]opy-usb-videos"; then
    echo "✅ USB copy processes: RUNNING"
    echo "   Logs: logs/usb-goblin*.log"
else
    echo "⚠️  USB copy processes: NOT RUNNING (may have completed)"
fi

echo ""

# Check Goblins
echo "👹 Goblin Status:"
echo "-----------------"

for goblin in "Goblin1:192.168.8.40" "Goblin2:192.168.8.161" "Goblin3:192.168.8.162"; do
    name=$(echo "$goblin" | cut -d: -f1)
    ip=$(echo "$goblin" | cut -d: -f2)
    
    echo ""
    echo "$name ($ip):"
    
    if ping -c 1 -W 2 "$ip" >/dev/null 2>&1; then
        echo "  🌐 Network: ONLINE"
        
        # Check Goblin service
        if curl -s -m 2 "http://${ip}:3001/health" >/dev/null 2>&1; then
            echo "  ✅ Service: RUNNING"
            
            # Get playback status
            status=$(curl -s -m 2 "http://${ip}:3001/status" 2>/dev/null)
            if [ -n "$status" ]; then
                playing=$(echo "$status" | jq -r '.playback.video.playing // false' 2>/dev/null)
                video=$(echo "$status" | jq -r '.playback.video.file // "none"' 2>/dev/null)
                
                if [ "$playing" = "true" ]; then
                    echo "  🎬 Video: PLAYING - $video"
                else
                    echo "  ⏸️  Video: STOPPED"
                fi
                
                # Count videos
                video_count=$(curl -s -m 2 "http://${ip}:3001/media" 2>/dev/null | jq -r '.media.video | length' 2>/dev/null)
                if [ -n "$video_count" ] && [ "$video_count" != "null" ]; then
                    echo "  📹 Videos: $video_count files"
                fi
            fi
        else
            echo "  ❌ Service: NOT RUNNING"
        fi
    else
        echo "  ❌ Network: OFFLINE"
    fi
done

echo ""
echo ""

# Check recent logs
echo "📝 Recent Activity:"
echo "-------------------"

if [ -f "logs/auto-deploy-goblins.log" ]; then
    echo ""
    echo "Auto-deploy log (last 5 lines):"
    tail -5 logs/auto-deploy-goblins.log | sed 's/^/  /'
fi

if ls logs/usb-goblin*.log >/dev/null 2>&1; then
    echo ""
    echo "USB copy logs:"
    for log in logs/usb-goblin*.log; do
        echo "  $(basename "$log"):"
        tail -3 "$log" | sed 's/^/    /'
    done
fi

echo ""
echo "=================================="
echo "Run this script anytime: ./scripts/check-goblin-status.sh"

