import RPi.GPIO as GPIO
import time
import sys

def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def cleanup_gpio():
    GPIO.cleanup()

def control_light(gpio_pin, state, duration, brightness=None):
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.OUT)

    try:
        if brightness is not None:
            pwm = GPIO.PWM(gpio_pin, 100)  # 100 Hz frequency
            pwm.start(0)
            if state.lower() == 'on':
                pwm.ChangeDutyCycle(int(brightness))
                print(f"LED on GPIO pin {gpio_pin} is ON with brightness {brightness}%")
            else:
                pwm.ChangeDutyCycle(0)
                print(f"LED on GPIO pin {gpio_pin} is OFF")
        else:
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
        if brightness is not None:
            pwm.stop()
        cleanup_gpio()

if __name__ == "__main__":
    if len(sys.argv) < 4 or len(sys.argv) > 5:
        print("Usage: python light_control.py <gpio_pin> <state> <duration> [brightness]")
        sys.exit(1)

    gpio_pin = int(sys.argv[1])
    state = sys.argv[2]
    duration = int(sys.argv[3])
    brightness = int(sys.argv[4]) if len(sys.argv) == 5 else None

    try:
        control_light(gpio_pin, state, duration, brightness)
        print("Light control completed successfully")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
    finally:
        cleanup_gpio()