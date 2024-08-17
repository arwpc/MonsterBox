import RPi.GPIO as GPIO
import sys
import time
import logging
import json
import os

# Set up logging
logging.basicConfig(filename='motor_control.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Define the path to the motor settings file
settings_file_path = os.path.join(os.path.dirname(__file__), '../data/motor_settings.json')

def load_motor_settings():
    try:
        with open(settings_file_path, 'r') as file:
            settings = json.load(file)
        logging.info(f"Motor settings loaded successfully: {settings}")
        return settings
    except Exception as e:
        logging.error(f"Error loading motor settings: {str(e)}")
        raise

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
    try:
        # Load motor settings
        settings = load_motor_settings()
        
        if len(sys.argv) != 2:
            logging.error("Incorrect number of arguments")
            print("Usage: python motor_control.py <action>")
            sys.exit(1)
        
        action = sys.argv[1]

        # Extract motor parameters based on the action from settings
        direction = settings[action]['direction']
        speed = settings[action]['speed']
        duration = settings[action]['duration']
        dir_pin = settings[action]['dir_pin']
        pwm_pin = settings[action]['pwm_pin']

        # Control the motor using the parameters from the settings
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
