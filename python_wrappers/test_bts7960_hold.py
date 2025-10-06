#!/usr/bin/env python3
"""
BTS7960 test - holds pins HIGH for 30 seconds for voltage measurement
"""

import lgpio
import time
import sys

# Pin configuration
RPWM_PIN = 19
LPWM_PIN = 21
REN_PIN = 5
LEN_PIN = 22

print("BTS7960 Extended Hold Test")
print("=" * 60)
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
    print("✓ All pins claimed as outputs\n")
    
    # Set all LOW initially
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    print("All pins set LOW")
    time.sleep(1)
    
    # Enable both sides
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
    print("Enable pins set HIGH (R_EN=1, L_EN=1)")
    time.sleep(1)
    
    # Set RPWM HIGH and hold
    print("\n" + "=" * 60)
    print("FORWARD TEST - RPWM HIGH for 30 seconds")
    print("=" * 60)
    print("Setting RPWM=HIGH, LPWM=LOW")
    print("\nMeasure voltage at M+ and M- NOW:")
    print("  - M+ should show ~12V")
    print("  - M- should show ~0V (ground)")
    print("  - Voltage across motor (M+ to M-) should be ~12V")
    print("\nMotor should be running FORWARD...")
    print("Press Ctrl+C to stop early\n")
    
    lgpio.gpio_write(h, RPWM_PIN, 1)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    
    for i in range(30):
        print(f"  {30-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Stop
    print("\n\nStopping...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    time.sleep(2)
    
    # Set LPWM HIGH and hold
    print("\n" + "=" * 60)
    print("REVERSE TEST - LPWM HIGH for 30 seconds")
    print("=" * 60)
    print("Setting RPWM=LOW, LPWM=HIGH")
    print("\nMeasure voltage at M+ and M- NOW:")
    print("  - M+ should show ~12V")
    print("  - M- should show ~0V (ground)")
    print("  - Voltage across motor (M+ to M-) should be ~12V")
    print("\nMotor should be running REVERSE...")
    print("Press Ctrl+C to stop early\n")
    
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 1)
    
    for i in range(30):
        print(f"  {30-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Cleanup
    print("\n\nCleaning up...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    lgpio.gpiochip_close(h)
    print("✓ GPIO cleanup completed")
    print("\nTest complete!")
    
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

