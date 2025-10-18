#!/bin/bash
#
# Auto-deploy Goblins when they come online
# Monitors for Goblin2 and Goblin3, deploys via facehugger when detected
#

GOBLIN2_IP="192.168.8.161"
GOBLIN3_IP="192.168.8.162"
SSH_PASS="klrklr89!"
MONSTERBOX_URL="http://localhost:3000"

LOG_FILE="/home/remote/MonsterBox/logs/auto-deploy-goblins.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🎃 Auto-deploy Goblins started"
log "   Monitoring: Goblin2 ($GOBLIN2_IP), Goblin3 ($GOBLIN3_IP)"

GOBLIN2_DEPLOYED=false
GOBLIN3_DEPLOYED=false

# Function to deploy goblin via facehugger API
deploy_goblin() {
    local goblin_id="$1"
    local goblin_ip="$2"
    local goblin_name="$3"
    
    log ""
    log "👽 Deploying $goblin_name via FACEHUGGER..."
    
    curl -s -X POST "${MONSTERBOX_URL}/goblin-management/api/deploy-and-register" \
        -H "Content-Type: application/json" \
        -d "{
            \"goblinData\": {
                \"goblinId\": \"$goblin_id\",
                \"endpoint\": \"http://${goblin_ip}:3001\",
                \"capabilities\": [\"video\", \"audio\"],
                \"metadata\": {
                    \"name\": \"$goblin_name\",
                    \"location\": \"Halloween Display\",
                    \"description\": \"Video display goblin\"
                }
            },
            \"sshPassword\": \"$SSH_PASS\"
        }" 2>&1 | while IFS= read -r line; do
            if [[ "$line" == data:* ]]; then
                # Extract JSON from SSE data line
                json="${line#data: }"
                
                # Parse message
                message=$(echo "$json" | jq -r '.message // empty' 2>/dev/null)
                if [ -n "$message" ]; then
                    log "   $message"
                fi
                
                # Check if final
                is_final=$(echo "$json" | jq -r '.final // false' 2>/dev/null)
                if [ "$is_final" = "true" ]; then
                    success=$(echo "$json" | jq -r '.success // false' 2>/dev/null)
                    if [ "$success" = "true" ]; then
                        log "   ✅ $goblin_name deployed successfully!"
                        return 0
                    else
                        error=$(echo "$json" | jq -r '.error // "Unknown error"' 2>/dev/null)
                        log "   ❌ Deployment failed: $error"
                        return 1
                    fi
                fi
            fi
        done
}

# Function to start video playback
start_video_playback() {
    local goblin_ip="$1"
    local goblin_name="$2"
    
    log "   🎬 Starting video playback on $goblin_name..."
    
    # Get list of available videos
    videos=$(curl -s "http://${goblin_ip}:3001/media" | jq -r '.media.video[]?' 2>/dev/null | head -1)
    
    if [ -n "$videos" ]; then
        # Play first video on loop
        result=$(curl -s -X POST "http://${goblin_ip}:3001/play-video" \
            -H "Content-Type: application/json" \
            -d "{\"filename\": \"$videos\", \"loop\": true}")
        
        success=$(echo "$result" | jq -r '.success // false' 2>/dev/null)
        if [ "$success" = "true" ]; then
            log "   ✅ Video playback started: $videos"
        else
            log "   ⚠️  No videos available yet"
        fi
    else
        log "   ⚠️  No videos found on $goblin_name"
    fi
}

# Main monitoring loop
log "🔄 Starting monitoring loop (checking every 30 seconds)"
log ""

while true; do
    # Check Goblin2
    if [ "$GOBLIN2_DEPLOYED" = false ]; then
        if ping -c 1 -W 2 "$GOBLIN2_IP" >/dev/null 2>&1; then
            log "🎯 Goblin2 detected online at $GOBLIN2_IP"
            
            if deploy_goblin "goblin-two" "$GOBLIN2_IP" "Goblin Two"; then
                GOBLIN2_DEPLOYED=true
                sleep 5
                start_video_playback "$GOBLIN2_IP" "Goblin Two"
            fi
        fi
    fi
    
    # Check Goblin3
    if [ "$GOBLIN3_DEPLOYED" = false ]; then
        if ping -c 1 -W 2 "$GOBLIN3_IP" >/dev/null 2>&1; then
            log "🎯 Goblin3 detected online at $GOBLIN3_IP"
            
            if deploy_goblin "goblin-three" "$GOBLIN3_IP" "Goblin Three"; then
                GOBLIN3_DEPLOYED=true
                sleep 5
                start_video_playback "$GOBLIN3_IP" "Goblin Three"
            fi
        fi
    fi
    
    # Exit if both deployed
    if [ "$GOBLIN2_DEPLOYED" = true ] && [ "$GOBLIN3_DEPLOYED" = true ]; then
        log ""
        log "🎃 All Goblins deployed! Exiting monitor."
        exit 0
    fi
    
    # Wait before next check
    sleep 30
done

