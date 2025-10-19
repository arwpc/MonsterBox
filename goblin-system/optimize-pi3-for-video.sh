#!/bin/bash
#
# Raspberry Pi 3B+ Video Optimization Script
# Optimizes Pi3 for smooth 720p@60fps video playback
#
# This script configures:
# - GPU memory allocation
# - Hardware video codecs
# - CPU/GPU overclocking
# - HDMI output settings
# - Video driver configuration
#
# Based on proven GOBLIN GOLD configuration
#

set -e

echo "🎃 Raspberry Pi 3B+ Video Optimization"
echo "======================================"
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ]; then
    echo "❌ This script must be run on a Raspberry Pi"
    exit 1
fi

MODEL=$(cat /proc/device-tree/model)
echo "📟 Detected: $MODEL"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Backup existing config
CONFIG_FILE="/boot/firmware/config.txt"
if [ ! -f "$CONFIG_FILE" ]; then
    # Try old location
    CONFIG_FILE="/boot/config.txt"
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Could not find config.txt"
    exit 1
fi

BACKUP_FILE="${CONFIG_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
echo "📋 Backing up config to: $BACKUP_FILE"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo ""

# Function to set or update config value
set_config() {
    local key="$1"
    local value="$2"
    
    if grep -q "^${key}=" "$CONFIG_FILE"; then
        # Update existing value
        sed -i "s/^${key}=.*/${key}=${value}/" "$CONFIG_FILE"
        echo "  ✓ Updated: ${key}=${value}"
    elif grep -q "^#${key}=" "$CONFIG_FILE"; then
        # Uncomment and set value
        sed -i "s/^#${key}=.*/${key}=${value}/" "$CONFIG_FILE"
        echo "  ✓ Enabled: ${key}=${value}"
    else
        # Add new value
        echo "${key}=${value}" >> "$CONFIG_FILE"
        echo "  ✓ Added: ${key}=${value}"
    fi
}

echo "🔧 Applying optimizations..."
echo ""

# GPU Memory - 128MB for video decoding
echo "1. GPU Memory Allocation"
set_config "gpu_mem" "128"
echo ""

# Hardware Video Codecs
echo "2. Hardware Video Codecs"
set_config "gpu_codec_h264" "enabled"
set_config "gpu_codec_h265" "enabled"
set_config "gpu_codec_vp6" "enabled"
set_config "gpu_codec_vp8" "enabled"
echo ""

# GPU Performance
echo "3. GPU Performance"
set_config "gpu_freq" "500"
set_config "core_freq" "500"
echo ""

# HDMI Output Settings
echo "4. HDMI Output"
set_config "hdmi_force_hotplug" "1"
set_config "hdmi_drive" "2"
set_config "hdmi_group" "1"
set_config "hdmi_mode" "16"  # 1080p@60Hz
echo ""

# CPU Overclocking (safe for Pi3B+)
echo "5. CPU Overclocking"
set_config "force_turbo" "1"
set_config "arm_freq" "1300"
set_config "over_voltage" "2"
echo ""

# Framebuffer Settings
echo "6. Framebuffer"
set_config "framebuffer_width" "1920"
set_config "framebuffer_height" "1080"
set_config "framebuffer_depth" "24"
echo ""

# Video Driver
echo "7. Video Driver"
set_config "dtoverlay" "vc4-kms-v3d"
echo ""

# Disable unnecessary features to save resources
echo "8. Resource Optimization"
set_config "disable_splash" "1"
set_config "boot_delay" "0"
echo ""

echo "✅ Configuration complete!"
echo ""
echo "📝 Summary of changes:"
echo "  - GPU Memory: 128MB"
echo "  - Hardware codecs: H.264, H.265, VP6, VP8"
echo "  - GPU frequency: 500MHz"
echo "  - CPU frequency: 1300MHz (overclocked)"
echo "  - HDMI: 1080p@60Hz forced"
echo "  - Video driver: vc4-fkms-v3d (KMS)"
echo ""
echo "⚠️  REBOOT REQUIRED for changes to take effect"
echo ""
echo "To reboot now: sudo reboot"
echo "To restore backup: sudo cp $BACKUP_FILE $CONFIG_FILE && sudo reboot"
echo ""

