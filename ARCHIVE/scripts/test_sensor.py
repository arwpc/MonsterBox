#!/usr/bin/env python3
import lgpio
import json
import sys
import time

def test_motion_sensor(pin, duration=None):
    # Initialize GPIO
    h = lgpio.gpiochip_open(0)
    
    # Configure pin as input with pull-down (PIR sensors typically send HIGH when motion detected)
    lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_DOWN)
    
    start_time = time.time()
    last_state = None
    
    try:
        while duration is None or time.time() - start_time < duration:
            # Read current pin state - PIR sensors typically output HIGH (1) when motion is detected
            current_state = lgpio.gpio_read(h, pin) == 1
            
            if current_state != last_state:
                if current_state:
                    print(json.dumps({"status": "Motion Detected"}), flush=True)
                else:
                    print(json.dumps({"status": "No Motion"}), flush=True)
                last_state = current_state
                
            time.sleep(0.1)  # Reduced sleep time for more responsive detection
    
    finally:
        # Clean up
        lgpio.gpio_free(h, pin)
        lgpio.gpiochip_close(h)

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print(json.dumps({"status": "error", "message": "Usage: python test_sensor.py <pin> [duration]"}), flush=True)
        sys.exit(1)
    
    try:
        pin = int(sys.argv[1])
        # Validate pin number
        if not 0 <= pin <= 27:
            raise ValueError(f"Pin must be between 0 and 27. Got {pin}")
            
        duration = int(sys.argv[2]) if len(sys.argv) == 3 else None
        test_motion_sensor(pin, duration)
    except ValueError as e:
        print(json.dumps({"status": "error", "message": f"Invalid parameter: {str(e)}"}), flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)
