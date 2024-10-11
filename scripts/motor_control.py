import RPi.GPIO as GPIO
import sys
import time
import json

def log_message(message):
    # Instead of printing, we'll add to a list of log messages
    log_messages.append(message)

def validate_inputs(direction, speed, duration):
    if direction not in ['forward', 'backward']:
        raise ValueError(f"Invalid direction: {direction}. Must be 'forward' or 'backward'.")
    
    try:
        speed = int(speed)
        if not 0 <= speed <= 100:
            raise ValueError(f"Invalid speed: {speed}. Must be between 0 and 100.")
    except ValueError:
        raise ValueError(f"Invalid speed: {speed}. Must be an integer between 0 and 100.")
    
    try:
        duration = int(duration)
        if duration <= 0:
            raise ValueError(f"Invalid duration: {duration}. Must be a positive integer.")
    except ValueError:
        raise ValueError(f"Invalid duration: {duration}. Must be a positive integer.")

def setup_gpio(dir_pin, pwm_pin, retries=3):
    for attempt in range(retries):
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(dir_pin, GPIO.OUT)
            GPIO.setup(pwm_pin, GPIO.OUT)
            log_message({"status": "info", "message": f"GPIO setup completed (attempt {attempt + 1})"})
            return True
        except Exception as e:
            log_message({"status": "error", "message": f"GPIO setup failed (attempt {attempt + 1}): {str(e)}"})
            if attempt == retries - 1:
                raise

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    log_message({"status": "info", "message": f"Controlling motor: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}"})

    pwm = None
    gpio_setup = False
    try:
        gpio_setup = setup_gpio(dir_pin, pwm_pin)
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        pwm = GPIO.PWM(pwm_pin, 100)  # Use a default frequency of 100 Hz
        pwm.start(0)
        log_message({"status": "info", "message": f"PWM started with initial duty cycle 0"})
        
        pwm.ChangeDutyCycle(speed)
        log_message({"status": "info", "message": f"Changed duty cycle to {speed}"})
        
        time.sleep(duration / 1000)  # Convert duration to seconds
        log_message({"status": "info", "message": f"Motor ran for {duration} ms"})
        
        pwm.ChangeDutyCycle(0)
        log_message({"status": "info", "message": "Motor stopped (duty cycle set to 0)"})
        
        return {"success": True, "message": "Motor control successful"}
    except Exception as e:
        error_message = f"Error controlling motor: {str(e)}"
        log_message({"status": "error", "message": error_message})
        return {"success": False, "error": error_message}
    finally:
        if pwm:
            pwm.stop()
            log_message({"status": "info", "message": "PWM stopped"})
        if gpio_setup:
            GPIO.cleanup([dir_pin, pwm_pin])
            log_message({"status": "info", "message": "GPIO cleanup completed"})

if __name__ == "__main__":
    log_messages = []
    
    if len(sys.argv) != 6:
        error_message = "Incorrect number of arguments. Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        log_message({"status": "error", "message": error_message})
        print(json.dumps({"success": False, "error": error_message, "logs": log_messages}))
        sys.exit(1)

    direction = sys.argv[1]
    speed = sys.argv[2]
    duration = sys.argv[3]
    dir_pin = int(sys.argv[4])
    pwm_pin = int(sys.argv[5])

    gpio_setup = False
    try:
        validate_inputs(direction, speed, duration)
        speed = int(speed)
        duration = int(duration)
        
        gpio_setup = setup_gpio(dir_pin, pwm_pin)
        result = control_motor(direction, speed, duration, dir_pin, pwm_pin)
        log_message({"status": "info", "message": "Motor control execution completed"})
    except ValueError as e:
        error_message = f"Input validation error: {str(e)}"
        log_message({"status": "error", "message": error_message})
        result = {"success": False, "error": error_message}
    except Exception as e:
        error_message = f"Unexpected error: {str(e)}"
        log_message({"status": "error", "message": error_message})
        result = {"success": False, "error": error_message}
    finally:
        if gpio_setup:
            log_message({"status": "info", "message": "Cleaning up GPIO"})
            GPIO.cleanup([dir_pin, pwm_pin])
            log_message({"status": "info", "message": "GPIO cleanup completed"})
        else:
            log_message({"status": "info", "message": "GPIO was not set up, skipping cleanup"})

    # Print a single JSON object containing both the result and logs
    print(json.dumps({"result": result, "logs": log_messages}))
