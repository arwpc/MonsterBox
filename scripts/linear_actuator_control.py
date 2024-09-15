import RPi.GPIO as GPIO
import time
import sys

def setup_gpio(dir_pin, pwm_pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)
    return GPIO.PWM(pwm_pin, 100)  # 100Hz frequency

def control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction):
    pwm = None
    try:
        pwm = setup_gpio(dir_pin, pwm_pin)
        
        GPIO.output(dir_pin, GPIO.LOW if direction == 'forward' else GPIO.HIGH)
        pwm.start(float(speed))
        
        # Calculate the actual duration based on direction and limits
        if direction == 'forward':
            actual_duration = min(int(duration), int(max_extension))
        else:
            actual_duration = min(int(duration), int(max_retraction))
        
        print(f"Moving actuator {direction} for {actual_duration}ms")
        time.sleep(actual_duration / 1000)  # Convert duration to seconds
    except Exception as e:
        print(f"Error during actuator control: {str(e)}")
    finally:
        if pwm:
            pwm.stop()
        GPIO.cleanup([dir_pin, pwm_pin])

if __name__ == "__main__":
    if len(sys.argv) < 8:
        print("Usage: python3 linear_actuator_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin> <max_extension> <max_retraction>")
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = sys.argv[2]
        duration = sys.argv[3]
        dir_pin = int(sys.argv[4])
        pwm_pin = int(sys.argv[5])
        max_extension = sys.argv[6]
        max_retraction = sys.argv[7]

        control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction)
        print("Linear actuator control completed successfully")
        sys.exit(0)
    except Exception as e:
        print(f"Error controlling linear actuator: {str(e)}")
        sys.exit(1)