from gpiozero import MotionSensor
import json
import sys
import time

def test_motion_sensor(pin):
    pir = MotionSensor(pin)

    while True:
        if pir.motion_detected:
            print(json.dumps({"status": "Motion Detected"}), flush=True)
        else:
            print(json.dumps({"status": "No Motion"}), flush=True)
        time.sleep(0.5)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python test_sensor.py <pin>"}), file=sys.stderr)
        sys.exit(1)
    
    try:
        pin = int(sys.argv[1])
        test_motion_sensor(pin)
    except ValueError:
        print(json.dumps({"error": "Invalid GPIO pin number"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
