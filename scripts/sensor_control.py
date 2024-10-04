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
    sys.stdout.flush()

    end_time = time.time() + float(timeout)
    last_status = None
    while time.time() < end_time:
        current_status = GPIO.input(gpio_pin)
        if current_status != last_status:
            if current_status:
                print("Motion detected!")
            else:
                print("No motion detected")
            sys.stdout.flush()
            last_status = current_status
        time.sleep(0.1)

    print("Monitoring complete")
    sys.stdout.flush()
    return last_status

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python sensor_control.py <gpio_pin> <timeout>")
        sys.exit(1)

    gpio_pin = int(sys.argv[1])
    timeout = float(sys.argv[2])

    try:
        final_status = control_sensor(gpio_pin, timeout)
        print(f"Final status: {'Motion detected' if final_status else 'No motion'}")
        sys.stdout.flush()
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.stdout.flush()
        sys.exit(1)
    finally:
        cleanup_gpio()

    sys.exit(0)
