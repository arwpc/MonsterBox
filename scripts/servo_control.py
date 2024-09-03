import RPi.GPIO as GPIO
import sys
import time

def setup_gpio(pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT)
    return GPIO.PWM(pin, 50)  # 50 Hz PWM frequency

def angle_to_duty_cycle(angle):
    return 2.5 + (angle / 18)  # Maps 0-180 degrees to 2.5-12.5% duty cycle

def control_servo(pin, angle, frequency, duty_cycle, duration):
    pwm = setup_gpio(pin)
    try:
        pwm.ChangeFrequency(frequency)
        pwm.start(duty_cycle)
        pwm.ChangeDutyCycle(angle_to_duty_cycle(angle))
        time.sleep(duration / 1000)  # Convert duration to seconds
    finally:
        pwm.stop()
        GPIO.cleanup(pin)

if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: python servo_control.py <pin> <angle> <frequency> <duty_cycle> <duration>")
        sys.exit(1)

    pin = int(sys.argv[1])
    angle = float(sys.argv[2])
    frequency = float(sys.argv[3])
    duty_cycle = float(sys.argv[4])
    duration = int(sys.argv[5])

    try:
        control_servo(pin, angle, frequency, duty_cycle, duration)
        print("Servo control successful")
    except Exception as e:
        print(f"Error controlling servo: {str(e)}")
        sys.exit(1)