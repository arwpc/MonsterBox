import RPi.GPIO as GPIO
import time
import sys

def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def cleanup_gpio():
    GPIO.cleanup()

def control_light(gpio_pin, state, duration=None):
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.OUT)

    try:
        # Invert the logic - set LOW for ON and HIGH for OFF
        if state.lower() == 'on':
            GPIO.output(gpio_pin, GPIO.LOW)  # Changed from HIGH to LOW
            print(f"Light on GPIO pin {gpio_pin} is ON")
        elif state.lower() == 'off':
            GPIO.output(gpio_pin, GPIO.HIGH)  # Changed from LOW to HIGH
            print(f"Light on GPIO pin {gpio_pin} is OFF")
        else:
            print("Invalid state. Use 'on' or 'off'.")
            return

        if duration is not None:
            time.sleep(float(duration) / 1000)  # Convert duration to seconds
            GPIO.output(gpio_pin, GPIO.HIGH)  # Set to HIGH (OFF) after duration
            print(f"Light on GPIO pin {gpio_pin} turned OFF after {duration} ms")
    finally:
        cleanup_gpio()

if __name__ == "__main__":
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python light_control.py <gpio_pin> <state> [duration]")
        sys.exit(1)

    gpio_pin = int(sys.argv[1])
    state = sys.argv[2]
    duration = int(sys.argv[3]) if len(sys.argv) == 4 else None

    try:
        control_light(gpio_pin, state, duration)
        print("Light control completed successfully")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
