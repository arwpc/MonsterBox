from gpiozero import MotionSensor
import json
import sys
import time

def test_motion_sensor(pin, duration=None):
    pir = MotionSensor(pin)
    start_time = time.time()
    last_state = None

    while duration is None or time.time() - start_time < duration:
        current_state = pir.motion_detected
        if current_state != last_state:
            if current_state:
                print(json.dumps({"status": "Motion Detected"}), flush=True)
            else:
                print(json.dumps({"status": "No Motion"}), flush=True)
            last_state = current_state
        time.sleep(0.1)  # Reduced sleep time for more responsive detection

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print(json.dumps({"error": "Usage: python test_sensor.py <pin> [duration]"}), file=sys.stderr)
        sys.exit(1)
    
    try:
        pin = int(sys.argv[1])
        duration = int(sys.argv[2]) if len(sys.argv) == 3 else None
        test_motion_sensor(pin, duration)
    except ValueError:
        print(json.dumps({"error": "Invalid GPIO pin number or duration"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
