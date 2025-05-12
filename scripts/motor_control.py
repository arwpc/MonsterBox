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
        
        # Configure pins
        lgpio.gpio_claim_output(h, dir_pin_num)
        
        # Set direction
        lgpio.gpio_write(h, dir_pin_num, 1 if direction == 'forward' else 0)
        
        # Set up PWM
        frequency = 100  # 100Hz frequency
        
        # Convert speed (0-100) to duty cycle (0-1000000)
        speed_value = float(speed) / 100.0
        duty_cycle = int(speed_value * 1000000)
        
        # Configure PWM
        lgpio.tx_pwm(h, pwm_pin_num, frequency, duty_cycle)
        
        log_message({
            "status": "success",
            "message": f"Motor started: direction={direction}, speed={speed}%"
        })
        
        # Run for specified duration
        time.sleep(float(duration))
        
        # Stop motor
        lgpio.tx_pwm(h, pwm_pin_num, frequency, 0)
        
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
            lgpio.gpio_free(h, dir_pin_num)
            lgpio.gpiochip_close(h)
        except:
            pass

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
