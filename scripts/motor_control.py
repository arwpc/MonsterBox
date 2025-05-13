#!/usr/bin/env python3

import lgpio
import sys
import time
import json

# Store log messages in a list
log_messages = []

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
            # Initialize GPIO
            h = lgpio.gpiochip_open(0)
            
            # Configure pins as output
            lgpio.gpio_claim_output(h, dir_pin)
            lgpio.gpio_claim_output(h, pwm_pin)
            
            log_message({"status": "info", "message": f"GPIO setup completed (attempt {attempt + 1})"})
            return h
        except Exception as e:
            log_message({"status": "error", "message": f"GPIO setup failed (attempt {attempt + 1}): {str(e)}"})
            if attempt == retries - 1:
                raise
    return None

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    log_message({"status": "info", "message": f"Controlling motor: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}"})

    h = None
    try:
        h = setup_gpio(dir_pin, pwm_pin)
        if not h:
            raise Exception("Failed to set up GPIO")
        
        # Set direction pin (HIGH for forward, LOW for backward)
        lgpio.gpio_write(h, dir_pin, 1 if direction == 'forward' else 0)
        
        # Set PWM frequency (100Hz is typical for DC motors)
        freq = 100
        # Hardware PWM pins can use higher frequency
        if pwm_pin in [12, 13, 18, 19]:  # Hardware PWM pins
            freq = 200
            
        # Convert 0-100 speed to 0-255 duty cycle for consistency with other scripts
        max_duty = 255
        duty = int(speed * max_duty / 100.0)
        
        # Start PWM
        lgpio.tx_pwm(h, pwm_pin, freq, 0)
        log_message({"status": "info", "message": f"PWM started with initial duty cycle 0"})
        
        # Ramp up safely to prevent current spikes
        for step in range(0, 11):
            current_duty = int(duty * (step / 10.0))
            lgpio.tx_pwm(h, pwm_pin, freq, current_duty)
            time.sleep(0.02)  # 20ms between steps
        
        # Set to target speed
        lgpio.tx_pwm(h, pwm_pin, freq, duty)
        log_message({"status": "info", "message": f"Changed duty cycle to {duty}"})
        
        # Run for specified duration
        time.sleep(duration / 1000.0)  # Convert duration to seconds
        log_message({"status": "info", "message": f"Motor ran for {duration} ms"})
        
        # Ramp down safely
        for step in range(10, -1, -1):
            current_duty = int(duty * (step / 10.0))
            lgpio.tx_pwm(h, pwm_pin, freq, current_duty)
            time.sleep(0.02)  # 20ms between steps
        
        # Stop motor
        lgpio.tx_pwm(h, pwm_pin, freq, 0)
        log_message({"status": "info", "message": "Motor stopped (duty cycle set to 0)"})
        
        return {"success": True, "message": "Motor control successful"}
    except Exception as e:
        error_message = f"Error controlling motor: {str(e)}"
        log_message({"status": "error", "message": error_message})
        return {"success": False, "error": error_message}
    finally:
        if h:
            try:
                # Clean up resources
                lgpio.tx_pwm(h, pwm_pin, 0, 0)  # Stop PWM
                lgpio.gpio_free(h, dir_pin)
                lgpio.gpio_free(h, pwm_pin)
                lgpio.gpiochip_close(h)
                log_message({"status": "info", "message": "GPIO resources cleaned up"})
            except Exception as e:
                log_message({"status": "error", "message": f"Error during cleanup: {str(e)}"})

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

    try:
        validate_inputs(direction, speed, duration)
        speed = int(speed)
        duration = int(duration)
        
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

    # Print a single JSON object containing both the result and logs
    print(json.dumps({"result": result, "logs": log_messages}))
