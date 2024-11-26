#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def log_message(message):
    print(json.dumps(message), flush=True)

def validate_pin(pin_or_channel):
    try:
        pin = int(pin_or_channel)
        if not 0 <= pin <= 27:
            raise ValueError(f"Pin must be between 0 and 27. Got {pin}")
        return pin
    except ValueError as e:
        raise ValueError(f"Invalid pin number: {str(e)}")

def set_servo_angle(pin_or_channel, angle, i2c_address=None):
    """
    Set servo angle using lgpio
    
    Args:
        pin_or_channel: GPIO pin number
        angle: Angle in degrees (0-180)
        i2c_address: Not used with lgpio implementation
    """
    try:
        # Validate angle
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")
            
        # Validate pin
        pin = validate_pin(pin_or_channel)
        
        # Convert angle to pulse width (typically 500-2500 microseconds)
        # For most servos: 0° = 500µs, 180° = 2500µs
        pulse_width = int((angle / 180.0) * (2500 - 500) + 500)
        
        try:
            # Initialize GPIO
            h = lgpio.gpiochip_open(0)
            
            # Set up servo pin for PWM
            # 50Hz frequency (20ms period) is standard for servos
            frequency = 50
            
            # Calculate duty cycle (0-1000000)
            # pulse_width is in microseconds, period is 20000 microseconds
            duty_cycle = int((pulse_width / 20000.0) * 1000000)
            
            # Configure PWM
            lgpio.tx_pwm(h, pin, frequency, duty_cycle)
            
            # Allow time for servo to move
            time.sleep(0.5)
            
            # Stop PWM
            lgpio.tx_pwm(h, pin, frequency, 0)
            
            log_message({
                "status": "success",
                "message": f"Set servo to {angle} degrees"
            })
            
        finally:
            # Clean up
            lgpio.gpiochip_close(h)
            
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

def sweep_servo(pin_or_channel, start_angle, end_angle, step_size=1, delay=0.01, i2c_address=None):
    """
    Sweep servo between start and end angles using lgpio
    
    Args:
        pin_or_channel: GPIO pin number
        start_angle: Starting angle in degrees
        end_angle: Ending angle in degrees
        step_size: Angle increment per step
        delay: Delay between steps in seconds
        i2c_address: Not used with lgpio implementation
    """
    try:
        # Validate angles
        if not (0 <= start_angle <= 180 and 0 <= end_angle <= 180):
            raise ValueError("Angles must be between 0 and 180 degrees")
            
        # Validate pin
        pin = validate_pin(pin_or_channel)
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        try:
            # Determine sweep direction
            step = step_size if end_angle > start_angle else -step_size
            angles = range(int(start_angle), int(end_angle) + step, step)
            
            # Standard servo frequency is 50Hz
            frequency = 50
            
            for angle in angles:
                # Convert angle to pulse width
                pulse_width = int((angle / 180.0) * (2500 - 500) + 500)
                
                # Calculate duty cycle
                duty_cycle = int((pulse_width / 20000.0) * 1000000)
                
                # Set PWM
                lgpio.tx_pwm(h, pin, frequency, duty_cycle)
                time.sleep(delay)
            
            # Stop PWM
            lgpio.tx_pwm(h, pin, frequency, 0)
            
            log_message({
                "status": "success",
                "message": f"Completed sweep from {start_angle} to {end_angle} degrees"
            })
            
        finally:
            # Clean up
            lgpio.gpiochip_close(h)
            
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

if __name__ == "__main__":
    if len(sys.argv) < 4:
        log_message({
            "status": "error",
            "message": "Usage: python servo_control.py <pin/channel> <command> <angle/start_angle> [end_angle] [step_size] [delay] [i2c_address]"
        })
        sys.exit(1)
        
    try:
        pin_or_channel = sys.argv[1]
        command = sys.argv[2].lower()
        
        if command == "angle":
            angle = float(sys.argv[3])
            i2c_address = int(sys.argv[4], 16) if len(sys.argv) > 4 else None
            set_servo_angle(pin_or_channel, angle, i2c_address)
            
        elif command == "sweep":
            if len(sys.argv) < 5:
                raise ValueError("Sweep command requires start and end angles")
                
            start_angle = float(sys.argv[3])
            end_angle = float(sys.argv[4])
            step_size = float(sys.argv[5]) if len(sys.argv) > 5 else 1
            delay = float(sys.argv[6]) if len(sys.argv) > 6 else 0.01
            i2c_address = int(sys.argv[7], 16) if len(sys.argv) > 7 else None
            
            sweep_servo(pin_or_channel, start_angle, end_angle, step_size, delay, i2c_address)
            
        else:
            raise ValueError(f"Unknown command: {command}")
            
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        sys.exit(1)
