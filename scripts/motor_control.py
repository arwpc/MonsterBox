import RPi.GPIO as GPIO
import sys
import time
import logging

# Set up logging
logging.basicConfig(filename='motor_control.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    logging.info(f"Controlling motor: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}")

    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)

    pwm = GPIO.PWM(pwm_pin, 100)  # Use a default frequency of 100 Hz
    pwm.start(0)

    try:
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm.ChangeDutyCycle(int(speed))
        time.sleep(int(duration) / 1000)  # Convert duration to seconds
        pwm.ChangeDutyCycle(0)
    except Exception as e:
        logging.error(f"Error controlling motor: {str(e)}")
        raise
    finally:
        pwm.stop()
        GPIO.cleanup([dir_pin, pwm_pin])

if __name__ == "__main__":
    if len(sys.argv) != 6:
        logging.error("Incorrect number of arguments")
        print("Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>")
        sys.exit(1)

    direction = sys.argv[1]
    speed = sys.argv[2]
    duration = sys.argv[3]
    dir_pin = int(sys.argv[4])
    pwm_pin = int(sys.argv[5])

    try:
        control_motor(direction, speed, duration, dir_pin, pwm_pin)
        print("Motor control successful")
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        print(f"Error: {str(e)}")
    finally:
        # Only clean up if GPIO was set up
        if GPIO.getmode() is not None:
            GPIO.cleanup()
            logging.info("GPIO cleanup completed")
