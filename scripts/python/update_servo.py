#!/usr/bin/env python3

import json

def update_servo_config():
    try:
        # Read the current parts.json
        with open('data/parts.json', 'r') as f:
            data = json.load(f)
        
        # Remove the old jaw servo for Skulltalker (characterId 4)
        data = [part for part in data if not (part.get('name') == 'Jaw Servo' and part.get('characterId') == 4)]
        
        # Add the new MG90S servo with GPIO configuration
        new_servo = {
            "id": 19,
            "name": "Jaw Servo",
            "type": "servo",
            "characterId": 4,
            "pin": 18,
            "usePCA9685": False,
            "channel": None,
            "servoType": "Miuzei MG90S",
            "minPulse": 500,
            "maxPulse": 2400,
            "defaultAngle": 90,
            "mode": ["Standard"],
            "feedback": False,
            "controlType": ["PWM"],
            "createdAt": "2025-06-07T23:00:00.000Z"
        }
        
        data.append(new_servo)
        
        # Write the updated data back
        with open('data/parts.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print("Successfully updated servo configuration:")
        print(f"- Removed old jaw servo for Skulltalker")
        print(f"- Added new MG90S servo on GPIO 18")
        print(f"- Servo type: Miuzei MG90S")
        print(f"- Pulse range: 500-2400µs")
        print(f"- Control: Direct GPIO (no PCA9685)")
        
    except Exception as e:
        print(f"Error updating servo config: {e}")

if __name__ == "__main__":
    update_servo_config()
