import RPi.GPIO as GPIO
import sys
import time

def setup_gpio(pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT)
    return GPIO.PWM(pin, 50)  # 50 Hz PWM frequency

def angle_to_duty_cycle(angle):
    return 2 + (angle / 18)  # Maps 0-180 degrees to 2-12% duty cycle

def control_servo(pin, angle, speed, duration):
    pwm = setup_gpio(pin)
    try:
        pwm.start(0)
        duty_cycle = angle_to_duty_cycle(angle)
        pwm.ChangeDutyCycle(duty_cycle)
        time.sleep(duration / 1000)  # Convert duration to seconds
    finally:
        pwm.stop()
        GPIO.cleanup(pin)

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python servo_control.py <pin> <angle> <speed> <duration>")
        sys.exit(1)

    pin = int(sys.argv[1])
    angle = float(sys.argv[2])
    speed = float(sys.argv[3])  # Note: speed is not used in this basic implementation
    duration = int(sys.argv[4])

    try:
        control_servo(pin, angle, speed, duration)
        print("Servo control successful")
    except Exception as e:
        print(f"Error controlling servo: {str(e)}")
        sys.exit(1)
