import RPi.GPIO as GPIO
import time
import sys

def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def cleanup_gpio():
    GPIO.cleanup()

def control_sensor(gpio_pin, timeout):
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.IN)

    print(f"Monitoring sensor on GPIO pin {gpio_pin} for {timeout} seconds")

    end_time = time.time() + float(timeout)
    while time.time() < end_time:
        if GPIO.input(gpio_pin):
            print("Motion detected!")
            return True
        time.sleep(0.1)

    print("No motion detected within timeout period")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python sensor_control.py <gpio_pin> <timeout>")
        sys.exit(1)

    gpio_pin = int(sys.argv[1])
    timeout = float(sys.argv[2])

    try:
        motion_detected = control_sensor(gpio_pin, timeout)
        print(f"Motion detected: {motion_detected}")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
    finally:
        cleanup_gpio()

    sys.exit(0 if motion_detected else 1)
