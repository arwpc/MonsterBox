import RPi.GPIO as GPIO
import time
import json
import requests
import os
import sys

# Get the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))

# Load sensor settings
sensors_file = os.path.join(script_dir, '..', 'data', 'sensors.json')
with open(sensors_file, 'r') as f:
    sensors = json.load(f)

# Initialize GPIO
GPIO.setmode(GPIO.BCM)

# Set up motion sensors
for sensor in sensors:
    if sensor['type'] == 'motion' and sensor['active']:
        GPIO.setup(sensor['digitalOutPin'], GPIO.IN)

# Function to check if a scene is currently playing
def is_scene_playing():
    # This function should check if a scene is currently being played
    # You'll need to implement this based on your scene playback system
    return False

# Function to trigger a scene
def trigger_scene(sensor_id):
    # This function should trigger the appropriate scene for the given sensor
    # You'll need to implement this based on your scene playback system
    print(f"Triggering scene for sensor {sensor_id}")
    requests.post('http://localhost:3000/scenes/trigger', json={'sensorId': sensor_id})

# Function to detect sound (placeholder)
def detect_sound(sensor):
    # This is a placeholder function. Actual sound detection should be implemented
    # in a separate script that's only run when needed.
    print(f"Sound detection for sensor {sensor['id']} is not implemented in this script.")
    return False

try:
    while True:
        if not is_scene_playing():
            for sensor in sensors:
                if sensor['active']:
                    if sensor['type'] == 'motion':
                        if GPIO.input(sensor['digitalOutPin']):
                            trigger_scene(sensor['id'])
                            time.sleep(1)  # Debounce
                    elif sensor['type'] == 'sound':
                        # Sound detection is not implemented in this main loop
                        # It should be handled separately to avoid audio system issues
                        pass
        time.sleep(0.1)  # Small delay to prevent CPU overuse

except KeyboardInterrupt:
    print("Stopping sensor monitoring")

finally:
    GPIO.cleanup()
