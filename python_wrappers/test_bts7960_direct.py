#!/usr/bin/env python3
"""
Direct BTS7960 test - sets pins HIGH continuously for manual testing
"""

import lgpio
import time
import sys

# Pin configuration
RPWM_PIN = 19
LPWM_PIN = 21
REN_PIN = 5
LEN_PIN = 22

print("BTS7960 Direct Test")
print("=" * 50)
print(f"RPWM Pin: GPIO {RPWM_PIN}")
print(f"LPWM Pin: GPIO {LPWM_PIN}")
print(f"R_EN Pin: GPIO {REN_PIN}")
print(f"L_EN Pin: GPIO {LEN_PIN}")
print()

try:
    # Initialize GPIO
    h = lgpio.gpiochip_open(0)
    print("✓ GPIO chip opened")
    
    # Claim all pins as outputs
    lgpio.gpio_claim_output(h, RPWM_PIN)
    lgpio.gpio_claim_output(h, LPWM_PIN)
    lgpio.gpio_claim_output(h, REN_PIN)
    lgpio.gpio_claim_output(h, LEN_PIN)
    print("✓ All pins claimed as outputs")
    
    # Set all pins LOW initially
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    print("✓ All pins set LOW")
    time.sleep(0.5)
    
    # Enable both sides
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
    print("✓ Enable pins set HIGH (R_EN=1, L_EN=1)")
    time.sleep(0.5)
    
    # Test forward (RPWM HIGH)
    print("\n--- Testing FORWARD (RPWM HIGH for 3 seconds) ---")
    print("Setting RPWM=HIGH, LPWM=LOW")
    lgpio.gpio_write(h, RPWM_PIN, 1)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    print("Motor should be moving FORWARD now...")
    time.sleep(3)
    
    # Stop
    print("\n--- STOPPING ---")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    print("All PWM pins set LOW")
    time.sleep(1)
    
    # Test reverse (LPWM HIGH)
    print("\n--- Testing REVERSE (LPWM HIGH for 3 seconds) ---")
    print("Setting RPWM=LOW, LPWM=HIGH")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 1)
    print("Motor should be moving REVERSE now...")
    time.sleep(3)
    
    # Stop
    print("\n--- STOPPING ---")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    print("All PWM pins set LOW")
    
    # Cleanup
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    lgpio.gpiochip_close(h)
    print("\n✓ GPIO cleanup completed")
    print("\nTest complete!")
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    sys.exit(1)

