#!/usr/bin/env python3
"""
BTS7960 enable pin test - tests each enable independently
"""

import lgpio
import time
import sys

# Pin configuration
RPWM_PIN = 19
LPWM_PIN = 21
REN_PIN = 5
LEN_PIN = 22

print("BTS7960 Enable Pin Test")
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
    time.sleep(0.5)
    
    # Test 1: Right side only (R_EN + RPWM)
    print("=" * 60)
    print("TEST 1: Right side only (R_EN=HIGH, L_EN=LOW)")
    print("=" * 60)
    print("Setting R_EN=HIGH, L_EN=LOW, RPWM=HIGH")
    print("Expected: Motor should run FORWARD")
    print("Measure M- voltage (should be ~0V)")
    print()
    
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 0)
    lgpio.gpio_write(h, RPWM_PIN, 1)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    
    for i in range(10):
        print(f"  {10-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Stop
    print("\n\nStopping...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    time.sleep(2)
    
    # Test 2: Left side only (L_EN + LPWM)
    print("\n" + "=" * 60)
    print("TEST 2: Left side only (R_EN=LOW, L_EN=HIGH)")
    print("=" * 60)
    print("Setting R_EN=LOW, L_EN=HIGH, LPWM=HIGH")
    print("Expected: Motor should run REVERSE")
    print("Measure M- voltage (should be ~0V)")
    print()
    
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 1)
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 1)
    
    for i in range(10):
        print(f"  {10-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Stop
    print("\n\nStopping...")
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    time.sleep(2)
    
    # Test 3: Both enables, RPWM
    print("\n" + "=" * 60)
    print("TEST 3: Both enables HIGH, RPWM active")
    print("=" * 60)
    print("Setting R_EN=HIGH, L_EN=HIGH, RPWM=HIGH")
    print("Expected: Motor should run FORWARD")
    print()
    
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
    lgpio.gpio_write(h, RPWM_PIN, 1)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    
    for i in range(10):
        print(f"  {10-i} seconds remaining...", end='\r')
        time.sleep(1)
    
    # Stop
    print("\n\nStopping...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    time.sleep(2)
    
    # Test 4: Both enables, LPWM
    print("\n" + "=" * 60)
    print("TEST 4: Both enables HIGH, LPWM active")
    print("=" * 60)
    print("Setting R_EN=HIGH, L_EN=HIGH, LPWM=HIGH")
    print("Expected: Motor should run REVERSE")
    print()
    
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
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
    print("DIAGNOSIS:")
    print("=" * 60)
    print("If TEST 1 works but TEST 2 doesn't:")
    print("  → Check L_EN (GPIO 22) wiring to BTS7960")
    print("  → Check LPWM (GPIO 21) wiring to BTS7960")
    print("  → Left channel of BTS7960 may be damaged")
    print()
    print("If both TEST 1 and TEST 2 fail:")
    print("  → Check motor connections to M+ and M-")
    print("  → Check motor power supply (B+ and B-)")
    print()
    print("If TEST 3 works but TEST 4 doesn't:")
    print("  → LPWM signal path issue")
    print("  → Try swapping RPWM and LPWM wires to test")
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

