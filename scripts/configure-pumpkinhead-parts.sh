#!/bin/bash
# Configure PumpkinHead (Character 1) parts

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

IP="192.168.8.150"

echo "=========================================="
echo "PumpkinHead Parts Configuration"
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
echo "Creating PumpkinHead parts..."

# Wiper Motor (MDD10A DIR=26, PWM=13)
create_part '{
  "name": "Wiper Motor",
  "type": "motor",
  "description": "Main wiper motor for movement",
  "config": {},
  "enabled": true,
  "controlBoard": "MDD10A",
  "directionPin": 26,
  "pwmPin": 13,
  "maxDuration": 10000
}'
echo -e "${GREEN}  ✓ Wiper Motor created${NC}"

# Light (GPIO 16)
create_part '{
  "name": "PumpkinHead Light",
  "type": "light",
  "pin": 16,
  "description": "Main light",
  "config": {},
  "enabled": true,
  "modelId": "light_generic_12v"
}'
echo -e "${GREEN}  ✓ Light created${NC}"

# Speaker 1
create_part '{
  "name": "Speaker Left",
  "type": "speaker",
  "description": "Left speaker",
  "config": {
    "device": "default",
    "volume": 80
  },
  "enabled": true,
  "modelId": "default_speaker"
}'
echo -e "${GREEN}  ✓ Speaker Left created${NC}"

# Speaker 2
create_part '{
  "name": "Speaker Right",
  "type": "speaker",
  "description": "Right speaker",
  "config": {
    "device": "default",
    "volume": 80
  },
  "enabled": true,
  "modelId": "default_speaker"
}'
echo -e "${GREEN}  ✓ Speaker Right created${NC}"

echo ""
echo -e "${GREEN}✅ PumpkinHead configuration complete!${NC}"
echo ""
echo "Parts created:"
echo "  - Wiper Motor (MDD10A DIR=26, PWM=13)"
echo "  - Light (GPIO 16)"
echo "  - Speaker Left"
echo "  - Speaker Right"

