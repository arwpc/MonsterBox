#!/usr/bin/env python3

import lgpio
import time

def test_servo():
    try:
        print("Testing MG90S servo on GPIO 18...")
        
        # Open GPIO chip
        h = lgpio.gpiochip_open(0)
        print("GPIO chip opened")
        
        # Claim GPIO 18 as output
        lgpio.gpio_claim_output(h, 18)
        print("GPIO 18 claimed as output")
        
        # Test different pulse widths
        pulse_widths = [500, 1000, 1500, 2000, 2400]
        
        for pw in pulse_widths:
            print(f"Testing pulse width: {pw}µs")
            try:
                # Use tx_servo with minimal parameters
                lgpio.tx_servo(h, 18, pw)
                print(f"  Success: {pw}µs")
                time.sleep(1)
            except Exception as e:
                print(f"  Error with {pw}µs: {e}")
        
        # Stop servo
        lgpio.tx_servo(h, 18, 0)
        print("Servo stopped")
        
    except Exception as e:
        print(f"Error: {e}")
    
    finally:
        try:
            lgpio.gpio_free(h, 18)
            lgpio.gpiochip_close(h)
            print("GPIO cleaned up")
        except:
            pass

if __name__ == "__main__":
    test_servo()
