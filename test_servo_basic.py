#!/usr/bin/env python3
import lgpio
import time
import sys

def test_servo_basic(pin, angle):
    try:
        print(f'Testing servo on pin {pin} at angle {angle}')
        
        # Open GPIO chip
        h = lgpio.gpiochip_open(0)
        print(f'GPIO chip opened: {h}')
        
        # Claim pin as output
        lgpio.gpio_claim_output(h, pin)
        print(f'Pin {pin} claimed as output')
        
        # Calculate pulse width for MG90S servo
        # 0 = 500µs, 180 = 2400µs
        pulse_width = int((angle / 180.0) * (2400 - 500) + 500)
        print(f'Calculated pulse width: {pulse_width}µs')
        
        # Send servo pulse
        result = lgpio.tx_servo(h, pin, pulse_width, 50, 0, 1)
        print(f'Servo command result: {result}')
        
        time.sleep(1)
        
        # Stop servo
        lgpio.tx_servo(h, pin, 0)
        print('Servo stopped')
        
        # Cleanup
        lgpio.gpio_free(h, pin)
        lgpio.gpiochip_close(h)
        print('GPIO cleaned up')
        
        return True
        
    except Exception as e:
        print(f'Error: {e}')
        return False

if __name__ == '__main__':
    pin = int(sys.argv[1]) if len(sys.argv) > 1 else 18
    angle = float(sys.argv[2]) if len(sys.argv) > 2 else 90
    test_servo_basic(pin, angle)
