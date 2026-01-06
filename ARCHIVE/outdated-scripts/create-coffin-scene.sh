#!/bin/bash

# Create Coffin Scene
# Character ID: 2 (Coffin)
# Scene: Play music, open coffin door, head/jaw/eyes move, AI tells story, says good night, closes coffin

echo "Creating Coffin scene..."

curl -s -X POST "http://coffin.lan:3000/scenes/api" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Coffin Story Loop",
    "steps": [
      {
        "type": "sound",
        "sound_file": "Stuck in a Coffin.mp3",
        "duration": 1000,
        "action": "play"
      },
      {
        "type": "linear_actuator",
        "actuator_id": "coffin_door",
        "action": "extend",
        "position": 85,
        "duration": 8500
      },
      {
        "type": "motor",
        "motor_id": "head_pan",
        "action": "sweep",
        "start_position": -30,
        "end_position": 30,
        "duration": 3000
      },
      {
        "type": "motor",
        "motor_id": "jaw",
        "action": "oscillate",
        "duration": 5000
      },
      {
        "type": "motor",
        "motor_id": "eyes_lr",
        "action": "sweep",
        "start_position": -20,
        "end_position": 20,
        "duration": 4000
      },
      {
        "type": "ai_speech",
        "prompt": "Tell a creepy story about how you got stuck in this coffin and who Orlok is. Make it scary and atmospheric. Keep it under 30 seconds.",
        "duration": 30000
      },
      {
        "type": "ai_speech",
        "prompt": "Say good night in a creepy, ominous way",
        "duration": 3000
      },
      {
        "type": "linear_actuator",
        "actuator_id": "coffin_door",
        "action": "retract",
        "position": 0,
        "duration": 8500
      }
    ]
  }' | jq '.'

echo ""
echo "Coffin scene created!"
