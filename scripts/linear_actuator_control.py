import RPi.GPIO as GPIO
import time
import sys
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

def setup_gpio(dir_pin, pwm_pin):
    logging.info(f"Setting up GPIO: dir_pin={dir_pin}, pwm_pin={pwm_pin}")
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(dir_pin, GPIO.OUT)
    GPIO.setup(pwm_pin, GPIO.OUT)
    pwm = GPIO.PWM(pwm_pin, 100)  # 100Hz frequency
    logging.info(f"GPIO setup complete. PWM frequency: 100Hz")
    return pwm

def validate_speed(speed):
    try:
        speed_float = float(speed)
        if 0 <= speed_float <= 100:
            return speed_float
        else:
            raise ValueError("Speed must be between 0 and 100")
    except ValueError:
        raise ValueError("Invalid speed value")

def soft_start_stop(pwm, target_speed, ramp_time=0.5):
    steps = 20
    for i in range(steps + 1):
        current_speed = (i / steps) * target_speed
        pwm.ChangeDutyCycle(current_speed)
        logging.debug(f"PWM duty cycle changed to {current_speed}%")
        time.sleep(ramp_time / steps)

def log_gpio_state(dir_pin, pwm_pin):
    dir_state = GPIO.input(dir_pin)
    pwm_state = GPIO.input(pwm_pin)
    logging.debug(f"GPIO states - Direction pin ({dir_pin}): {'HIGH' if dir_state else 'LOW'}, PWM pin ({pwm_pin}): {'HIGH' if pwm_state else 'LOW'}")

def control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction):
    pwm = None
    try:
        pwm = setup_gpio(dir_pin, pwm_pin)
        speed_float = validate_speed(speed)
        
        GPIO.output(dir_pin, GPIO.LOW if direction == 'forward' else GPIO.HIGH)
        logging.info(f"Set direction pin ({dir_pin}) to {'LOW' if direction == 'forward' else 'HIGH'}")
        
        # Calculate the actual duration based on direction and limits
        if direction == 'forward':
            actual_duration = min(int(duration), int(max_extension))
        else:
            actual_duration = min(int(duration), int(max_retraction))
        
        logging.info(f"Moving actuator {direction} at speed {speed_float}% for {actual_duration}ms")
        
        soft_start_stop(pwm, speed_float)  # Soft start
        
        start_time = time.time()
        while time.time() - start_time < (actual_duration / 1000):
            if time.time() - start_time > 30:  # Safety timeout of 30 seconds
                logging.warning("Safety timeout reached. Stopping actuator.")
                break
            log_gpio_state(dir_pin, pwm_pin)
            time.sleep(0.1)  # Check every 100ms
        
        soft_start_stop(pwm, 0)  # Soft stop
        
    except Exception as e:
        logging.error(f"Error during actuator control: {str(e)}")
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
        
        control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction)
        logging.info("Linear actuator control completed successfully")
        sys.exit(0)
    except Exception as e:
        logging.error(f"Error controlling linear actuator: {str(e)}")
        sys.exit(1)