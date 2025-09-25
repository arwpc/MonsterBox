#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def control_light(pin, state, duration=0):
    """
    Control an LED or light using lgpio
    
    Args:
        pin: GPIO pin number
        state: 'on' or 'off'
        duration: Optional duration in milliseconds (0 means indefinite)
    """
    try:
        # Validate pin
        try:
            pin_num = int(pin)
            if not 0 <= pin_num <= 27:
                raise ValueError(f"Pin must be between 0 and 27. Got {pin_num}")
        except ValueError as e:
            raise ValueError(f"Invalid pin number: {str(e)}")
            
        # Validate state
        if state.lower() not in ['on', 'off']:
            raise ValueError("State must be 'on' or 'off'")
            
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        # Configure pin as output
        lgpio.gpio_claim_output(h, pin_num)
        
        if state.lower() == 'on':
            # Turn light on
            lgpio.gpio_write(h, pin_num, 1)
            print(json.dumps({"status": "success", "message": f"Light on pin {pin_num} turned on"}), flush=True)
            
            # If duration specified, wait and then turn off
            if duration and int(duration) > 0:
                time.sleep(int(duration) / 1000.0)  # Convert to seconds
                lgpio.gpio_write(h, pin_num, 0)
                print(json.dumps({"status": "success", "message": f"Light on pin {pin_num} turned off after {duration}ms"}), flush=True)
                
        elif state.lower() == 'off':
            # Turn light off
            lgpio.gpio_write(h, pin_num, 0)
            print(json.dumps({"status": "success", "message": f"Light on pin {pin_num} turned off"}), flush=True)
            
        # Clean up - only if we're not keeping the light on
        if state.lower() == 'off' or (duration and int(duration) > 0):
            lgpio.gpio_free(h, pin_num)
            lgpio.gpiochip_close(h)
            
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "status": "error",
            "message": "Usage: python light_control.py <pin> <state> [duration_ms]"}),
            flush=True)
        sys.exit(1)
        
    try:
        pin = sys.argv[1]
        state = sys.argv[2]
        duration = 0
        
        # Parse optional duration
        if len(sys.argv) >= 4:
            duration = int(sys.argv[3])
            
        control_light(pin, state, duration)
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }), flush=True)
        sys.exit(1)
