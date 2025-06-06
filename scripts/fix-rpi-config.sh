#!/bin/bash

# MonsterBox RPI Configuration Fix Script
# Fixes audio volume and GPU memory allocation issues

echo "🎃 MonsterBox RPI Configuration Fix"
echo "=================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Backup current config
echo "📋 Backing up current configuration..."
cp /boot/firmware/config.txt /boot/firmware/config.txt.backup.$(date +%Y%m%d_%H%M%S)

# Fix GPU memory allocation
echo "🖥️  Fixing GPU memory allocation..."
if grep -q "gpu_mem=" /boot/firmware/config.txt; then
    # Update existing gpu_mem setting
    sed -i 's/gpu_mem=.*/gpu_mem=512/' /boot/firmware/config.txt
    echo "   ✅ Updated existing gpu_mem setting to 512MB"
else
    # Add gpu_mem setting
    echo "gpu_mem=512" >> /boot/firmware/config.txt
    echo "   ✅ Added gpu_mem=512 to config.txt"
fi

# Fix audio volume
echo "🔊 Fixing audio volume..."
# Set master volume to 95%
amixer set Master 95% > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Set Master volume to 95%"
else
    echo "   ⚠️  Could not set Master volume (may not be available)"
fi

# Set PCM volume to 95% (using card 0 specifically)
amixer -c 0 set PCM 95% > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Set PCM volume to 95%"
else
    echo "   ⚠️  Could not set PCM volume (may not be available)"
fi

# Set headphone volume to 95%
amixer set Headphone 95% > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Set Headphone volume to 95%"
else
    echo "   ⚠️  Could not set Headphone volume (may not be available)"
fi

# Save ALSA settings
alsactl store > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Saved ALSA settings"
else
    echo "   ⚠️  Could not save ALSA settings"
fi

# Show current audio levels
echo ""
echo "📊 Current Audio Levels:"
amixer get Master | grep -o '[0-9]*%' | head -1 | sed 's/^/   Master: /'
amixer get PCM | grep -o '[0-9]*%' | head -1 | sed 's/^/   PCM: /' 2>/dev/null || echo "   PCM: Not available"
amixer get Headphone | grep -o '[0-9]*%' | head -1 | sed 's/^/   Headphone: /' 2>/dev/null || echo "   Headphone: Not available"

# Show current GPU memory
echo ""
echo "📊 Current GPU Memory:"
if command -v vcgencmd &> /dev/null; then
    GPU_MEM=$(vcgencmd get_mem gpu | cut -d= -f2)
    echo "   GPU Memory: $GPU_MEM"
else
    echo "   ⚠️  vcgencmd not available to check GPU memory"
fi

echo ""
echo "✅ Configuration fixes applied!"
echo ""
echo "⚠️  IMPORTANT: A reboot is required for GPU memory changes to take effect."
echo "   Run: sudo reboot"
echo ""
echo "📋 To verify changes after reboot:"
echo "   - Audio: amixer get Master"
echo "   - GPU: vcgencmd get_mem gpu"
