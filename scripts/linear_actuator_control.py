# File: scripts/linear_actuator_control.py

import RPi.GPIO as GPIO
import time
import sys
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

def setup_gpio(dir_pin, pwm_pin):
    try:
        logging.info(f"Setting up GPIO: dir_pin={dir_pin}, pwm_pin={pwm_pin}")
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(dir_pin, GPIO.OUT)
        GPIO.setup(pwm_pin, GPIO.OUT)
        pwm = GPIO.PWM(pwm_pin, 100)  # 100Hz frequency
        logging.info(f"GPIO setup complete. PWM frequency: 100Hz")
        
        # Test GPIO control
        logging.info("Testing GPIO control")
        GPIO.output(dir_pin, GPIO.HIGH)
        time.sleep(0.1)
        dir_state = GPIO.input(dir_pin)
        logging.info(f"Direction pin state after setting HIGH: {dir_state}")
        GPIO.output(dir_pin, GPIO.LOW)
        time.sleep(0.1)
        dir_state = GPIO.input(dir_pin)
        logging.info(f"Direction pin state after setting LOW: {dir_state}")
        
        return pwm
    except Exception as e:
        logging.error(f"Error setting up GPIO: {str(e)}")
        raise

def validate_speed(speed):
    try:
        speed_float = float(speed)
        if 0 <= speed_float <= 100:
            return speed_float
        else:
            raise ValueError("Speed must be between 0 and 100")
    except ValueError:
        raise ValueError("Invalid speed value")

def log_gpio_state(dir_pin, pwm_pin):
    dir_state = GPIO.input(dir_pin)
    pwm_state = GPIO.input(pwm_pin)
    logging.debug(f"GPIO states - Direction pin ({dir_pin}): {'HIGH' if dir_state else 'LOW'}, PWM pin ({pwm_pin}): {'HIGH' if pwm_state else 'LOW'}")

def control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction):
    pwm = None
    try:
        pwm = setup_gpio(dir_pin, pwm_pin)
        speed_float = validate_speed(speed)
        
        # Set direction
        if direction == 'forward':
            GPIO.output(dir_pin, GPIO.LOW)
            logging.info(f"Set direction pin ({dir_pin}) to LOW (forward)")
        else:
            GPIO.output(dir_pin, GPIO.HIGH)
            logging.info(f"Set direction pin ({dir_pin}) to HIGH (backward)")
        
        time.sleep(0.1)  # Short delay to ensure direction is set
        log_gpio_state(dir_pin, pwm_pin)
        
        # Calculate the actual duration based on direction and limits
        actual_duration = min(int(duration), int(max_extension if direction == 'forward' else max_retraction))
        
        logging.info(f"Moving actuator {direction} at speed {speed_float}% for {actual_duration}ms")
        
        pwm.start(speed_float)
        log_gpio_state(dir_pin, pwm_pin)
        
        time.sleep(actual_duration / 1000)
        
        pwm.stop()
        log_gpio_state(dir_pin, pwm_pin)
        
        return True  # Indicate successful completion
    except Exception as e:
        logging.error(f"Error during actuator control: {str(e)}")
        return False  # Indicate failure
    finally:
        if pwm:
            pwm.stop()
        GPIO.cleanup([dir_pin, pwm_pin])
        logging.info("GPIO cleanup completed")

if __name__ == "__main__":
    if len(sys.argv) < 8:
        logging.error("Usage: python3 linear_actuator_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin> <max_extension> <max_retraction>")
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = sys.argv[2]
        duration = sys.argv[3]
        dir_pin = int(sys.argv[4])
        pwm_pin = int(sys.argv[5])
        max_extension = sys.argv[6]
        max_retraction = sys.argv[7]

        logging.info(f"Starting linear actuator control with parameters: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}, max_extension={max_extension}, max_retraction={max_retraction}")
        
        success = control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction)
        if success:
            logging.info("Linear actuator control completed successfully")
            print("SUCCESS: Linear actuator control completed successfully")
        else:
            logging.error("Linear actuator control failed")
            print("FAILURE: Linear actuator control failed")
        sys.exit(0 if success else 1)
    except Exception as e:
        logging.error(f"Error controlling linear actuator: {str(e)}")
        print(f"FAILURE: Error controlling linear actuator: {str(e)}")
        sys.exit(1)