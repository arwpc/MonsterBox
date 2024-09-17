import RPi.GPIO as GPIO
import time
import sys

def test_actuator(dir_pin, pwm_pin):
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(dir_pin, GPIO.OUT)
        GPIO.setup(pwm_pin, GPIO.OUT)

        pwm = GPIO.PWM(pwm_pin, 100)  # 100Hz frequency

        print(f"Testing actuator with direction pin {dir_pin} and PWM pin {pwm_pin}")

        # Test forward movement
        print("Moving forward...")
        GPIO.output(dir_pin, GPIO.LOW)
        pwm.start(50)  # 50% duty cycle
        time.sleep(2)
        pwm.stop()

        time.sleep(1)  # Pause between movements

        # Test backward movement
        print("Moving backward...")
        GPIO.output(dir_pin, GPIO.HIGH)
        pwm.start(50)  # 50% duty cycle
        time.sleep(2)
        pwm.stop()

        print("Test completed")

    except Exception as e:
        print(f"Error during test: {str(e)}")

    finally:
        GPIO.cleanup([dir_pin, pwm_pin])

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 test_linear_actuator.py <dir_pin> <pwm_pin>")
        sys.exit(1)

    dir_pin = int(sys.argv[1])
    pwm_pin = int(sys.argv[2])

    test_actuator(dir_pin, pwm_pin)