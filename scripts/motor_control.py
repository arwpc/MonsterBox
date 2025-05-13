#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def log_message(message):
    print(json.dumps(message), flush=True)

def control_motor(dir_pin, pwm_pin, direction, speed, duration):
    # Ultra-simple diagnostic command for testing hardware
    h = None
    
    try:
        # Convert parameters to correct types
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        duration = min(float(duration) / 1000.0, 1.0)  # Max 1 second for safety
        
        log_message({"status": "info", "message": f"Starting GPIO test with pins: DIR={dir_pin}, PWM={pwm_pin}"})
        
        # Open GPIO chip
        h = lgpio.gpiochip_open(0)
        
        # Set up direction pin
        lgpio.gpio_claim_output(h, dir_pin)
        lgpio.gpio_write(h, dir_pin, 1 if direction == 'forward' else 0)
        
        # Set up and activate PWM pin
        lgpio.gpio_claim_output(h, pwm_pin)
        lgpio.gpio_write(h, pwm_pin, 1)  # Turn on
        
        log_message({"status": "success", "message": "Motor ON"})
        time.sleep(duration)  # Run briefly
        
        # Turn off motor
        lgpio.gpio_write(h, pwm_pin, 0)
        log_message({"status": "success", "message": "Motor OFF"})
        
    except Exception as e:
        log_message({"status": "error", "message": str(e)})
    
    finally:
        # Always clean up resources
        if h is not None:
            try:
                lgpio.gpiochip_close(h)
                log_message({"status": "info", "message": "Resources cleaned up"})
            except:
                pass

if __name__ == "__main__":
    # Very simple parameter handling
    if len(sys.argv) < 6:
        log_message({"status": "error", "message": "Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"})
        sys.exit(1)
    
    try:
        direction = sys.argv[1].strip().lower()
        speed = float(sys.argv[2])  # Not used in this simplified version
        duration = float(sys.argv[3])
        dir_pin = sys.argv[4]
        pwm_pin = sys.argv[5]
        
        control_motor(dir_pin, pwm_pin, direction, speed, duration)
        
    except Exception as e:
        log_message({"status": "error", "message": f"Error: {str(e)}"})
        sys.exit(1)
