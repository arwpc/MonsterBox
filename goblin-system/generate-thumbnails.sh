#!/bin/bash

# MonsterBox Goblin Thumbnail Generator
# Generates thumbnails for all videos on USB drive

echo "🎃 MonsterBox Goblin Thumbnail Generator"
echo "========================================"
echo ""

# USB video path
USB_PATH="/media/usb/video"
THUMB_PATH="/media/usb/thumbnails"

# Check if USB is mounted
if [ ! -d "$USB_PATH" ]; then
  echo "❌ USB video directory not found: $USB_PATH"
  echo "   Please mount USB drive first"
  exit 1
fi

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
  echo "❌ ffmpeg not found"
  echo "   Installing ffmpeg..."
  sudo apt-get update
  sudo apt-get install -y ffmpeg
fi

# Create thumbnails directory
echo "📁 Creating thumbnails directory..."
mkdir -p "$THUMB_PATH"

# Count videos
VIDEO_COUNT=$(find "$USB_PATH" -type f \( -iname "*.mp4" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.mkv" \) | wc -l)
echo "📹 Found $VIDEO_COUNT videos"
echo ""

# Generate thumbnails
CURRENT=0
GENERATED=0
SKIPPED=0
FAILED=0

find "$USB_PATH" -type f \( -iname "*.mp4" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.mkv" \) | while read -r VIDEO_FILE; do
  CURRENT=$((CURRENT + 1))
  
  # Get relative path from USB_PATH
  REL_PATH="${VIDEO_FILE#$USB_PATH/}"
  
  # Create thumbnail filename (replace / with _ and change extension)
  THUMB_NAME=$(echo "$REL_PATH" | sed 's/\//_/g' | sed 's/\.[^.]*$/.jpg/')
  THUMB_FILE="$THUMB_PATH/$THUMB_NAME"
  
  # Skip if thumbnail already exists
  if [ -f "$THUMB_FILE" ]; then
    echo "[$CURRENT/$VIDEO_COUNT] ⏭️  Skipping (exists): $REL_PATH"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  echo "[$CURRENT/$VIDEO_COUNT] 🎬 Generating: $REL_PATH"
  
  # Generate thumbnail at 1 second mark, 320x240, high quality
  if ffmpeg -i "$VIDEO_FILE" -ss 00:00:01.000 -vframes 1 -q:v 2 -vf "scale=320:240" -y "$THUMB_FILE" 2>/dev/null; then
    echo "[$CURRENT/$VIDEO_COUNT] ✅ Success: $THUMB_NAME"
    GENERATED=$((GENERATED + 1))
  else
    echo "[$CURRENT/$VIDEO_COUNT] ❌ Failed: $REL_PATH"
    FAILED=$((FAILED + 1))
  fi
  
  echo ""
done

echo ""
echo "✅ Thumbnail generation complete!"
echo ""
echo "📊 Summary:"
echo "   Total videos: $VIDEO_COUNT"
echo "   Generated: $GENERATED"
echo "   Skipped (already exist): $SKIPPED"
echo "   Failed: $FAILED"
echo ""
echo "📁 Thumbnails saved to: $THUMB_PATH"

