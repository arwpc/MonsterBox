import RPi.GPIO as GPIO
import sys
import time

def setup_gpio(dir_pin, pwm_pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)

def cleanup_gpio(dir_pin, pwm_pin):
    GPIO.cleanup([dir_pin, pwm_pin])

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    setup_gpio(dir_pin, pwm_pin)
    pwm = GPIO.PWM(pwm_pin, 100)  # Use a default frequency of 100 Hz
    pwm.start(0)

    try:
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm.ChangeDutyCycle(speed)
        time.sleep(duration / 1000)  # Convert duration to seconds
        pwm.ChangeDutyCycle(0)
    finally:
        pwm.stop()
        cleanup_gpio(dir_pin, pwm_pin)

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>")
        sys.exit(1)

    direction = sys.argv[1]
    speed = int(sys.argv[2])
    duration = int(sys.argv[3])
    dir_pin = int(sys.argv[4])
    pwm_pin = int(sys.argv[5])

    print(f"Executing: control_motor({direction}, {speed}, {duration}, {dir_pin}, {pwm_pin})")
    control_motor(direction, speed, duration, dir_pin, pwm_pin)
    print("Motor control executed successfully")
