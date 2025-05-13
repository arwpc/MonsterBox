#!/usr/bin/env python3

import time
import sys
import json
import os

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

def setup_gpio_pin(pin, direction="out"):
    # Use sysfs GPIO interface which is universally available
    if not os.path.exists(f"/sys/class/gpio/gpio{pin}"):
        # Export GPIO pin
        with open("/sys/class/gpio/export", "w") as f:
            f.write(str(pin))
        
        # Allow time for the pin to be exported
        time.sleep(0.1)
    
    # Set direction
    with open(f"/sys/class/gpio/gpio{pin}/direction", "w") as f:
        f.write(direction)

def set_gpio_value(pin, value):
    with open(f"/sys/class/gpio/gpio{pin}/value", "w") as f:
        f.write("1" if value else "0")

def cleanup_gpio(pin):
    try:
        if os.path.exists(f"/sys/class/gpio/gpio{pin}"):
            with open("/sys/class/gpio/unexport", "w") as f:
                f.write(str(pin))
    except Exception as e:
        log_message({"status": "warning", "message": f"Cleanup error for pin {pin}: {str(e)}"})

def control_motor(dir_pin, pwm_pin, direction, speed, duration):
    try:
        # Validate pins
        dir_pin_num = validate_pin(dir_pin)
        pwm_pin_num = validate_pin(pwm_pin)
        
        # Make sure speed is at least 30% to overcome initial friction,
        # as per the provided guidelines
        adjusted_speed = max(30, float(speed))
        
        try:
            # Setup GPIO pins
            setup_gpio_pin(dir_pin_num)
            setup_gpio_pin(pwm_pin_num)
            
            # Set direction pin based on direction parameter
            set_gpio_value(dir_pin_num, 1 if direction == 'forward' else 0)
            
            # Calculate total run time in seconds
            total_runtime = float(duration) / 1000.0
            
            # Basic PWM cycle timing - 20ms total cycle time (50Hz)
            cycle_time = 0.02
            on_time = cycle_time * (adjusted_speed / 100.0)
            off_time = cycle_time - on_time
            
            log_message({
                "status": "success",
                "message": f"Motor started: direction={direction}, speed={adjusted_speed}%"
            })
            
            # Run the motor with software PWM
            start_time = time.time()
            elapsed = 0
            
            while elapsed < total_runtime:
                # Turn motor on
                set_gpio_value(pwm_pin_num, 1)
                time.sleep(on_time)
                
                # Turn motor off (unless at 100% speed)
                if adjusted_speed < 100:
                    set_gpio_value(pwm_pin_num, 0)
                    time.sleep(off_time)
                    
                elapsed = time.time() - start_time
            
            # Ensure the motor is stopped
            set_gpio_value(pwm_pin_num, 0)
            
            log_message({
                "status": "success",
                "message": "Motor stopped"
            })
        
        finally:
            # Clean up GPIO resources
            cleanup_gpio(dir_pin_num)
            cleanup_gpio(pwm_pin_num)
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

if __name__ == "__main__":
    if len(sys.argv) != 6:
        log_message({
            "status": "error",
            "message": "Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"
        })
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = float(sys.argv[2])     # We'll keep this parameter for compatibility
        duration = float(sys.argv[3])  # Duration in milliseconds
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
