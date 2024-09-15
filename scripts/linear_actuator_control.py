# File: scripts/linear_actuator_control.py

import RPi.GPIO as GPIO
import time
import sys

def setup_gpio(dir_pin, pwm_pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)
    return GPIO.PWM(pwm_pin, 100)  # 100Hz frequency

def control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction):
    pwm = setup_gpio(dir_pin, pwm_pin)
    
    try:
        GPIO.output(dir_pin, GPIO.LOW if direction == 'forward' else GPIO.HIGH)
        pwm.start(speed)
        
        # Calculate the actual duration based on direction and limits
        if direction == 'forward':
            actual_duration = min(duration, max_extension)
        else:
            actual_duration = min(duration, max_retraction)
        
        time.sleep(actual_duration / 1000)  # Convert duration to seconds
    finally:
        pwm.stop()
        GPIO.cleanup([dir_pin, pwm_pin])

if __name__ == "__main__":
    if len(sys.argv) < 8:
        print("Usage: python3 linear_actuator_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin> <max_extension> <max_retraction>")
        sys.exit(1)

    direction = sys.argv[1]
    speed = int(sys.argv[2])
    duration = int(sys.argv[3])
    dir_pin = int(sys.argv[4])
    pwm_pin = int(sys.argv[5])
    max_extension = int(sys.argv[6])
    max_retraction = int(sys.argv[7])

    try:
        control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction)
        print("Linear actuator control successful")
    except Exception as e:
        print(f"Error controlling linear actuator: {str(e)}")
        sys.exit(1)