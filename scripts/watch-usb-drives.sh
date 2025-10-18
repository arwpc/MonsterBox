#!/bin/bash
#
# Watch for USB drives and automatically process videos
# Runs continuously, independent of Augment
#

LOG_FILE="/home/remote/MonsterBox/logs/usb-watch-$(date +%Y%m%d-%H%M%S).log"
PROCESSED_FILE="/home/remote/MonsterBox/logs/usb-processed.txt"

mkdir -p "$(dirname "$LOG_FILE")"
touch "$PROCESSED_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🎃 USB Drive Watcher started"
log "   Will automatically process videos when USB drives are detected"
log "   Log: $LOG_FILE"
log ""

# Function to get unique ID for a mount point
get_mount_id() {
    local mount_point="$1"
    # Use device name + mount point as unique ID
    local device=$(mount | grep " $mount_point " | awk '{print $1}')
    echo "${device}:${mount_point}"
}

# Function to check if mount was already processed
was_processed() {
    local mount_id="$1"
    grep -q "^${mount_id}$" "$PROCESSED_FILE" 2>/dev/null
}

# Function to mark as processed
mark_processed() {
    local mount_id="$1"
    echo "$mount_id" >> "$PROCESSED_FILE"
}

# Main loop
while true; do
    # Find all mounted USB/external drives
    MOUNTS=$(lsblk -o NAME,MOUNTPOINT,TYPE | grep -E "part.*/" | awk '{print $2}' | grep -v "^/$" | grep -v "^/boot" | grep -v "^/home$")
    
    # Also check /media and /mnt
    for dir in /media/*/* /media/* /mnt/*; do
        if [ -d "$dir" ] && mountpoint -q "$dir" 2>/dev/null; then
            MOUNTS="$MOUNTS"$'\n'"$dir"
        fi
    done
    
    # Remove empty lines and duplicates
    MOUNTS=$(echo "$MOUNTS" | grep -v "^$" | sort -u)
    
    if [ -n "$MOUNTS" ]; then
        echo "$MOUNTS" | while read -r mount_point; do
            [ -z "$mount_point" ] && continue
            
            mount_id=$(get_mount_id "$mount_point")
            
            # Skip if already processed
            if was_processed "$mount_id"; then
                continue
            fi
            
            log ""
            log "🔍 New USB drive detected: $mount_point"
            log "   Mount ID: $mount_id"
            
            # Check if it has videos
            video_count=$(find "$mount_point" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) 2>/dev/null | wc -l)
            
            if [ "$video_count" -gt 0 ]; then
                log "   📹 Found $video_count video(s)"
                log "   🚀 Starting video processing..."
                
                # Run both copy scripts
                log "   Processing for Goblin1..."
                /home/remote/MonsterBox/scripts/copy-usb-videos-goblin1.sh >> "$LOG_FILE" 2>&1
                
                log "   Processing for Goblin2..."
                /home/remote/MonsterBox/scripts/copy-usb-videos-goblin2.sh >> "$LOG_FILE" 2>&1
                
                log "   ✅ Processing complete for $mount_point"
            else
                log "   ⚠️  No videos found on this drive"
            fi
            
            # Mark as processed
            mark_processed "$mount_id"
        done
    fi
    
    # Wait before next check
    sleep 10
done

