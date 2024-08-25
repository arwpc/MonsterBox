import RPi.GPIO as GPIO
import time
import sys

def control_light(gpio_pin, state, duration):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(gpio_pin, GPIO.OUT)

    try:
        if state.lower() == 'on':
            GPIO.output(gpio_pin, GPIO.HIGH)
            print(f"Light on GPIO pin {gpio_pin} is ON")
        elif state.lower() == 'off':
            GPIO.output(gpio_pin, GPIO.LOW)
            print(f"Light on GPIO pin {gpio_pin} is OFF")
        else:
            print("Invalid state. Use 'on' or 'off'.")
            return

        time.sleep(float(duration) / 1000)  # Convert duration to seconds
    finally:
        GPIO.cleanup(gpio_pin)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python light_control.py <gpio_pin> <state> <duration>")
        sys.exit(1)

    gpio_pin = int(sys.argv[1])
    state = sys.argv[2]
    duration = int(sys.argv[3])

    control_light(gpio_pin, state, duration)
