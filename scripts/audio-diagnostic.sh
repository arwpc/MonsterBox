#!/bin/bash
#
# MonsterBox Audio Diagnostic Script
# Comprehensive audio system testing and troubleshooting
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        MonsterBox Audio Diagnostic Tool v1.0              ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Test 1: PipeWire Services
echo -e "${YELLOW}[1/8] Checking PipeWire Services...${NC}"
if systemctl --user is-active --quiet pipewire; then
    echo -e "${GREEN}✓ PipeWire: Running${NC}"
else
    echo -e "${RED}✗ PipeWire: Not running${NC}"
    echo "  Fix: systemctl --user start pipewire"
fi

if systemctl --user is-active --quiet wireplumber; then
    echo -e "${GREEN}✓ WirePlumber: Running${NC}"
else
    echo -e "${RED}✗ WirePlumber: Not running${NC}"
    echo "  Fix: systemctl --user start wireplumber"
fi

if systemctl --user is-active --quiet pipewire-pulse; then
    echo -e "${GREEN}✓ PipeWire-Pulse: Running${NC}"
else
    echo -e "${RED}✗ PipeWire-Pulse: Not running${NC}"
    echo "  Fix: systemctl --user start pipewire-pulse"
fi
echo ""

# Test 2: Audio Devices
echo -e "${YELLOW}[2/8] Detecting Audio Devices...${NC}"
if aplay -l | grep -q "USB Audio Device"; then
    echo -e "${GREEN}✓ USB Audio Device detected${NC}"
    aplay -l | grep "USB Audio Device" | head -3
else
    echo -e "${RED}✗ USB Audio Device not found${NC}"
    echo "  Check: USB cable connection"
fi
echo ""

# Test 3: PipeWire Sinks
echo -e "${YELLOW}[3/8] Checking PipeWire Sinks...${NC}"
if wpctl status | grep -q "USB_Audio_Device\|Audio Adapter"; then
    echo -e "${GREEN}✓ PipeWire sink available${NC}"
    wpctl status | grep -A 2 "Sinks:" | grep -E "Audio Adapter|USB_Audio"
else
    echo -e "${RED}✗ No PipeWire sink found${NC}"
fi
echo ""

# Test 4: Volume Levels
echo -e "${YELLOW}[4/8] Checking Volume Levels...${NC}"
SINK_ID=$(wpctl status | grep "Audio Adapter" | grep -oP '\d+' | head -1)
if [ -n "$SINK_ID" ]; then
    VOL=$(wpctl get-volume $SINK_ID)
    echo -e "${GREEN}✓ PipeWire Volume: $VOL${NC}"
else
    echo -e "${YELLOW}⚠ Could not detect sink ID${NC}"
fi

# Check hardware volume
if amixer -c 4 sget Speaker 2>/dev/null | grep -q "Playback.*\[on\]"; then
    HWVOL=$(amixer -c 4 sget Speaker | grep -oP '\[\d+%\]' | head -1)
    echo -e "${GREEN}✓ Hardware Volume: $HWVOL [on]${NC}"
else
    echo -e "${RED}✗ Hardware volume may be muted${NC}"
    echo "  Fix: amixer -c 4 sset Speaker 100% unmute"
fi
echo ""

# Test 5: Mute Status
echo -e "${YELLOW}[5/8] Checking Mute Status...${NC}"
if pactl list sinks | grep -A 20 "USB_Audio_Device" | grep -q "Mute: no"; then
    echo -e "${GREEN}✓ Not muted${NC}"
else
    echo -e "${RED}✗ Audio may be muted${NC}"
    echo "  Fix: pactl set-sink-mute alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo 0"
fi
echo ""

# Test 6: Test Audio Playback
echo -e "${YELLOW}[6/8] Testing Audio Playback...${NC}"
if [ -f "public/sounds/monster-howl-85304.mp3" ]; then
    echo "Playing test sound (4 seconds)..."
    PULSE_SINK=alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo \
        timeout 5 mpg123 -q public/sounds/monster-howl-85304.mp3 2>/dev/null && \
        echo -e "${GREEN}✓ Playback completed${NC}" || \
        echo -e "${RED}✗ Playback failed${NC}"
else
    echo -e "${YELLOW}⚠ Test file not found${NC}"
fi
echo ""

# Test 7: Active Streams
echo -e "${YELLOW}[7/8] Checking Active Streams...${NC}"
STREAMS=$(wpctl status | grep -A 5 "Streams:" | grep -c "mpg123\|pw-play" || true)
if [ "$STREAMS" -gt 0 ]; then
    echo -e "${GREEN}✓ Active audio streams detected${NC}"
    wpctl status | grep -A 5 "Streams:" | grep "mpg123\|pw-play" || true
else
    echo -e "${YELLOW}⚠ No active streams (normal when idle)${NC}"
fi
echo ""

# Test 8: Physical Connection Check
echo -e "${YELLOW}[8/8] Physical Connection Checklist...${NC}"
echo ""
echo "Please verify the following:"
echo "  □ Speakers are plugged into the USB Audio Adapter"
echo "  □ Speakers are powered ON (if they have a power switch)"
echo "  □ Speaker cable is in the GREEN (output) jack, not pink (mic)"
echo "  □ USB Audio Adapter is firmly connected to Raspberry Pi"
echo "  □ Speaker volume knob is turned up (if present)"
echo "  □ Speakers are not damaged/faulty"
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    DIAGNOSTIC SUMMARY                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if software is working
SOFTWARE_OK=true
systemctl --user is-active --quiet pipewire || SOFTWARE_OK=false
systemctl --user is-active --quiet wireplumber || SOFTWARE_OK=false
aplay -l | grep -q "USB Audio Device" || SOFTWARE_OK=false

if [ "$SOFTWARE_OK" = true ]; then
    echo -e "${GREEN}✓ SOFTWARE STATUS: All systems operational${NC}"
    echo ""
    echo -e "${YELLOW}If you still cannot hear audio, the issue is PHYSICAL:${NC}"
    echo "  1. Check speaker power and connections"
    echo "  2. Verify correct output jack (green, not pink)"
    echo "  3. Test speakers with another device"
    echo "  4. Check for damaged cables"
    echo ""
    echo -e "${BLUE}Quick Fix Commands:${NC}"
    echo "  # Maximize all volumes:"
    echo "  amixer -c 4 sset Speaker 100% unmute"
    echo "  wpctl set-volume 81 1.0"
    echo "  pactl set-sink-volume alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo 100%"
    echo ""
    echo "  # Test playback:"
    echo "  PULSE_SINK=alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo mpg123 public/sounds/monster-howl-85304.mp3"
else
    echo -e "${RED}✗ SOFTWARE STATUS: Issues detected${NC}"
    echo ""
    echo "Run these commands to fix:"
    echo "  systemctl --user start pipewire wireplumber pipewire-pulse"
    echo "  wpctl status"
fi

echo ""
echo -e "${BLUE}For more help, see: docs/AUDIO_TROUBLESHOOTING_COMPLETE.md${NC}"
echo ""

