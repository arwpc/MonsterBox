#!/usr/bin/env python3
"""
BTS7960 test with corrected pin mapping
GPIO 21 = RPWM (forward)
GPIO 19 = LPWM (reverse)
"""

import lgpio
import time
import sys

# CORRECTED Pin configuration
RPWM_PIN = 21  # Was 19
LPWM_PIN = 19  # Was 21
REN_PIN = 5
LEN_PIN = 22

print("BTS7960 Test - CORRECTED Pin Mapping")
print("=" * 60)
print(f"RPWM Pin: GPIO {RPWM_PIN} (forward)")
print(f"LPWM Pin: GPIO {LPWM_PIN} (reverse)")
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
    print("✓ All pins claimed as outputs\n")
    
    # Set all LOW initially
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    time.sleep(0.5)
    
    # Enable both sides
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
    print("Both enables set HIGH")
    time.sleep(0.5)
    
    # Test FORWARD (RPWM = GPIO 21)
    print("\n" + "=" * 60)
    print("FORWARD TEST - GPIO 21 (RPWM) HIGH for 10 seconds")
    print("=" * 60)
    print("Measure voltage at M+ and M-")
    print("Motor should extend/move forward\n")
    
    lgpio.gpio_write(h, RPWM_PIN, 1)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    
    for i in range(10):
        print(f"  {10-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Stop
    print("\n\nStopping...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    time.sleep(2)
    
    # Test REVERSE (LPWM = GPIO 19)
    print("\n" + "=" * 60)
    print("REVERSE TEST - GPIO 19 (LPWM) HIGH for 10 seconds")
    print("=" * 60)
    print("Measure voltage at M+ and M-")
    print("Motor should retract/move reverse\n")
    
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 1)
    
    for i in range(10):
        print(f"  {10-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Cleanup
    print("\n\nCleaning up...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    lgpio.gpiochip_close(h)
    print("✓ GPIO cleanup completed")
    
    print("\n" + "=" * 60)
    print("NEXT STEPS:")
    print("=" * 60)
    print("1. Did you see 12V at M- during BOTH tests?")
    print("2. Did the motor move during either test?")
    print("3. If voltage is present but no movement:")
    print("   - Check motor connections (M+ and M-)")
    print("   - Try manually connecting motor to 12V power")
    print("   - Motor may need more current than BTS7960 provides")
    print("   - Check if motor is mechanically stuck")
    print("=" * 60)
    
except KeyboardInterrupt:
    print("\n\nInterrupted by user - cleaning up...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    lgpio.gpiochip_close(h)
    print("✓ GPIO cleanup completed")
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

