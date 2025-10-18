#!/bin/bash
#
# USB Video Sync for Goblins
# Automatically detects USB drives, copies videos, converts to 720p@60fps, and deploys to Goblins
# Runs independently in background - no Augment dependency
#

GOBLIN1_IP="192.168.8.40"
GOBLIN2_IP="192.168.8.161"
SSH_PASS="klrklr89!"
SSH_USER="remote"

LOG_FILE="/home/remote/MonsterBox/logs/usb-video-sync.log"
TEMP_DIR="/home/remote/MonsterBox/temp/usb-videos"
CONVERTED_DIR="/home/remote/MonsterBox/data/goblin-videos"

# Video conversion settings
MAX_WIDTH=1280
MAX_HEIGHT=720
MAX_FPS=60

# Create directories
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$TEMP_DIR"
mkdir -p "$CONVERTED_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🎃 USB Video Sync started"
log "   Goblin1: $GOBLIN1_IP"
log "   Goblin2: $GOBLIN2_IP"

# Function to find USB drives
find_usb_drives() {
    # Look for mounted USB drives
    mount | grep -E "^/dev/sd" | awk '{print $3}' | while read -r mountpoint; do
        if [ -d "$mountpoint" ]; then
            echo "$mountpoint"
        fi
    done
    
    # Also check common mount points
    for dir in /media/* /mnt/*; do
        if [ -d "$dir" ] && mountpoint -q "$dir" 2>/dev/null; then
            echo "$dir"
        fi
    done
}

# Function to find video files
find_videos() {
    local search_dir="$1"
    find "$search_dir" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) 2>/dev/null
}

# Function to convert video to 720p@60fps
convert_video() {
    local input="$1"
    local output="$2"
    
    log "   🔄 Converting: $(basename "$input")"
    
    # Get video info
    local info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$input" 2>/dev/null)
    
    if [ -z "$info" ]; then
        log "   ⚠️  No video stream, skipping"
        return 1
    fi
    
    local width=$(echo "$info" | cut -d',' -f1)
    local height=$(echo "$info" | cut -d',' -f2)
    
    # Check if conversion needed
    if [ "$width" -le "$MAX_WIDTH" ] && [ "$height" -le "$MAX_HEIGHT" ]; then
        log "   ✅ Already compliant, copying"
        cp "$input" "$output"
        return 0
    fi
    
    # Convert with ffmpeg
    ffmpeg -i "$input" \
        -vf "scale='min($MAX_WIDTH,iw)':'min($MAX_HEIGHT,ih)':force_original_aspect_ratio=decrease,fps=$MAX_FPS" \
        -c:v libx264 \
        -preset medium \
        -crf 23 \
        -c:a aac \
        -b:a 192k \
        -y \
        "$output" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "   ✅ Converted successfully"
        return 0
    else
        log "   ❌ Conversion failed"
        return 1
    fi
}

# Function to deploy video to Goblin
deploy_to_goblin() {
    local video_file="$1"
    local goblin_ip="$2"
    local goblin_name="$3"
    
    log "   📤 Deploying to $goblin_name ($goblin_ip)"
    
    # Check if Goblin is reachable
    if ! ping -c 1 -W 2 "$goblin_ip" >/dev/null 2>&1; then
        log "   ⚠️  $goblin_name not reachable, skipping"
        return 1
    fi
    
    # Copy video via SCP
    export SSHPASS="$SSH_PASS"
    sshpass -e scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "$video_file" "${SSH_USER}@${goblin_ip}:/home/remote/goblin/media/video/" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "   ✅ Deployed to $goblin_name"
        return 0
    else
        log "   ❌ Failed to deploy to $goblin_name"
        return 1
    fi
}

# Function to process USB drive
process_usb_drive() {
    local usb_mount="$1"
    
    log ""
    log "🔍 Processing USB drive: $usb_mount"
    
    # Find all videos on USB
    local video_count=0
    find_videos "$usb_mount" | while read -r video; do
        video_count=$((video_count + 1))
        
        local filename=$(basename "$video")
        local output_file="$CONVERTED_DIR/$filename"
        
        log ""
        log "📹 Video $video_count: $filename"
        
        # Convert video
        if convert_video "$video" "$output_file"; then
            # Deploy to Goblin1
            deploy_to_goblin "$output_file" "$GOBLIN1_IP" "Goblin1"
            
            # Deploy to Goblin2
            deploy_to_goblin "$output_file" "$GOBLIN2_IP" "Goblin2"
        fi
    done
    
    log ""
    log "✅ Finished processing USB drive: $usb_mount"
}

# Main loop - check for USB drives every 30 seconds
log "🔄 Starting USB monitoring loop (checking every 30 seconds)"
log "   Press Ctrl+C to stop"
log ""

processed_drives=""

while true; do
    # Find current USB drives
    current_drives=$(find_usb_drives | sort | uniq)
    
    if [ -n "$current_drives" ]; then
        # Process each drive
        echo "$current_drives" | while read -r drive; do
            # Check if we've already processed this drive
            if ! echo "$processed_drives" | grep -q "$drive"; then
                process_usb_drive "$drive"
                processed_drives="$processed_drives $drive"
            fi
        done
    fi
    
    # Wait before next check
    sleep 30
done

