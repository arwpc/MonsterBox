#!/bin/bash
# Configure Skulltalker (Character 4) parts

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

IP="192.168.8.130"

echo "=========================================="
echo "Skulltalker Parts Configuration"
echo "=========================================="
echo ""

# Function to delete all parts
delete_all_parts() {
    echo -e "${YELLOW}Cleaning up existing parts...${NC}"
    part_ids=$(curl -s "http://${IP}:3000/api/parts" | jq -r '.[].id' 2>/dev/null || echo "")
    
    if [ -n "$part_ids" ]; then
        for part_id in $part_ids; do
            curl -s -X DELETE "http://${IP}:3000/api/parts/${part_id}" > /dev/null 2>&1
            echo -e "${BLUE}  Deleted part ID: $part_id${NC}"
        done
    fi
    echo -e "${GREEN}  ✓ Cleanup complete${NC}"
}

# Function to create a part
create_part() {
    local data=$1
    curl -s -X POST "http://${IP}:3000/api/parts" \
        -H "Content-Type: application/json" \
        -d "$data" > /dev/null 2>&1
}

delete_all_parts
echo ""
echo "Creating Skulltalker parts..."

# Head Servo (PCA9685 Channel 0)
create_part '{
  "name": "Head Servo",
  "type": "servo",
  "description": "Head movement servo",
  "config": {
    "servoType": "standard",
    "controllerType": "pca9685",
    "channel": 0,
    "address": 64,
    "pca9685Frequency": 50
  },
  "enabled": true,
  "modelId": "servo_miuzei_25kg"
}'
echo -e "${GREEN}  ✓ Head Servo created${NC}"

# Jaw Servo (PCA9685 Channel 8 - same as Orlok)
create_part '{
  "name": "Jaw Servo",
  "type": "servo",
  "description": "Jaw movement servo (same as Orlok)",
  "config": {
    "servoType": "standard",
    "controllerType": "pca9685",
    "channel": 8,
    "address": 64,
    "pca9685Frequency": 50
  },
  "enabled": true,
  "modelId": "servo_miuzei_25kg"
}'
echo -e "${GREEN}  ✓ Jaw Servo created${NC}"

# Magic Box Servo (PCA9685 Channel 12)
create_part '{
  "name": "Magic Box Servo",
  "type": "servo",
  "description": "Magic box mechanism servo",
  "config": {
    "servoType": "standard",
    "controllerType": "pca9685",
    "channel": 12,
    "address": 64,
    "pca9685Frequency": 50
  },
  "enabled": true,
  "modelId": "servo_miuzei_25kg"
}'
echo -e "${GREEN}  ✓ Magic Box Servo created${NC}"

# Webcam
create_part '{
  "name": "Skulltalker Cam",
  "type": "webcam",
  "description": "Main webcam",
  "config": {
    "devicePath": "/dev/video0",
    "deviceId": "video0"
  },
  "enabled": true,
  "modelId": "default-uvc-1"
}'
echo -e "${GREEN}  ✓ Webcam created${NC}"

# Webcam Microphone
create_part '{
  "name": "Webcam Microphone",
  "type": "microphone",
  "description": "Webcam built-in mic",
  "config": {
    "deviceId": "default"
  },
  "enabled": true,
  "modelId": "mic_generic_usb"
}'
echo -e "${GREEN}  ✓ Microphone created${NC}"

# Speakers
create_part '{
  "name": "Speaker Skulltalker",
  "type": "speaker",
  "description": "Main speaker",
  "config": {
    "device": "default",
    "volume": 80
  },
  "enabled": true,
  "modelId": "default_speaker"
}'
echo -e "${GREEN}  ✓ Speaker created${NC}"

echo ""
echo -e "${GREEN}✅ Skulltalker configuration complete!${NC}"
echo ""
echo "Parts created:"
echo "  - Head Servo (PCA9685 Channel 0)"
echo "  - Jaw Servo (PCA9685 Channel 8 - same as Orlok)"
echo "  - Magic Box Servo (PCA9685 Channel 12)"
echo "  - Webcam"
echo "  - Webcam Microphone"
echo "  - Speaker"

