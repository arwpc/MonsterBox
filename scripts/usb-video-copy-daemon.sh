#!/bin/bash
# USB Video Copy Daemon - Runs on Goblin to copy and convert videos from USB
# This script runs independently and doesn't require Augment

GOBLIN_IP="$1"
GOBLIN_NAME="$2"
LOG_FILE="/home/remote/goblin/logs/usb-copy.log"
USB_MOUNT="/mnt/usb"
VIDEO_DIR="/home/remote/goblin/media/video"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to deploy and run the script on a Goblin
deploy_to_goblin() {
    local ip="$1"
    local name="$2"
    
    log "Deploying USB copy daemon to $name ($ip)..."
    
    # Create the script on the Goblin
    sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@$ip 'cat > /tmp/usb-copy-local.sh' << 'REMOTE_SCRIPT'
#!/bin/bash
LOG_FILE="/home/remote/goblin/logs/usb-copy.log"
USB_MOUNT="/mnt/usb"
VIDEO_DIR="/home/remote/goblin/media/video"
PROCESSED_FILE="/home/remote/goblin/.usb-processed"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Create directories
mkdir -p /home/remote/goblin/logs
mkdir -p "$VIDEO_DIR"
echo "klrklr89!" | sudo -S mkdir -p "$USB_MOUNT"

log "🎃 USB Video Copy Daemon Started"

# Check for USB drive
USB_DEVICE=$(lsblk -o NAME,TYPE | grep disk | grep sd | head -1 | awk '{print $1}')
if [ -z "$USB_DEVICE" ]; then
    log "❌ No USB drive detected"
    exit 1
fi

USB_PARTITION="/dev/${USB_DEVICE}1"
log "✅ Found USB drive: $USB_PARTITION"

# Mount USB drive
log "Mounting USB drive..."
echo "klrklr89!" | sudo -S mount "$USB_PARTITION" "$USB_MOUNT" 2>&1 | tee -a "$LOG_FILE"

if [ ! -d "$USB_MOUNT" ] || [ -z "$(ls -A $USB_MOUNT 2>/dev/null)" ]; then
    log "❌ Failed to mount USB drive"
    exit 1
fi

log "✅ USB drive mounted at $USB_MOUNT"

# Find all video files
VIDEO_COUNT=$(find "$USB_MOUNT" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.mkv" -o -iname "*.wmv" -o -iname "*.flv" \) | wc -l)
log "📹 Found $VIDEO_COUNT video files on USB"

# Load processed files list
touch "$PROCESSED_FILE"

# Process each video
PROCESSED=0
SKIPPED=0
FAILED=0

find "$USB_MOUNT" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mov" -o -iname "*.mkv" -o -iname "*.wmv" -o -iname "*.flv" \) | while read video; do
    BASENAME=$(basename "$video")
    
    # Check if already processed
    if grep -q "$BASENAME" "$PROCESSED_FILE"; then
        log "⏭️  Skipping (already processed): $BASENAME"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    log "🎬 Processing: $BASENAME"
    
    # Generate UUID for output filename
    UUID=$(cat /proc/sys/kernel/random/uuid)
    OUTPUT_FILE="$VIDEO_DIR/${UUID}.mp4"
    
    # Convert video to 720p@60fps with ffmpeg
    log "  Converting to 720p@60fps..."
    if ffmpeg -i "$video" \
        -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=60" \
        -c:v libx264 -preset medium -crf 23 \
        -c:a aac -b:a 128k \
        -movflags +faststart \
        -y "$OUTPUT_FILE" >> "$LOG_FILE" 2>&1; then
        
        SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
        log "  ✅ Converted: $BASENAME -> ${UUID}.mp4 ($SIZE)"
        echo "$BASENAME" >> "$PROCESSED_FILE"
        PROCESSED=$((PROCESSED + 1))
    else
        log "  ❌ Failed to convert: $BASENAME"
        rm -f "$OUTPUT_FILE"
        FAILED=$((FAILED + 1))
    fi
done

log "📊 Processing complete: $PROCESSED converted, $SKIPPED skipped, $FAILED failed"

# Unmount USB
log "Unmounting USB drive..."
echo "klrklr89!" | sudo -S umount "$USB_MOUNT"

log "🎃 USB Video Copy Daemon Finished"
REMOTE_SCRIPT

    # Make it executable and run it
    sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@$ip 'chmod +x /tmp/usb-copy-local.sh && nohup /tmp/usb-copy-local.sh > /dev/null 2>&1 &'
    
    log "✅ Daemon started on $name"
}

# Main execution
if [ -z "$GOBLIN_IP" ] || [ -z "$GOBLIN_NAME" ]; then
    echo "Usage: $0 <goblin_ip> <goblin_name>"
    exit 1
fi

deploy_to_goblin "$GOBLIN_IP" "$GOBLIN_NAME"

