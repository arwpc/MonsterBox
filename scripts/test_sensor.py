from gpiozero import MotionSensor
import json
import sys
import time

def test_motion_sensor(pin, duration=30):
    pir = MotionSensor(pin)
    end_time = time.time() + duration

    while time.time() < end_time:
        if pir.motion_detected:
            print(json.dumps({"status": "Motion Detected"}), flush=True)
        else:
            print(json.dumps({"status": "No Motion"}), flush=True)
        time.sleep(0.5)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: python test_sensor.py <pin> <duration>"}), file=sys.stderr)
        sys.exit(1)
    
    try:
        pin = int(sys.argv[1])
        duration = int(sys.argv[2])
        test_motion_sensor(pin, duration)
    except ValueError:
        print(json.dumps({"error": "Invalid GPIO pin number or duration"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)