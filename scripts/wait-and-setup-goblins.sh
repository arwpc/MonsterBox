#!/bin/bash
#
# Wait for Goblin2 and Goblin3 to come back online after reboot
# Then complete setup and start fire videos
#

GOBLIN2_IP="192.168.8.106"
GOBLIN3_IP="192.168.8.14"
SSH_PASS="klrklr89!"

LOG_FILE="/home/remote/MonsterBox/logs/goblin-reboot-setup.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🎃 Waiting for Goblin2 and Goblin3 to reboot..."
log "   Goblin2: $GOBLIN2_IP"
log "   Goblin3: $GOBLIN3_IP"
log ""

GOBLIN2_READY=false
GOBLIN3_READY=false

# Function to check if SSH is ready
check_ssh_ready() {
    local ip="$1"
    timeout 5 ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 -o BatchMode=yes remote@$ip 'echo ready' 2>&1 | grep -q "Permission denied"
}

# Function to setup goblin
setup_goblin() {
    local ip="$1"
    local name="$2"
    local goblin_id="$3"
    
    log ""
    log "🔧 Setting up $name ($ip)..."
    
    # Create expect script for SSH commands
    cat > /tmp/setup-${goblin_id}.exp << 'EXPECTSCRIPT'
#!/usr/bin/expect -f
set timeout 30
set ip [lindex $argv 0]
set name [lindex $argv 1]

spawn ssh -o StrictHostKeyChecking=no remote@$ip

expect {
    "password:" {
        send "klrklr89!\r"
        exp_continue
    }
    "$ " {
        send "cd /home/remote/goblin\r"
        expect "$ "
        
        send "echo 'klrklr89!' | sudo -S systemctl daemon-reload\r"
        expect "$ "
        
        send "echo 'klrklr89!' | sudo -S systemctl enable monsterbox-goblin\r"
        expect "$ "
        
        send "echo 'klrklr89!' | sudo -S systemctl start monsterbox-goblin\r"
        expect "$ "
        
        send "sleep 3\r"
        expect "$ "
        
        send "echo 'klrklr89!' | sudo -S systemctl status monsterbox-goblin --no-pager | head -10\r"
        expect "$ "
        
        send "exit\r"
    }
}

expect eof
EXPECTSCRIPT
    
    chmod +x /tmp/setup-${goblin_id}.exp
    /tmp/setup-${goblin_id}.exp "$ip" "$name" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "   ✅ Service started on $name"
        return 0
    else
        log "   ⚠️  Service start may have failed on $name"
        return 1
    fi
}

# Function to copy videos
copy_videos() {
    local ip="$1"
    local name="$2"
    
    log "   📹 Copying videos to $name..."
    
    cat > /tmp/copy-videos.exp << 'EXPECTSCRIPT'
#!/usr/bin/expect -f
set timeout 60
set ip [lindex $argv 0]

spawn scp -o StrictHostKeyChecking=no /home/remote/MonsterBox/data/goblin-videos/*.mp4 remote@$ip:/home/remote/goblin/media/video/

expect {
    "password:" {
        send "klrklr89!\r"
        exp_continue
    }
    eof
}
EXPECTSCRIPT
    
    chmod +x /tmp/copy-videos.exp
    /tmp/copy-videos.exp "$ip" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "   ✅ Videos copied to $name"
        return 0
    else
        log "   ⚠️  Video copy may have failed for $name"
        return 1
    fi
}

# Function to start fire video
start_fire_video() {
    local ip="$1"
    local name="$2"
    
    log "   🔥 Starting fire video on $name..."
    
    sleep 2
    
    result=$(curl -s -X POST "http://${ip}:3001/play-video" \
        -H "Content-Type: application/json" \
        -d '{"filename": "c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4", "loop": true}' 2>&1)
    
    if echo "$result" | grep -q '"success":true'; then
        log "   🔥 FIRE PLAYING on $name! 🔥"
        return 0
    else
        log "   ⚠️  Failed to start video on $name"
        log "   Response: $result"
        return 1
    fi
}

# Main loop - wait for Goblins to come online
log "🔄 Checking every 5 seconds..."
log ""

while true; do
    # Check Goblin2
    if [ "$GOBLIN2_READY" = false ]; then
        if check_ssh_ready "$GOBLIN2_IP"; then
            log "🎯 Goblin2 is back online!"
            
            if setup_goblin "$GOBLIN2_IP" "Goblin2" "goblin2"; then
                sleep 3
                if copy_videos "$GOBLIN2_IP" "Goblin2"; then
                    sleep 2
                    if start_fire_video "$GOBLIN2_IP" "Goblin2"; then
                        GOBLIN2_READY=true
                    fi
                fi
            fi
        fi
    fi
    
    # Check Goblin3
    if [ "$GOBLIN3_READY" = false ]; then
        if check_ssh_ready "$GOBLIN3_IP"; then
            log "🎯 Goblin3 is back online!"
            
            if setup_goblin "$GOBLIN3_IP" "Goblin3" "goblin3"; then
                sleep 3
                if copy_videos "$GOBLIN3_IP" "Goblin3"; then
                    sleep 2
                    if start_fire_video "$GOBLIN3_IP" "Goblin3"; then
                        GOBLIN3_READY=true
                    fi
                fi
            fi
        fi
    fi
    
    # Exit if both ready
    if [ "$GOBLIN2_READY" = true ] && [ "$GOBLIN3_READY" = true ]; then
        log ""
        log "🎃 ALL GOBLINS ARE RUNNING FIRE! 🔥🔥🔥"
        log ""
        log "Summary:"
        log "  Goblin1 (192.168.8.40): 🔥 FIRE"
        log "  Goblin2 ($GOBLIN2_IP): 🔥 FIRE"
        log "  Goblin3 ($GOBLIN3_IP): 🔥 FIRE"
        log ""
        log "Check status: ./scripts/check-goblin-status.sh"
        exit 0
    fi
    
    # Wait before next check
    sleep 5
done

