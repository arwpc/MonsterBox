#!/bin/bash
# Quick script to open ChatterPi interfaces with correct hostname

echo "🚀 Opening ChatterPi interfaces..."

# Check if running on the remote system
if [[ $(hostname) == "skulltalker" ]]; then
    HOST="localhost"
else
    HOST="skulltalker"
fi

echo "🌐 Using host: $HOST"

# URLs to open
URLS=(
    "http://$HOST:3000/chatterpi-ai-chat.html"
    "http://$HOST:3000/chatterpi-chat.html"
    "http://$HOST:3000"
)

# Try to open with different browsers
for url in "${URLS[@]}"; do
    echo "🔗 Opening: $url"
    
    # Try different browser commands
    if command -v google-chrome &> /dev/null; then
        google-chrome "$url" &
    elif command -v chromium-browser &> /dev/null; then
        chromium-browser "$url" &
    elif command -v firefox &> /dev/null; then
        firefox "$url" &
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$url" &
    else
        echo "⚠️ No browser found. Please open manually: $url"
    fi
    
    sleep 1
done

echo "✅ ChatterPi interfaces should now be open!"
