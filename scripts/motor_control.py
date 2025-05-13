#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    """
    Control a Jeep Wagoneer wiper motor via MDD10A motor controller using lgpio
    
    Args:
        direction: 'forward', 'backward', or 'reverse'
        speed: Speed as percentage 0-100
        duration: Duration in milliseconds
        dir_pin: GPIO pin for direction control
        pwm_pin: GPIO pin for PWM control
    """
    try:
        # Validate pins
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        
        if not (0 <= dir_pin <= 27):
            raise ValueError(f"Direction pin must be between 0 and 27. Got {dir_pin}")
        if not (0 <= pwm_pin <= 27):
            raise ValueError(f"PWM pin must be between 0 and 27. Got {pwm_pin}")
            
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
            
        # Cap duration for safety (5 seconds max)
        duration_sec = min(duration_ms / 1000.0, 5.0)
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
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
        
        # Motor control - for Jeep Wagoneer wiper motor
        if speed_value > 0:
            # For hardware PWM pins (12, 13, 18, 19)
            if pwm_pin in [12, 13, 18, 19]:
                # Use low frequency for auto wiper motors (50Hz works well)
                freq = 50  # Hz
                
                # Map speed to appropriate duty cycle (0-255 for lgpio)
                pwm_duty = int((speed_value / 100.0) * 255)
                pwm_duty = max(0, min(255, pwm_duty))  # Clamp between 0 and 255
                if pwm_duty < 20 and speed_value > 0:
                    pwm_duty = 20  # Ensure at least 20 for reliable starting, but only if speed > 0
                try:
                    lgpio.tx_pwm(h, pwm_pin, freq, pwm_duty)
                except Exception as pwm_error:
                    lgpio.gpio_free(h, dir_pin)
                    lgpio.gpio_free(h, pwm_pin)
                    lgpio.gpiochip_close(h)
                    return {"status": "error", "message": f"Failed to set PWM: {pwm_error}. Tried duty cycle: {pwm_duty}"}
            else:
                # For non-hardware-PWM pins, just use digital HIGH
                lgpio.gpio_write(h, pwm_pin, 1)
                
            # Run for specified duration
            time.sleep(duration_sec)
            
            # Stop the motor
            if pwm_pin in [12, 13, 18, 19]:
                lgpio.tx_pwm(h, pwm_pin, 0, 0)  # Stop PWM
            lgpio.gpio_write(h, pwm_pin, 0)  # Ensure pin is LOW
        
        # Clean up GPIO resources
        lgpio.gpio_free(h, dir_pin)
        lgpio.gpio_free(h, pwm_pin)
        lgpio.gpiochip_close(h)
        
        # Return success message in the exact format the UI expects
        return {"status": "success", "message": f"Motor ran for {duration_ms}ms at {speed_value}% speed"}
        
    except Exception as e:
        # Return error in the exact format the UI expects
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
