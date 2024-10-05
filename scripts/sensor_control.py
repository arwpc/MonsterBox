import RPi.GPIO as GPIO
import time
import sys
import json

def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def cleanup_gpio():
    GPIO.cleanup()

def control_sensor(gpio_pin, duration):
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.IN)

    print(json.dumps({"status": f"Monitoring sensor on GPIO pin {gpio_pin} for {duration} seconds"}))
    sys.stdout.flush()

    start_time = time.time()
    try:
        while time.time() - start_time < duration:
            if GPIO.input(gpio_pin):
                print(json.dumps({"status": "Motion detected!", "result": "motion"}))
                sys.stdout.flush()
                return
            time.sleep(0.1)
        
        print(json.dumps({"status": "No motion detected within the specified duration", "result": "no_motion"}))
        sys.stdout.flush()
    except KeyboardInterrupt:
        print(json.dumps({"status": "Monitoring stopped", "result": "interrupted"}))
        sys.stdout.flush()
    finally:
        cleanup_gpio()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: python sensor_control.py <gpio_pin> <duration>"}))
        sys.exit(1)

    try:
        gpio_pin = int(sys.argv[1])
        duration = float(sys.argv[2])
        control_sensor(gpio_pin, duration)
    except ValueError:
        print(json.dumps({"error": "Invalid GPIO pin number or duration"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)