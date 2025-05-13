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
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        # Configure direction pin
        lgpio.gpio_claim_output(h, dir_pin_num)
        
        # Set direction
        lgpio.gpio_write(h, dir_pin_num, 1 if direction == 'forward' else 0)
        
        # Setup PWM
        # First claim the PWM pin as output
        lgpio.gpio_claim_output(h, pwm_pin_num)
        
        # Lower frequency for DC motor - typically 20-50Hz works well for DC motors
        # Windshield wiper motors respond well to lower frequencies
        pwm_freq = 50
        
        # For a DC motor, we can use a simpler PWM calculation
        # Convert speed (0-100) to duty cycle (0-1000000 range for lgpio)
        # We need to ensure duty_cycle is an integer between 0-1000000
        duty_cycle = max(0, min(1000000, int(float(speed) * 10000)))
        
        # Start PWM on the pin
        status = lgpio.tx_pwm(h, pwm_pin_num, pwm_freq, duty_cycle)
        if status < 0:
            raise Exception(f"Failed to setup PWM on pin {pwm_pin_num}, error: {status}")
        
        log_message({
            "status": "success",
            "message": f"Motor started: direction={direction}, speed={speed}%"
        })
        
        # Run for specified duration
        time.sleep(float(duration))
        
        # Stop motor by setting duty cycle to 0
        lgpio.tx_pwm(h, pwm_pin_num, pwm_freq, 0)
        
        log_message({
            "status": "success",
            "message": "Motor stopped"
        })
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise
    finally:
        # Clean up GPIO resources
        try:               
            # Free GPIO pins
            lgpio.gpio_free(h, dir_pin_num)
            lgpio.gpio_free(h, pwm_pin_num)
            
            # Close chip
            lgpio.gpiochip_close(h)
        except Exception as cleanup_error:
            log_message({
                "status": "warning",
                "message": f"Cleanup error: {str(cleanup_error)}"
            })

if __name__ == "__main__":
    if len(sys.argv) != 6:
        log_message({
            "status": "error",
            "message": "Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        })
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = float(sys.argv[2])
        duration = float(sys.argv[3])
        dir_pin = int(sys.argv[4])
        pwm_pin = int(sys.argv[5])

        if direction not in ['forward', 'reverse']:
            raise ValueError("Direction must be 'forward' or 'reverse'")
        if not (0 <= speed <= 100):
            raise ValueError("Speed must be between 0 and 100")
        if duration <= 0:
            raise ValueError("Duration must be positive")

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
