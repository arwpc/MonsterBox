#!/bin/bash

# Test USB Video Playback on Goblin-1
# This script helps test video playback from USB stick on HDMI output

set -e

# Color output
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

print_warning() {
    echo -e "\e[1;33m>>> Warning: $1\e[0m"
}

# Configuration
USB_MOUNT="/media/usb"
GOBLIN_MEDIA="$HOME/goblin/media/video"

print_status "🎬 MonsterBox Goblin-1 Video Test"
echo ""

# 1. Check USB mount
print_status "Checking USB stick..."
if [ ! -d "$USB_MOUNT" ]; then
    print_error "USB mount point $USB_MOUNT does not exist"
    print_status "Creating mount point..."
    sudo mkdir -p "$USB_MOUNT"
fi

if ! mountpoint -q "$USB_MOUNT"; then
    print_warning "USB stick not mounted at $USB_MOUNT"
    print_status "Attempting to mount..."
    
    # Find USB device
    USB_DEVICE=$(lsblk -o NAME,TYPE | grep -E "sd[a-z][0-9].*part" | head -1 | awk '{print "/dev/"$1}')
    
    if [ -z "$USB_DEVICE" ]; then
        print_error "No USB device found. Please plug in USB stick."
        exit 1
    fi
    
    print_status "Found USB device: $USB_DEVICE"
    sudo mount "$USB_DEVICE" "$USB_MOUNT" || {
        print_error "Failed to mount USB stick"
        exit 1
    }
    print_success "USB stick mounted"
else
    print_success "USB stick already mounted at $USB_MOUNT"
fi

# 2. List available videos
print_status "Scanning for video files..."
echo ""

VIDEO_FILES=()
while IFS= read -r -d '' file; do
    VIDEO_FILES+=("$file")
done < <(find "$USB_MOUNT" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) -print0 2>/dev/null)

if [ ${#VIDEO_FILES[@]} -eq 0 ]; then
    print_error "No video files found on USB stick"
    exit 1
fi

print_success "Found ${#VIDEO_FILES[@]} video files:"
echo ""

for i in "${!VIDEO_FILES[@]}"; do
    filename=$(basename "${VIDEO_FILES[$i]}")
    filesize=$(du -h "${VIDEO_FILES[$i]}" | cut -f1)
    echo "  [$i] $filename ($filesize)"
done

echo ""

# 3. Select video to play
if [ $# -eq 1 ]; then
    # Video index provided as argument
    VIDEO_INDEX=$1
else
    # Interactive selection
    read -p "Enter video number to play (0-$((${#VIDEO_FILES[@]}-1))): " VIDEO_INDEX
fi

if [ -z "$VIDEO_INDEX" ] || [ "$VIDEO_INDEX" -lt 0 ] || [ "$VIDEO_INDEX" -ge ${#VIDEO_FILES[@]} ]; then
    print_error "Invalid video selection"
    exit 1
fi

SELECTED_VIDEO="${VIDEO_FILES[$VIDEO_INDEX]}"
print_status "Selected: $(basename "$SELECTED_VIDEO")"

# 4. Check HDMI output
print_status "Checking HDMI output..."
if command -v tvservice &> /dev/null; then
    HDMI_STATUS=$(tvservice -s)
    print_status "HDMI Status: $HDMI_STATUS"
fi

# 5. Configure audio for HDMI
print_status "Configuring audio output to HDMI..."
sudo amixer cset numid=3 2 2>/dev/null || print_warning "Could not set HDMI audio"
sudo amixer set Master 80% 2>/dev/null || print_warning "Could not set volume"

# 6. Check available video players
print_status "Checking available video players..."
PLAYER=""

if command -v vlc &> /dev/null; then
    PLAYER="vlc"
    print_success "Using VLC media player"
elif command -v ffplay &> /dev/null; then
    PLAYER="ffplay"
    print_success "Using ffplay"
elif command -v omxplayer &> /dev/null; then
    PLAYER="omxplayer"
    print_success "Using omxplayer"
else
    print_error "No video player found. Please install vlc, ffmpeg, or omxplayer"
    exit 1
fi

# 7. Play video
echo ""
print_status "🎬 Starting video playback..."
print_status "Press Ctrl+C to stop"
echo ""

case $PLAYER in
    vlc)
        # VLC with fullscreen, loop, and HDMI audio
        vlc --fullscreen \
            --loop \
            --no-video-title-show \
            --no-osd \
            --quiet \
            --alsa-audio-device hdmi:CARD=Headphones,DEV=0 \
            "$SELECTED_VIDEO" 2>/dev/null
        ;;
    
    ffplay)
        # ffplay with fullscreen and loop
        ffplay -fs \
            -loop 0 \
            -autoexit \
            -loglevel quiet \
            -vf "scale=1920:1080" \
            "$SELECTED_VIDEO" 2>/dev/null
        ;;
    
    omxplayer)
        # omxplayer with HDMI audio and loop
        omxplayer --loop \
            --no-osd \
            --aspect-mode fill \
            -o hdmi \
            "$SELECTED_VIDEO" 2>/dev/null
        ;;
esac

print_success "Video playback stopped"

