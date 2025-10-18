#!/bin/bash
#
# Copy and convert USB videos for Goblin2
# Runs independently - finds USB drives, converts videos, deploys to Goblin2
#

GOBLIN_IP="192.168.8.161"
SSH_PASS="klrklr89!"
SSH_USER="remote"

LOG_FILE="/home/remote/MonsterBox/logs/usb-goblin2-$(date +%Y%m%d-%H%M%S).log"
CONVERTED_DIR="/home/remote/MonsterBox/data/goblin-videos"

MAX_WIDTH=1280
MAX_HEIGHT=720
MAX_FPS=60

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$CONVERTED_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🎃 Starting USB video copy for Goblin2 ($GOBLIN_IP)"

# Find USB drives
USB_DRIVES=$(lsblk -o NAME,MOUNTPOINT | grep -E "sd[a-z][0-9]" | awk '{print $2}' | grep -v "^$")

if [ -z "$USB_DRIVES" ]; then
    # Try alternative method
    USB_DRIVES=$(mount | grep -E "^/dev/sd" | awk '{print $3}')
fi

if [ -z "$USB_DRIVES" ]; then
    # Check /media and /mnt
    for dir in /media/*/* /mnt/*; do
        if [ -d "$dir" ] && [ "$(ls -A "$dir" 2>/dev/null)" ]; then
            USB_DRIVES="$USB_DRIVES $dir"
        fi
    done
fi

if [ -z "$USB_DRIVES" ]; then
    log "❌ No USB drives found"
    log "   Checked: lsblk, mount, /media, /mnt"
    exit 1
fi

log "📁 Found USB drives:"
echo "$USB_DRIVES" | while read -r drive; do
    log "   - $drive"
done

# Process each USB drive
total_videos=0
converted_videos=0
deployed_videos=0

echo "$USB_DRIVES" | while read -r usb_dir; do
    [ -z "$usb_dir" ] && continue
    
    log ""
    log "🔍 Scanning: $usb_dir"
    
    # Find all video files
    find "$usb_dir" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) 2>/dev/null | while read -r video; do
        total_videos=$((total_videos + 1))
        
        filename=$(basename "$video")
        output_file="$CONVERTED_DIR/$filename"
        
        log ""
        log "📹 Processing: $filename"
        log "   Source: $video"
        
        # Get video info
        info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$video" 2>/dev/null)
        
        if [ -z "$info" ]; then
            log "   ⚠️  No video stream, skipping"
            continue
        fi
        
        width=$(echo "$info" | cut -d',' -f1)
        height=$(echo "$info" | cut -d',' -f2)
        fps_frac=$(echo "$info" | cut -d',' -f3)
        
        log "   Resolution: ${width}x${height} @ ${fps_frac}fps"
        
        # Check if conversion needed
        needs_conversion=false
        if [ "$width" -gt "$MAX_WIDTH" ] || [ "$height" -gt "$MAX_HEIGHT" ]; then
            needs_conversion=true
        fi
        
        if [ "$needs_conversion" = true ]; then
            log "   🔄 Converting to 720p@60fps..."
            
            ffmpeg -i "$video" \
                -vf "scale='min($MAX_WIDTH,iw)':'min($MAX_HEIGHT,ih)':force_original_aspect_ratio=decrease,fps=$MAX_FPS" \
                -c:v libx264 \
                -preset medium \
                -crf 23 \
                -c:a aac \
                -b:a 192k \
                -y \
                "$output_file" >> "$LOG_FILE" 2>&1
            
            if [ $? -eq 0 ]; then
                log "   ✅ Converted successfully"
                converted_videos=$((converted_videos + 1))
            else
                log "   ❌ Conversion failed"
                continue
            fi
        else
            log "   ✅ Already compliant, copying"
            cp "$video" "$output_file"
            converted_videos=$((converted_videos + 1))
        fi
        
        # Deploy to Goblin2
        log "   📤 Deploying to Goblin2..."
        
        if ping -c 1 -W 2 "$GOBLIN_IP" >/dev/null 2>&1; then
            export SSHPASS="$SSH_PASS"
            sshpass -e scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
                "$output_file" "${SSH_USER}@${GOBLIN_IP}:/home/remote/goblin/media/video/" >> "$LOG_FILE" 2>&1
            
            if [ $? -eq 0 ]; then
                log "   ✅ Deployed to Goblin2"
                deployed_videos=$((deployed_videos + 1))
            else
                log "   ❌ Failed to deploy"
            fi
        else
            log "   ⚠️  Goblin2 not reachable"
        fi
    done
done

log ""
log "🎃 USB video copy complete!"
log "   Total videos found: $total_videos"
log "   Converted: $converted_videos"
log "   Deployed to Goblin2: $deployed_videos"
log "   Log file: $LOG_FILE"

