#!/bin/bash
# Generate thumbnails for all videos in the goblin media directory

VIDEO_DIR="/home/remote/goblin/media/video"
THUMBNAIL_DIR="/home/remote/goblin/media/thumbnails"

# Create thumbnail directory if it doesn't exist
mkdir -p "$THUMBNAIL_DIR"

echo "🎬 Starting thumbnail generation..."
echo "📁 Video directory: $VIDEO_DIR"
echo "📁 Thumbnail directory: $THUMBNAIL_DIR"

# Counter for progress
total=0
generated=0
skipped=0

# Find all video files
while IFS= read -r -d '' video_file; do
    total=$((total + 1))
    
    # Get relative path from video directory
    rel_path="${video_file#$VIDEO_DIR/}"
    
    # Create thumbnail filename (replace / with _ and change extension to .jpg)
    thumb_name=$(echo "$rel_path" | sed 's/\//_/g' | sed 's/\.[^.]*$/.jpg/')
    thumb_path="$THUMBNAIL_DIR/$thumb_name"
    
    # Skip if thumbnail already exists
    if [ -f "$thumb_path" ]; then
        skipped=$((skipped + 1))
        continue
    fi
    
    # Generate thumbnail at 1 second mark, 320x240 resolution (quiet mode)
    if ffmpeg -i "$video_file" -ss 00:00:01 -vframes 1 -vf scale=320:240 "$thumb_path" -y -loglevel quiet 2>/dev/null; then
        generated=$((generated + 1))
        printf "✅ %3d/%3d: %s\n" "$generated" "$total" "$rel_path"
    else
        printf "❌ Failed: %s\n" "$rel_path"
    fi
    
done < <(find "$VIDEO_DIR" -type f \( -iname "*.mp4" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.webm" -o -iname "*.flv" \) -print0)

echo ""
echo "🎬 Thumbnail generation complete!"
echo "📊 Total videos: $total"
echo "✅ Generated: $generated"
echo "⏭️  Skipped: $skipped"
echo "📁 Thumbnails saved to: $THUMBNAIL_DIR"

