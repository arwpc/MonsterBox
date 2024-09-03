import RPi.GPIO as GPIO
import sys
import time

def setup_gpio(pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT)
    return GPIO.PWM(pin, 100)  # 100 Hz PWM frequency

def control_led(pin, state, duration):
    pwm = setup_gpio(pin)
    try:
        if state.lower() == 'on':
            pwm.start(100)  # Full brightness
        elif state.lower() == 'off':
            pwm.start(0)    # Off
        else:
            print("Invalid state. Use 'on' or 'off'.")
            return
        time.sleep(duration / 1000)  # Convert duration to seconds
    finally:
        pwm.stop()
        GPIO.cleanup(pin)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python led_control.py <pin> <state> <duration>")
        sys.exit(1)

    pin = int(sys.argv[1])
    state = sys.argv[2]
    duration = int(sys.argv[3])

    try:
        control_led(pin, state, duration)
        print("LED control successful")
    except Exception as e:
        print(f"Error controlling LED: {str(e)}")
        sys.exit(1)