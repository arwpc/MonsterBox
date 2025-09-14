#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def control_led(pin, brightness=100, duration=None):
    """
    Control an LED with PWM brightness using lgpio
    
    Args:
        pin: GPIO pin number
        brightness: brightness level (0-100)
        duration: duration in milliseconds (optional)
    """
    try:
        # Validate pin
        try:
            pin_num = int(pin)
            if not 0 <= pin_num <= 27:
                raise ValueError(f"Pin must be between 0 and 27. Got {pin_num}")
        except ValueError as e:
            raise ValueError(f"Invalid pin number: {str(e)}")
        
        # Convert brightness to 0-255 range for PWM
        pwm_value = int(max(0, min(100, brightness)) * 2.55)
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        # Configure pin as output with PWM
        lgpio.gpio_claim_output(h, pin_num)
        
        # Set PWM (frequency 800Hz, range 0-255)
        lgpio.tx_pwm(h, pin_num, 800, pwm_value)
        
        print(json.dumps({
            "status": "success",
            "message": f"LED on pin {pin_num} set to {brightness}% brightness"
        }), flush=True)
        
        # If duration specified, wait then turn off
        if duration is not None:
            time.sleep(duration / 1000.0)  # Convert ms to seconds
            lgpio.tx_pwm(h, pin_num, 800, 0)  # Set PWM to 0
            print(json.dumps({
                "status": "success",
                "message": f"LED on pin {pin_num} turned off after {duration}ms"
            }), flush=True)
            
        # Clean up - only if we're turning off the LED
        if duration is not None:
            lgpio.gpio_free(h, pin_num)
            lgpio.gpiochip_close(h)
            
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 4:
        print(json.dumps({
            "status": "error",
            "message": "Usage: python led_control.py <pin> [brightness] [duration]"
        }), flush=True)
        sys.exit(1)
        
    try:
        pin = int(sys.argv[1])
        brightness = float(sys.argv[2]) if len(sys.argv) > 2 else 100
        duration = float(sys.argv[3]) if len(sys.argv) > 3 else None
        
        if not (0 <= brightness <= 100):
            raise ValueError("Brightness must be between 0 and 100")
        if duration is not None and duration < 0:
            raise ValueError("Duration must be positive")
            
        control_led(pin, brightness, duration)
        
    except ValueError as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }), flush=True)
        sys.exit(1)