import RPi.GPIO as GPIO
import time
import json
import pyaudio
import numpy as np
import requests

# Load sensor settings
with open('data/sensors.json', 'r') as f:
    sensors = json.load(f)

# Initialize GPIO
GPIO.setmode(GPIO.BCM)

# Initialize PyAudio for sound detection
p = pyaudio.PyAudio()

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

# Function to detect sound
def detect_sound(sensor):
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=44100, input=True, frames_per_buffer=1024)
    data = np.frombuffer(stream.read(1024), dtype=np.int16)
    stream.stop_stream()
    stream.close()
    
    # Calculate the sound level
    sound_level = np.abs(data).mean()
    return sound_level > sensor['sensitivity']

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
                        if detect_sound(sensor):
                            trigger_scene(sensor['id'])
                            time.sleep(1)  # Debounce
        time.sleep(0.1)  # Small delay to prevent CPU overuse

except KeyboardInterrupt:
    print("Stopping sensor monitoring")

finally:
    GPIO.cleanup()
    p.terminate()
