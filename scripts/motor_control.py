import sys
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

try:
    import RPi.GPIO as GPIO
except ImportError:
    logging.error("Failed to import RPi.GPIO. Make sure it's installed and you're running on a Raspberry Pi.")
    sys.exit(1)

def setup_gpio(dir_pin, pwm_pin):
    try:
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(dir_pin, GPIO.OUT)
        GPIO.setup(pwm_pin, GPIO.OUT)
        logging.info(f"GPIO setup complete for pins: dir_pin={dir_pin}, pwm_pin={pwm_pin}")
    except Exception as e:
        logging.error(f"Failed to setup GPIO: {str(e)}")
        raise

def cleanup_gpio(dir_pin, pwm_pin):
    try:
        GPIO.cleanup([dir_pin, pwm_pin])
        logging.info(f"GPIO cleanup complete for pins: dir_pin={dir_pin}, pwm_pin={pwm_pin}")
    except Exception as e:
        logging.error(f"Failed to cleanup GPIO: {str(e)}")

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    setup_gpio(dir_pin, pwm_pin)
    pwm = GPIO.PWM(pwm_pin, 100)  # Use a default frequency of 100 Hz
    pwm.start(0)

    try:
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm.ChangeDutyCycle(speed)
        logging.info(f"Motor control started: direction={direction}, speed={speed}, duration={duration}ms")
        time.sleep(duration / 1000)  # Convert duration to seconds
        pwm.ChangeDutyCycle(0)
        logging.info("Motor control completed")
    except Exception as e:
        logging.error(f"Error during motor control: {str(e)}")
        raise
    finally:
        pwm.stop()
        cleanup_gpio(dir_pin, pwm_pin)

if __name__ == "__main__":
    if len(sys.argv) != 6:
        logging.error("Incorrect number of arguments")
        print("Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>")
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = int(sys.argv[2])
        duration = int(sys.argv[3])
        dir_pin = int(sys.argv[4])
        pwm_pin = int(sys.argv[5])

        logging.info(f"Executing: control_motor({direction}, {speed}, {duration}, {dir_pin}, {pwm_pin})")
        control_motor(direction, speed, duration, dir_pin, pwm_pin)
        print("Motor control executed successfully")
    except ValueError as ve:
        logging.error(f"Invalid argument value: {str(ve)}")
        sys.exit(1)
    except Exception as e:
        logging.error(f"An unexpected error occurred: {str(e)}")
        sys.exit(1)
