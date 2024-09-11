# File: scripts/linear_actuator_control.py

import RPi.GPIO as GPIO
import time
import sys

def setup_gpio(dir_pin, pwm_pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)
    return GPIO.PWM(pwm_pin, 100)  # 100Hz frequency

def control_actuator(direction, speed, duration, dir_pin, pwm_pin):
    pwm = setup_gpio(dir_pin, pwm_pin)
    
    try:
        GPIO.output(dir_pin, GPIO.LOW if direction == 'forward' else GPIO.HIGH)
        pwm.start(speed)
        time.sleep(duration / 1000)  # Convert duration to seconds
    finally:
        pwm.stop()
        GPIO.cleanup([dir_pin, pwm_pin])

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 linear_actuator_control.py <direction> <speed> <duration> [dir_pin] [pwm_pin]")
        sys.exit(1)

    direction = sys.argv[1]
    speed = int(sys.argv[2])
    duration = int(sys.argv[3])
    dir_pin = int(sys.argv[4]) if len(sys.argv) > 4 else 18
    pwm_pin = int(sys.argv[5]) if len(sys.argv) > 5 else 13

    try:
        control_actuator(direction, speed, duration, dir_pin, pwm_pin)
        print("Linear actuator control successful")
    except Exception as e:
        print(f"Error controlling linear actuator: {str(e)}")
        sys.exit(1)
