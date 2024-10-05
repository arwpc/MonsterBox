import RPi.GPIO as GPIO
import sys
import time
import json
from python_logger import get_logger

logger = get_logger(__name__)

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    logger.info(f"Controlling motor: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}")

    pwm = None
    try:
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm = GPIO.PWM(pwm_pin, 100)  # Use a default frequency of 100 Hz
        pwm.start(0)
        pwm.ChangeDutyCycle(int(speed))
        time.sleep(int(duration) / 1000)  # Convert duration to seconds
        pwm.ChangeDutyCycle(0)
        return {"success": True, "message": "Motor control successful"}
    except Exception as e:
        logger.error(f"Error controlling motor: {str(e)}")
        return {"success": False, "error": str(e)}
    finally:
        if pwm:
            pwm.stop()

if __name__ == "__main__":
    if len(sys.argv) != 6:
        logger.error("Incorrect number of arguments")
        result = {"success": False, "error": "Incorrect number of arguments. Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"}
    else:
        direction = sys.argv[1]
        speed = sys.argv[2]
        duration = sys.argv[3]
        dir_pin = int(sys.argv[4])
        pwm_pin = int(sys.argv[5])

        gpio_setup = False
        try:
            logger.info("Setting up GPIO")
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(dir_pin, GPIO.OUT)
            GPIO.setup(pwm_pin, GPIO.OUT)
            gpio_setup = True
            logger.info("GPIO setup completed")

            result = control_motor(direction, speed, duration, dir_pin, pwm_pin)
            logger.info("Motor control execution completed")
        except Exception as e:
            logger.error(f"Error: {str(e)}")
            result = {"success": False, "error": f"Error controlling motor: {str(e)}"}
        finally:
            if gpio_setup:
                logger.info("Cleaning up GPIO")
                GPIO.cleanup([dir_pin, pwm_pin])
                logger.info("GPIO cleanup completed")
            else:
                logger.info("GPIO was not set up, skipping cleanup")

    # Print the result as JSON
    print(json.dumps(result))