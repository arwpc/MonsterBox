#!/usr/bin/env python3

"""
Motor Control Script for MonsterBox 5.5
Controls DC motors via MDD10A motor controller using lgpio
Supports Jeep Wagoneer wiper motors and similar DC motors
"""

import lgpio
import time
import sys
import json

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    """
    Control a DC motor via MDD10A motor controller using lgpio
    
    Args:
        direction: 'forward', 'backward', or 'reverse'
        speed: Speed as percentage 0-100
        duration: Duration in milliseconds
        dir_pin: GPIO pin for direction control
        pwm_pin: GPIO pin for PWM control
    
    Returns:
        dict: {"status": "success|error", "message": "description"}
    """
    try:
        # Validate pins
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        
        if not (0 <= dir_pin <= 27):
            raise ValueError(f"Direction pin must be between 0 and 27. Got {dir_pin}")
        if not (0 <= pwm_pin <= 27):
            raise ValueError(f"PWM pin must be between 0 and 27. Got {pwm_pin}")
        if dir_pin == pwm_pin:
            raise ValueError(f"Direction pin and PWM pin cannot be the same. Got {dir_pin}")
            
        # Validate direction
        if direction.lower() not in ['forward', 'backward', 'reverse']:
            raise ValueError(f"Direction must be 'forward', 'backward', or 'reverse'. Got '{direction}'")
            
        # Convert and validate speed (0-100%)
        speed_value = float(speed)
        if not (0 <= speed_value <= 100):
            raise ValueError(f"Speed must be between 0 and 100. Got {speed_value}")
            
        # Convert and validate duration
        duration_ms = int(duration)
        if duration_ms <= 0:
            raise ValueError(f"Duration must be positive. Got {duration_ms}")
            
        # Cap duration for safety (10 seconds max for MonsterBox)
        duration_sec = min(duration_ms / 1000.0, 10.0)
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        try:
            # Configure pins
            lgpio.gpio_claim_output(h, dir_pin)
            lgpio.gpio_claim_output(h, pwm_pin)
            
            # Ensure motor is stopped before setting direction
            lgpio.gpio_write(h, pwm_pin, 0)
            
            # Set direction - MDD10A typically uses LOW for forward, HIGH for backward/reverse
            dir_value = 0 if direction.lower() == 'forward' else 1
            lgpio.gpio_write(h, dir_pin, dir_value)
            
            # Short delay after setting direction
            time.sleep(0.05)
            
            # Motor control - Simple ON/OFF control for wiper motors
            if speed_value > 0:
                # Turn motor ON
                lgpio.gpio_write(h, pwm_pin, 1)
                
                # Run for specified duration
                time.sleep(duration_sec)
                
                # Stop the motor
                lgpio.gpio_write(h, pwm_pin, 0)
            
            # Clean up GPIO resources
            lgpio.gpio_free(h, dir_pin)
            lgpio.gpio_free(h, pwm_pin)
            lgpio.gpiochip_close(h)
            
            # Return success message
            return {
                "status": "success", 
                "message": f"Motor ran {direction} for {duration_ms}ms at {speed_value}% power",
                "details": {
                    "direction": direction,
                    "speed": speed_value,
                    "duration_ms": duration_ms,
                    "dir_pin": dir_pin,
                    "pwm_pin": pwm_pin
                }
            }
            
        except Exception as gpio_error:
            # Clean up GPIO resources on error
            try:
                lgpio.gpio_free(h, dir_pin)
                lgpio.gpio_free(h, pwm_pin)
                lgpio.gpiochip_close(h)
            except:
                pass  # Ignore cleanup errors
            raise gpio_error
        
    except Exception as e:
        # Return error in the exact format the UI expects
        return {"status": "error", "message": str(e)}

def stop_motor(dir_pin, pwm_pin):
    """
    Emergency stop function for motor
    
    Args:
        dir_pin: GPIO pin for direction control
        pwm_pin: GPIO pin for PWM control
    
    Returns:
        dict: {"status": "success|error", "message": "description"}
    """
    try:
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        
        h = lgpio.gpiochip_open(0)
        
        try:
            lgpio.gpio_claim_output(h, dir_pin)
            lgpio.gpio_claim_output(h, pwm_pin)
            
            # Stop motor
            lgpio.gpio_write(h, pwm_pin, 0)
            
            # Clean up
            lgpio.gpio_free(h, dir_pin)
            lgpio.gpio_free(h, pwm_pin)
            lgpio.gpiochip_close(h)
            
            return {"status": "success", "message": "Motor stopped"}
            
        except Exception as gpio_error:
            try:
                lgpio.gpio_free(h, dir_pin)
                lgpio.gpio_free(h, pwm_pin)
                lgpio.gpiochip_close(h)
            except:
                pass
            raise gpio_error
            
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print(json.dumps({
            "status": "error", 
            "message": "Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        }), flush=True)
        sys.exit(1)
    
    try:
        direction = sys.argv[1]
        speed = sys.argv[2]
        duration = sys.argv[3]
        dir_pin = sys.argv[4]
        pwm_pin = sys.argv[5]

        # Handle special stop command
        if direction.lower() == 'stop':
            result = stop_motor(dir_pin, pwm_pin)
        else:
            # Run motor control and get result
            result = control_motor(direction, speed, duration, dir_pin, pwm_pin)

        # Print result in exact format the UI expects
        print(json.dumps(result), flush=True)

        # Also log errors to stderr for backend diagnostics
        if result["status"] != "success":
            print(f"[motor_control.py ERROR] {result['message']}", file=sys.stderr, flush=True)

        # Exit with appropriate code
        sys.exit(0 if result["status"] == "success" else 1)

    except Exception as e:
        # Log unexpected error to stderr
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"status": "error", "message": f"Unexpected error: {str(e)}"}), flush=True)
        sys.exit(1)
