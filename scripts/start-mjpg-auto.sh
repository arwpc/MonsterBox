#!/bin/bash
# Auto-detect USB camera and start mjpg-streamer

# Wait for USB devices to settle
sleep 3

# Find the USB camera device
USB_CAMERA=""

# Try to find USB camera using v4l2-ctl
if command -v v4l2-ctl >/dev/null 2>&1; then
    # Look for USB camera in device list
    USB_CAMERA=$(v4l2-ctl --list-devices 2>/dev/null | grep -A2 "USB" | grep "/dev/video" | head -1 | tr -d '\t ')
fi

# If not found, try /dev/video0 first, then video1, video2, etc.
if [ -z "$USB_CAMERA" ]; then
    for i in 0 1 2 3 4 5; do
        if [ -c "/dev/video$i" ]; then
            # Check if it's a capture device
            if v4l2-ctl -d /dev/video$i --list-formats 2>/dev/null | grep -q "YUYV\|MJPEG"; then
                USB_CAMERA="/dev/video$i"
                break
            fi
        fi
    done
fi

# Default to /dev/video0 if nothing found
if [ -z "$USB_CAMERA" ]; then
    USB_CAMERA="/dev/video0"
fi

echo "Starting mjpg-streamer with camera: $USB_CAMERA"

# Start mjpg-streamer
exec /usr/local/bin/mjpg_streamer \
    -i "input_uvc.so -d $USB_CAMERA -r 640x480 -f 24 -q 80" \
    -o "output_http.so -p 8090 -w /usr/local/share/mjpg-streamer/www"

