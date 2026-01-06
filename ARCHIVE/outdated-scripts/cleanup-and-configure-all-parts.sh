#!/bin/bash
# Clean up test parts and configure real working parts for all characters

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "MonsterBox Parts Cleanup & Configuration"
echo "=========================================="
echo ""

# Character IPs
declare -A IPS
IPS[1]="192.168.8.150"  # PumpkinHead
IPS[2]="192.168.8.140"  # Coffin Breaker
IPS[3]="192.168.8.120"  # Orlok
IPS[4]="192.168.8.130"  # Skulltalker
IPS[5]="192.168.8.200"  # Groundbreaker

# Function to delete all parts for a character
delete_all_parts() {
    local char_id=$1
    local ip=$2
    local name=$3
    
    echo -e "${YELLOW}Cleaning up $name (Character $char_id)...${NC}"
    
    # Get all part IDs
    part_ids=$(curl -s "http://${ip}:3000/api/parts" | jq -r '.[].id' 2>/dev/null || echo "")
    
    if [ -z "$part_ids" ]; then
        echo -e "${BLUE}  No parts to delete${NC}"
        return
    fi
    
    # Delete each part
    for part_id in $part_ids; do
        curl -s -X DELETE "http://${ip}:3000/api/parts/${part_id}" > /dev/null 2>&1
        echo -e "${BLUE}  Deleted part ID: $part_id${NC}"
    done
    
    echo -e "${GREEN}  ✓ Cleanup complete${NC}"
}

# Function to create a part
create_part() {
    local ip=$1
    local data=$2
    
    curl -s -X POST "http://${ip}:3000/api/parts" \
        -H "Content-Type: application/json" \
        -d "$data" > /dev/null 2>&1
}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ORLOK (Character 3) - Keep existing working parts${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "Orlok already configured - skipping"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}COFFIN BREAKER (Character 2)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
delete_all_parts 2 "${IPS[2]}" "Coffin Breaker"

echo "Creating Coffin Breaker parts..."

# Jaw Servo (PCA9685 Channel 4)
create_part "${IPS[2]}" '{
  "name": "Jaw of Coffin",
  "type": "servo",
  "description": "Jaw movement servo",
  "config": {
    "servoType": "standard",
    "controllerType": "pca9685",
    "channel": 4,
    "address": 64,
    "pca9685Frequency": 50
  },
  "enabled": true,
  "modelId": "servo_miuzei_mg90s"
}'

# Head Servo (PCA9685 Channel 0)
create_part "${IPS[2]}" '{
  "name": "Neck Movement",
  "type": "servo",
  "description": "Head/neck servo",
  "config": {
    "servoType": "standard",
    "controllerType": "pca9685",
    "channel": 0,
    "address": 64,
    "pca9685Frequency": 50
  },
  "enabled": true,
  "modelId": "servo_miuzei_mg90s"
}'

# Eye Servo (PCA9685 Channel 2)
create_part "${IPS[2]}" '{
  "name": "Eye Servos",
  "type": "servo",
  "description": "Eye movement servo",
  "config": {
    "servoType": "standard",
    "controllerType": "pca9685",
    "channel": 2,
    "address": 64,
    "pca9685Frequency": 50
  },
  "enabled": true,
  "modelId": "servo_miuzei_mg90s"
}'

# Linear Actuator (MDD10A DIR=5, PWM=13)
create_part "${IPS[2]}" '{
  "name": "Coffin Door",
  "type": "linear_actuator",
  "description": "Coffin door actuator",
  "config": {},
  "enabled": true,
  "controlBoard": "MDD10A",
  "directionPin": 5,
  "pwmPin": 13,
  "maxExtension": 15000,
  "maxRetraction": 15000,
  "modelId": "1759010196402"
}'

# Light (GPIO 16)
create_part "${IPS[2]}" '{
  "name": "Burning Rose",
  "type": "light",
  "pin": 16,
  "description": "Rose light",
  "config": {},
  "enabled": true,
  "modelId": "light_generic_12v"
}'

# Speakers
create_part "${IPS[2]}" '{
  "name": "Speaker Coffin",
  "type": "speaker",
  "description": "Main speaker",
  "config": {
    "device": "default",
    "volume": 80
  },
  "enabled": true,
  "modelId": "default_speaker"
}'

# Webcam
create_part "${IPS[2]}" '{
  "name": "Coffin Cam",
  "type": "webcam",
  "description": "Main webcam",
  "config": {
    "devicePath": "/dev/video0",
    "deviceId": "video0"
  },
  "enabled": true,
  "modelId": "default-uvc-1"
}'

# Webcam Microphone
create_part "${IPS[2]}" '{
  "name": "Webcam Microphone",
  "type": "microphone",
  "description": "Webcam built-in mic",
  "config": {
    "deviceId": "default"
  },
  "enabled": true,
  "modelId": "mic_generic_usb"
}'

# PIR Sensor (GPIO 26)
create_part "${IPS[2]}" '{
  "name": "PIR Motion Sensor",
  "type": "motion_sensor",
  "pin": 26,
  "description": "PIR motion detection",
  "config": {},
  "enabled": true
}'

echo -e "${GREEN}✓ Coffin Breaker parts created${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}GROUNDBREAKER (Character 5)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
delete_all_parts 5 "${IPS[5]}" "Groundbreaker"

echo "Creating Groundbreaker parts..."

# Head Motor (MDD10A - CAREFUL!)
create_part "${IPS[5]}" '{
  "name": "Head Motor",
  "type": "motor",
  "description": "Head rotation motor - BE CAREFUL",
  "config": {},
  "enabled": true,
  "controlBoard": "MDD10A",
  "directionPin": 18,
  "pwmPin": 13,
  "maxDuration": 5000
}'

# Speakers
create_part "${IPS[5]}" '{
  "name": "Speaker Groundbreaker",
  "type": "speaker",
  "description": "Main speaker",
  "config": {
    "device": "default",
    "volume": 80
  },
  "enabled": true,
  "modelId": "default_speaker"
}'

# Webcam
create_part "${IPS[5]}" '{
  "name": "Groundbreaker Cam",
  "type": "webcam",
  "description": "Main webcam",
  "config": {
    "devicePath": "/dev/video0",
    "deviceId": "video0"
  },
  "enabled": true,
  "modelId": "default-uvc-1"
}'

# Webcam Microphone
create_part "${IPS[5]}" '{
  "name": "Webcam Microphone",
  "type": "microphone",
  "description": "Webcam built-in mic",
  "config": {
    "deviceId": "default"
  },
  "enabled": true,
  "modelId": "mic_generic_usb"
}'

echo -e "${GREEN}✓ Groundbreaker parts created${NC}"
echo ""

echo "Script complete! Use individual character scripts for PumpkinHead and Skulltalker..."

