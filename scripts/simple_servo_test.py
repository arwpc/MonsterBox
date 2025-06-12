#!/usr/bin/env python3
"""
Simple servo test for ChatterPi jaw animation
"""

import lgpio
import time
import sys

def test_servo(pin=18):
    print(f"Testing servo on GPIO pin {pin}")
    
    try:
        # Open GPIO chip
        h = lgpio.gpiochip_open(0)
        print("GPIO chip opened successfully")
        
        # Claim pin as output
        lgpio.gpio_claim_output(h, pin)
        print(f"Pin {pin} claimed as output")
        
        # Test sequence: center, left, right, center
        positions = [
            (1500, "center"),
            (1000, "left"),
            (2000, "right"), 
            (1500, "center")
        ]
        
        for pulse_width, position in positions:
            print(f"Moving to {position} position ({pulse_width}us)")
            result = lgpio.tx_servo(h, pin, pulse_width, 50, 0, 1)
            print(f"Servo command result: {result}")
            time.sleep(2)
        
        # Stop servo (try different approaches)
        try:
            lgpio.tx_servo(h, pin, 0)
            print("Servo stopped")
        except Exception as e:
            print(f"Warning during servo stop: {e}")
            # Alternative: just free the pin without explicit stop

        # Cleanup
        try:
            lgpio.gpio_free(h, pin)
            lgpio.gpiochip_close(h)
            print("GPIO cleaned up")
        except Exception as e:
            print(f"Warning during cleanup: {e}")
        
        print("✅ Servo test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error during servo test: {e}")
        return False

if __name__ == "__main__":
    pin = int(sys.argv[1]) if len(sys.argv) > 1 else 18
    test_servo(pin)
