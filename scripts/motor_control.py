#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def log_message(message):
    print(json.dumps(message), flush=True)

def validate_pin(pin):
    try:
        pin_num = int(pin)
        if not 0 <= pin_num <= 27:
            raise ValueError(f"Pin must be between 0 and 27. Got {pin_num}")
        return pin_num
    except ValueError as e:
        raise ValueError(f"Invalid pin number: {str(e)}")

def control_motor(dir_pin, pwm_pin, direction, speed, duration):
    try:
        # Validate pins
        dir_pin_num = validate_pin(dir_pin)
        pwm_pin_num = validate_pin(pwm_pin)
        
        # Make sure speed is at least 30% to overcome initial friction,
        # as per the provided guidelines
        adjusted_speed = max(30, float(speed))
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        try:
            # Configure pins - only using basic output functionality
            lgpio.gpio_claim_output(h, dir_pin_num)
            lgpio.gpio_claim_output(h, pwm_pin_num)
            
            # Set direction pin based on direction parameter
            lgpio.gpio_write(h, dir_pin_num, 1 if direction == 'forward' else 0)
            
            # Calculate total run time in seconds
            total_runtime = float(duration) / 1000.0
            
            # Set PWM cycle timing - 50ms per cycle (20Hz)
            # This frequency is good for DC motors and reduces CPU load
            cycle_time = 0.05
            
            # Calculate duty cycle for PWM
            on_time = cycle_time * (adjusted_speed / 100.0)
            off_time = cycle_time - on_time
            
            log_message({
                "status": "success",
                "message": f"Motor started: direction={direction}, speed={adjusted_speed}%"
            })
            
            # Run the motor with a software PWM implementation
            start_time = time.time()
            
            # Calculate number of cycles needed
            num_cycles = int(total_runtime / cycle_time)
            max_cycles = min(num_cycles, 100)  # Limit to 100 cycles max for safety
            
            # If going at 100% speed, just turn it on and sleep
            if adjusted_speed >= 98:  # Allow for small rounding errors
                lgpio.gpio_write(h, pwm_pin_num, 1)
                time.sleep(total_runtime)
            else:
                # Run fewer cycles with longer sleeps to minimize system impact
                for _ in range(max_cycles):
                    # Check if we've been running too long
                    if (time.time() - start_time) >= total_runtime:
                        break
                        
                    # Turn motor on
                    lgpio.gpio_write(h, pwm_pin_num, 1)
                    time.sleep(on_time)
                    
                    # Turn motor off 
                    lgpio.gpio_write(h, pwm_pin_num, 0)
                    time.sleep(off_time)
            
            # Ensure the motor is stopped
            lgpio.gpio_write(h, pwm_pin_num, 0)
            
            log_message({
                "status": "success",
                "message": "Motor stopped"
            })
        
        finally:
            # Clean up GPIO resources
            try:        
                lgpio.gpio_free(h, dir_pin_num)
                lgpio.gpio_free(h, pwm_pin_num)
                lgpio.gpiochip_close(h)
            except Exception as cleanup_error:
                log_message({
                    "status": "warning",
                    "message": f"Cleanup error: {str(cleanup_error)}"
                })
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

if __name__ == "__main__":
    if len(sys.argv) < 6:
        log_message({
            "status": "error",
            "message": "Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        })
        sys.exit(1)

    try:
        # Handle parameters more robustly for web interface compatibility
        direction = sys.argv[1].strip().lower()
        
        try:
            speed = float(sys.argv[2])     # Speed as percentage (0-100)
            duration = float(sys.argv[3])  # Duration in milliseconds
            dir_pin = int(sys.argv[4])     # Direction pin
            pwm_pin = int(sys.argv[5])     # PWM pin
        except (ValueError, IndexError) as e:
            log_message({
                "status": "error",
                "message": f"Parameter error: {str(e)}"
            })
            sys.exit(1)

        # Validate parameters
        if direction not in ['forward', 'reverse']:
            raise ValueError("Direction must be 'forward' or 'reverse'")
        if not (0 <= speed <= 100):
            raise ValueError("Speed must be between 0 and 100")
        if duration <= 0:
            raise ValueError("Duration must be positive")
            
        # Safety limit on duration to prevent excessive resource usage
        # Cap at 5 seconds for web interface testing 
        duration = min(duration, 5000)

        control_motor(dir_pin, pwm_pin, direction, speed, duration)

    except ValueError as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        sys.exit(1)
    except Exception as e:
        log_message({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        })
        sys.exit(1)
