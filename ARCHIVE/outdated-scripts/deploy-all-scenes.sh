#!/bin/bash

# Deploy All Animatronic Scenes
# This script creates scenes for all animatronics and starts them in loop mode

set -e  # Exit on error

PASSWORD="raspberry"

echo "=========================================="
echo "Deploying Animatronic Scenes"
echo "=========================================="
echo ""

# Function to create a scene via API
create_scene() {
    local HOST=$1
    local SCENE_DATA=$2
    local SCENE_NAME=$3
    
    echo "Creating scene '$SCENE_NAME' on $HOST..."
    RESPONSE=$(sshpass -p "$PASSWORD" ssh remote@$HOST "curl -s -X POST 'http://localhost:3000/scenes/api' \
      -H 'Content-Type: application/json' \
      -d '$SCENE_DATA'")
    
    SCENE_ID=$(echo "$RESPONSE" | jq -r '.scene.id // .sceneId // empty')
    
    if [ -z "$SCENE_ID" ]; then
        echo "  ❌ Failed to create scene"
        echo "  Response: $RESPONSE"
        return 1
    else
        echo "  ✅ Scene created with ID: $SCENE_ID"
        echo "$SCENE_ID"
    fi
}

# Function to start scene in loop
start_scene_loop() {
    local HOST=$1
    local SCENE_ID=$2
    local SCENE_NAME=$3
    
    echo "Starting scene '$SCENE_NAME' (ID: $SCENE_ID) in loop mode on $HOST..."
    
    # Clear queue
    sshpass -p "$PASSWORD" ssh remote@$HOST "curl -s -X POST 'http://localhost:3000/scenes/api/queue/clear'" > /dev/null
    
    # Start loop
    RESPONSE=$(sshpass -p "$PASSWORD" ssh remote@$HOST "curl -s -X POST 'http://localhost:3000/scenes/api/queue/start-config' \
      -H 'Content-Type: application/json' \
      -d '{\"mode\":\"loop_queue\",\"scenes\":[{\"scene_id\":$SCENE_ID}]}'")
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
    
    if [ "$SUCCESS" = "true" ]; then
        echo "  ✅ Loop started"
    else
        echo "  ❌ Failed to start loop"
        echo "  Response: $RESPONSE"
    fi
}

echo "1. Creating Coffin Scene..."
echo "----------------------------"
COFFIN_SCENE='{
  "name": "Coffin Story Loop",
  "steps": [
    {"type": "sound", "sound_file": "I M Stuck In This Coffin Plea.mp3", "volume": 80, "concurrent": true},
    {"type": "linear_actuator", "actuator_id": "coffin_door", "direction": "extend", "speed": 85, "duration": 8500, "concurrent": true},
    {"type": "servo", "servo_id": "neck_movement", "angle": -30, "duration": 3000, "concurrent": true},
    {"type": "servo", "servo_id": "jaw", "angle": 120, "duration": 500, "concurrent": true},
    {"type": "servo", "servo_id": "eyes", "angle": -20, "duration": 4000, "concurrent": true},
    {"type": "ai_speech", "text": "Tell a creepy first-person story about how you got stuck in this coffin and who Orlok is. Make it scary and atmospheric."},
    {"type": "ai_speech", "text": "Say good night in a creepy, ominous way"},
    {"type": "linear_actuator", "actuator_id": "coffin_door", "direction": "retract", "speed": 85, "duration": 8500}
  ]
}'

COFFIN_ID=$(create_scene "coffin.lan" "$COFFIN_SCENE" "Coffin Story Loop")
if [ ! -z "$COFFIN_ID" ]; then
    start_scene_loop "coffin.lan" "$COFFIN_ID" "Coffin Story Loop"
fi

echo ""
echo "2. Creating Groundbreaker Scene..."
echo "-----------------------------------"
GROUNDBREAKER_SCENE='{
  "name": "Groundbreaker Insults Loop",
  "steps": [
    {"type": "servo", "servo_id": "head_pan", "angle": -20, "duration": 2000, "concurrent": true},
    {"type": "ai_speech", "text": "Deliver a random scary insult or threat. Be menacing and intimidating."},
    {"type": "servo", "servo_id": "head_pan", "angle": 20, "duration": 2000, "concurrent": true},
    {"type": "pause", "duration": 28000}
  ]
}'

GROUNDBREAKER_ID=$(create_scene "groundbreaker.lan" "$GROUNDBREAKER_SCENE" "Groundbreaker Insults Loop")
if [ ! -z "$GROUNDBREAKER_ID" ]; then
    start_scene_loop "groundbreaker.lan" "$GROUNDBREAKER_ID" "Groundbreaker Insults Loop"
fi

echo ""
echo "3. Creating Orlok Scene..."
echo "--------------------------"
ORLOK_SCENE='{
  "name": "Orlok Mina Story",
  "steps": [
    {"type": "servo", "servo_id": "left_arm", "angle": 0, "duration": 2000, "concurrent": true},
    {"type": "servo", "servo_id": "right_arm", "angle": 0, "duration": 2000},
    {"type": "servo", "servo_id": "head_pan", "angle": 0, "duration": 1000},
    {"type": "sound", "sound_file": "Coffin 1.mp3", "volume": 80, "concurrent": true},
    {"type": "ai_speech", "text": "Tell a dark, romantic story about Mina. Speak as Count Orlok from Nosferatu. Make it atmospheric and gothic."},
    {"type": "servo", "servo_id": "right_arm", "angle": 180, "duration": 3000},
    {"type": "goblin_video", "goblin_id": "goblin2", "video_file": "fireball.mp4"},
    {"type": "ai_speech", "text": "Say Now the castle burns in a dramatic, ominous voice"},
    {"type": "servo", "servo_id": "right_arm", "angle": 0, "duration": 2000}
  ]
}'

ORLOK_ID=$(create_scene "orlok.lan" "$ORLOK_SCENE" "Orlok Mina Story")
if [ ! -z "$ORLOK_ID" ]; then
    start_scene_loop "orlok.lan" "$ORLOK_ID" "Orlok Mina Story"
fi

echo ""
echo "4. Creating PumpkinHead Scene..."
echo "---------------------------------"
PUMPKINHEAD_SCENE='{
  "name": "PumpkinHead Scare Loop",
  "steps": [
    {"type": "motor", "motor_id": "shake", "action": "oscillate", "duration": 2000},
    {"type": "sound", "sound_file": "Roar.mp3", "volume": 90},
    {"type": "ai_speech", "text": "Say something terrifying and scary. Use your dark pumpkin personality. Keep it short and menacing."}
  ]
}'

PUMPKINHEAD_ID=$(create_scene "pumpkinhead.lan" "$PUMPKINHEAD_SCENE" "PumpkinHead Scare Loop")
if [ ! -z "$PUMPKINHEAD_ID" ]; then
    start_scene_loop "pumpkinhead.lan" "$PUMPKINHEAD_ID" "PumpkinHead Scare Loop"
fi

echo ""
echo "=========================================="
echo "Deployment Summary"
echo "=========================================="
echo ""

# Check status of all animatronics
echo "Coffin:"
sshpass -p "$PASSWORD" ssh remote@coffin.lan "curl -s http://localhost:3000/scenes/api/queue" | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo ""
echo "Groundbreaker:"
sshpass -p "$PASSWORD" ssh remote@groundbreaker.lan "curl -s http://localhost:3000/scenes/api/queue" | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo ""
echo "Orlok:"
sshpass -p "$PASSWORD" ssh remote@orlok.lan "curl -s http://localhost:3000/scenes/api/queue" | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo ""
echo "PumpkinHead:"
sshpass -p "$PASSWORD" ssh remote@pumpkinhead.lan "curl -s http://localhost:3000/scenes/api/queue" | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo ""
echo "=========================================="
echo "✅ All scenes deployed and running in loops!"
echo "=========================================="
