from gpiozero import LED
import time
import sys
import json

def control_light(pin, state):
    try:
        light = LED(pin)
        if state.lower() == 'on':
            light.on()
            print(json.dumps({"status": "success", "message": f"Light on pin {pin} turned on"}))
        elif state.lower() == 'off':
            light.off()
            print(json.dumps({"status": "success", "message": f"Light on pin {pin} turned off"}))
        else:
            raise ValueError("State must be 'on' or 'off'")
            
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({
            "status": "error",
            "message": "Usage: python light_control.py <pin> <state>"
        }))
        sys.exit(1)
        
    try:
        pin = int(sys.argv[1])
        state = sys.argv[2]
        control_light(pin, state)
    except ValueError as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        sys.exit(1)
