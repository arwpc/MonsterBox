import RPi.GPIO as GPIO
import sys
import time
import json
from python_logger import get_logger

logger = get_logger(__name__)

def log_message(message):
    print(json.dumps(message), flush=True)

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    log_message({"status": "info", "message": f"Controlling motor: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}"})

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
        error_message = f"Error controlling motor: {str(e)}"
        log_message({"status": "error", "message": error_message})
        return {"success": False, "error": error_message}
    finally:
        if pwm:
            pwm.stop()

if __name__ == "__main__":
    if len(sys.argv) != 6:
        error_message = "Incorrect number of arguments. Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        log_message({"status": "error", "message": error_message})
        print(json.dumps({"success": False, "error": error_message}))
        sys.exit(1)

    direction = sys.argv[1]
    speed = sys.argv[2]
    duration = sys.argv[3]
    dir_pin = int(sys.argv[4])
    pwm_pin = int(sys.argv[5])

    gpio_setup = False
    try:
        log_message({"status": "info", "message": "Setting up GPIO"})
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(dir_pin, GPIO.OUT)
        GPIO.setup(pwm_pin, GPIO.OUT)
        gpio_setup = True
        log_message({"status": "info", "message": "GPIO setup completed"})

        result = control_motor(direction, speed, duration, dir_pin, pwm_pin)
        log_message({"status": "info", "message": "Motor control execution completed"})
    except Exception as e:
        error_message = f"Error: {str(e)}"
        log_message({"status": "error", "message": error_message})
        result = {"success": False, "error": error_message}
    finally:
        if gpio_setup:
            log_message({"status": "info", "message": "Cleaning up GPIO"})
            GPIO.cleanup([dir_pin, pwm_pin])
            log_message({"status": "info", "message": "GPIO cleanup completed"})
        else:
            log_message({"status": "info", "message": "GPIO was not set up, skipping cleanup"})

    # Print the result as JSON
    print(json.dumps(result))