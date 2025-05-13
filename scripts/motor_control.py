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
    # Accept either 'backward' or 'reverse' for backward motion
    if direction not in ['forward', 'backward', 'reverse']:
        raise ValueError(f"Invalid direction: {direction}. Must be 'forward', 'backward', or 'reverse'.")
    
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
        
        # Set direction pin (HIGH for forward, LOW for backward or reverse)
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
        
        # Run for specified duration with safety timeout
        start_time = time.time()
        max_runtime = min(duration / 1000.0, 5.0)  # Cap at 5 seconds for safety
        
        try:
            time.sleep(max_runtime)  # Convert duration to seconds
            log_message({"status": "info", "message": f"Motor ran for {max_runtime*1000} ms"})
        except KeyboardInterrupt:
            log_message({"status": "warning", "message": "Motor stopped by user interrupt"})
        except Exception as e:
            log_message({"status": "error", "message": f"Error during motor run: {str(e)}"})
            # Continue to the ramp down to ensure motor stops
        
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
        # Always ensure motor is stopped, even if there's an error
        if h is not None:
            try:
                # Emergency stop - stop PWM first
                lgpio.tx_pwm(h, pwm_pin, 0, 0)  # Stop PWM
                time.sleep(0.05)  # Brief pause to ensure PWM stops
                
                # Free resources
                try:
                    lgpio.gpio_free(h, dir_pin)
                except:
                    pass
                    
                try:
                    lgpio.gpio_free(h, pwm_pin)
                except:
                    pass
                    
                try:
                    lgpio.gpiochip_close(h)
                except:
                    pass
                    
                log_message({"status": "info", "message": "GPIO resources cleaned up"})
            except Exception as e:
                log_message({"status": "error", "message": f"Error during cleanup: {str(e)}"})
                
        # As a fallback, try multiple emergency stop approaches to ensure motor stops
        try:
            # First approach: new handle for PWM pin
            emergency_h = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(emergency_h, pwm_pin)
            lgpio.gpio_write(emergency_h, pwm_pin, 0)  # Force to low
            lgpio.tx_pwm(emergency_h, pwm_pin, 0, 0)   # Force PWM off
            time.sleep(0.1)  # Short delay
            lgpio.gpio_free(emergency_h, pwm_pin)
            
            # Second approach: also try dir pin
            lgpio.gpio_claim_output(emergency_h, dir_pin)
            lgpio.gpio_write(emergency_h, dir_pin, 0)  # Force to low
            lgpio.gpio_free(emergency_h, dir_pin)
            
            lgpio.gpiochip_close(emergency_h)
            log_message({"status": "info", "message": "Emergency motor stop performed"})
        except Exception as e:
            log_message({"status": "error", "message": f"Emergency stop failed: {str(e)}"})

if __name__ == "__main__":
    log_messages = []
    
    if len(sys.argv) != 6:
        error_message = "Incorrect number of arguments. Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        log_message({"status": "error", "message": error_message})
        print(json.dumps({"status": "error", "message": error_message, "logs": log_messages}))
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

    # Format output to match exactly what the UI expects
    # The UI expects a simple JSON object with status and message fields
    if result.get("success", False):
        print(json.dumps({
            "status": "success", 
            "message": result.get("message", "Motor control completed successfully")
        }))
    else:
        # On error, just output the error message
        print(json.dumps({
            "status": "error", 
            "message": result.get("error", "Unknown error occurred")
        }))
