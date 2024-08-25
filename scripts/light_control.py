import RPi.GPIO as GPIO
import time
import sys

def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def cleanup_gpio():
    GPIO.cleanup()

def control_light(gpio_pin, brightness, duration):
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.OUT)
    pwm = GPIO.PWM(gpio_pin, 100)  # 100 Hz frequency

    try:
        end_time = time.time() + (duration / 1000)
        while time.time() < end_time:
            pwm.start(brightness)
            time.sleep(0.5)
            pwm.stop()
            time.sleep(0.5)
        print(f"Light test on GPIO pin {gpio_pin} completed")
    finally:
        cleanup_gpio()

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python light_control.py <gpio_pin> <brightness> <duration>")
        sys.exit(1)

    gpio_pin = int(sys.argv[1])
    brightness = int(sys.argv[2])
    duration = int(sys.argv[3])

    try:
        control_light(gpio_pin, brightness, duration)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
    finally:
        cleanup_gpio()
