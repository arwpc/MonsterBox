import RPi.GPIO as GPIO
import sys
import time

def setup_gpio(pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT)

def control_light(pin, state, duration):
    setup_gpio(pin)
    try:
        GPIO.output(pin, GPIO.HIGH if state == 'on' else GPIO.LOW)
        time.sleep(duration / 1000)  # Convert duration to seconds
    finally:
        GPIO.cleanup(pin)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python light_control.py <pin> <state> <duration>")
        sys.exit(1)

    pin = int(sys.argv[1])
    state = sys.argv[2]
    duration = int(sys.argv[3])

    if state not in ['on', 'off']:
        print("State must be 'on' or 'off'")
        sys.exit(1)

    try:
        control_light(pin, state, duration)
        print("Light control successful")
    except Exception as e:
        print(f"Error controlling light: {str(e)}")
        sys.exit(1)
