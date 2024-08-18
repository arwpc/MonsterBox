import RPi.GPIO as GPIO
import time
import json
import requests
from gpiozero import MotionSensor

# Load sensor and armed sensor data
try:
    with open('/home/remote/monsterbox/MonsterBox/data/sensors.json', 'r') as f:
        sensors = json.load(f)
except FileNotFoundError:
    print("sensors.json not found. Please make sure it exists and contains sensor data.")
    sensors = []

try:
    with open('/home/remote/monsterbox/MonsterBox/data/armedSensors.json', 'r') as f:
        armed_sensors = json.load(f)
except FileNotFoundError:
    print("armedSensors.json not found. Creating an empty file.")
    armed_sensors = []
    with open('/home/remote/monsterbox/MonsterBox/data/armedSensors.json', 'w') as f:
        json.dump(armed_sensors, f)

# Initialize GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Set up motion sensors
motion_sensors = {}
for sensor in sensors:
    if sensor['type'] == 'motion' and sensor.get('active', False):
        try:
            pin = sensor['gpioPin']
            GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
            motion_sensors[sensor['id']] = pin
            print(f"Set up motion sensor {sensor['id']} on GPIO pin {pin}")
        except Exception as e:
            print(f"Error setting up sensor {sensor['id']}: {str(e)}")

def trigger_scene(sensor_id, scene_id):
    print(f"Triggering scene {scene_id} for sensor {sensor_id}")
    try:
        requests.post('http://localhost:3000/scenes/trigger', json={'sensorId': sensor_id, 'sceneId': scene_id})
    except requests.exceptions.RequestException as e:
        print(f"Error triggering scene: {str(e)}")

try:
    print("Starting Active Mode Monitor")
    while True:
        for armed_sensor in armed_sensors:
            sensor_id = armed_sensor['sensorId']
            scene_id = armed_sensor['sceneId']
            if sensor_id in motion_sensors:
                if GPIO.input(motion_sensors[sensor_id]):
                    trigger_scene(sensor_id, scene_id)
                    time.sleep(1)  # Debounce
        time.sleep(0.1)  # Small delay to prevent CPU overuse

except KeyboardInterrupt:
    print("Stopping Active Mode Monitor")

finally:
    GPIO.cleanup()
