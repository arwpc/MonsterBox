import RPi.GPIO as GPIO
import sys
import time

def setup_gpio(dir_pin, pwm_pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)
    return GPIO.PWM(pwm_pin, 100)  # 100 Hz PWM frequency

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    pwm = setup_gpio(dir_pin, pwm_pin)
    try:
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm.start(int(speed))
        time.sleep(int(duration) / 1000)  # Convert duration to seconds
    finally:
        pwm.stop()
        GPIO.cleanup([dir_pin, pwm_pin])

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>")
        sys.exit(1)

    direction = sys.argv[1]
    speed = int(sys.argv[2])
    duration = int(sys.argv[3])
    dir_pin = int(sys.argv[4])
    pwm_pin = int(sys.argv[5])

    try:
        control_motor(direction, speed, duration, dir_pin, pwm_pin)
        print("Motor control executed successfully")
    except Exception as e:
        print(f"Error controlling motor: {str(e)}")
        sys.exit(1)
