#!/bin/bash
#
# Prepare videos for Goblin playback
# Ensures all videos are 720p@60Hz or lower
#

set -e

SOURCE_DIR="data/video-library/files"
OUTPUT_DIR="data/goblin-videos"
MAX_WIDTH=1280
MAX_HEIGHT=720
MAX_FPS=60

echo "🎬 Preparing videos for Goblin playback..."
echo "   Max resolution: ${MAX_WIDTH}x${MAX_HEIGHT}@${MAX_FPS}fps"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Process each video
for video in "$SOURCE_DIR"/*.mp4; do
    if [ ! -f "$video" ]; then
        continue
    fi
    
    filename=$(basename "$video")
    output="$OUTPUT_DIR/$filename"
    
    echo ""
    echo "=== Processing: $filename ==="
    
    # Get video info
    info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$video" 2>/dev/null || echo "")
    
    if [ -z "$info" ]; then
        echo "⚠️  No video stream found, skipping"
        continue
    fi
    
    width=$(echo "$info" | cut -d',' -f1)
    height=$(echo "$info" | cut -d',' -f2)
    fps_frac=$(echo "$info" | cut -d',' -f3)
    
    # Calculate FPS
    if [[ "$fps_frac" == *"/"* ]]; then
        fps=$(echo "scale=2; $fps_frac" | bc)
    else
        fps=$fps_frac
    fi
    
    echo "   Source: ${width}x${height} @ ${fps}fps"
    
    # Check if conversion is needed
    needs_conversion=false
    
    if [ "$width" -gt "$MAX_WIDTH" ] || [ "$height" -gt "$MAX_HEIGHT" ]; then
        echo "   ⚠️  Resolution exceeds ${MAX_WIDTH}x${MAX_HEIGHT}"
        needs_conversion=true
    fi
    
    if (( $(echo "$fps > $MAX_FPS" | bc -l) )); then
        echo "   ⚠️  FPS exceeds ${MAX_FPS}"
        needs_conversion=true
    fi
    
    if [ "$needs_conversion" = true ]; then
        echo "   🔄 Converting to 720p@60fps..."
        
        ffmpeg -i "$video" \
            -vf "scale='min($MAX_WIDTH,iw)':'min($MAX_HEIGHT,ih)':force_original_aspect_ratio=decrease,fps=$MAX_FPS" \
            -c:v libx264 \
            -preset medium \
            -crf 23 \
            -c:a aac \
            -b:a 192k \
            -y \
            "$output" 2>&1 | grep -E "frame=|Duration:|error" || true
        
        if [ -f "$output" ]; then
            # Verify output
            out_info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$output" 2>/dev/null)
            out_width=$(echo "$out_info" | cut -d',' -f1)
            out_height=$(echo "$out_info" | cut -d',' -f2)
            out_fps=$(echo "$out_info" | cut -d',' -f3)
            
            echo "   ✅ Output: ${out_width}x${out_height} @ ${out_fps}fps"
            
            # Show file sizes
            src_size=$(du -h "$video" | cut -f1)
            out_size=$(du -h "$output" | cut -f1)
            echo "   📦 Size: $src_size → $out_size"
        else
            echo "   ❌ Conversion failed"
        fi
    else
        echo "   ✅ Already compliant, copying..."
        cp "$video" "$output"
    fi
done

echo ""
echo "🎃 Video preparation complete!"
echo "   Output directory: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"

