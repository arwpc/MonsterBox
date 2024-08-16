import RPi.GPIO as GPIO
import sys
import time
import logging

# Set up logging
logging.basicConfig(filename='motor_control.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

def control_motor(direction, speed, duration):
    logging.info(f"Controlling motor: direction={direction}, speed={speed}, duration={duration}")
    
    # Use fixed pins for now
    DIR_PIN = 18
    PWM_PIN = 24

    GPIO.setmode(GPIO.BCM)
    GPIO.setup(DIR_PIN, GPIO.OUT)
    GPIO.setup(PWM_PIN, GPIO.OUT)

    pwm = GPIO.PWM(PWM_PIN, 100)  # Use a default frequency of 100 Hz
    pwm.start(0)

    try:
        GPIO.output(DIR_PIN, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm.ChangeDutyCycle(speed)
        time.sleep(duration / 1000)  # Convert duration to seconds
        pwm.ChangeDutyCycle(0)
    except Exception as e:
        logging.error(f"Error controlling motor: {str(e)}")
        raise
    finally:
        pwm.stop()
        GPIO.cleanup([DIR_PIN, PWM_PIN])

if __name__ == "__main__":
    if len(sys.argv) != 4:
        logging.error("Incorrect number of arguments")
        print("Usage: python motor_control.py <direction> <speed> <duration>")
        sys.exit(1)

    direction = sys.argv[1]
    speed = int(sys.argv[2])
    duration = int(sys.argv[3])

    try:
        control_motor(direction, speed, duration)
        print("Motor control successful")
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        print(f"Error: {str(e)}")
    finally:
        # Only clean up if GPIO was set up
        if GPIO.getmode() is not None:
            GPIO.cleanup()
            logging.info("GPIO cleanup completed")
