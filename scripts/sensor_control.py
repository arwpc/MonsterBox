import RPi.GPIO as GPIO
import time
import sys
import json

def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def cleanup_gpio():
    GPIO.cleanup()

def control_sensor(gpio_pin):
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.IN)

    print(json.dumps({"status": f"Monitoring sensor on GPIO pin {gpio_pin}"}))
    sys.stdout.flush()

    last_status = None
    try:
        while True:
            current_status = GPIO.input(gpio_pin)
            if current_status != last_status:
                if current_status:
                    print(json.dumps({"status": "Motion detected!"}))
                else:
                    print(json.dumps({"status": "No motion detected"}))
                sys.stdout.flush()
                last_status = current_status
            time.sleep(0.1)
    except KeyboardInterrupt:
        print(json.dumps({"status": "Monitoring stopped"}))
        sys.stdout.flush()
    finally:
        cleanup_gpio()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python sensor_control.py <gpio_pin>"}))
        sys.exit(1)

    try:
        gpio_pin = int(sys.argv[1])
        control_sensor(gpio_pin)
    except ValueError:
        print(json.dumps({"error": "Invalid GPIO pin number"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)