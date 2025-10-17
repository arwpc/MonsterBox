#!/usr/bin/env python3
"""
Simple BTS7960 Motor Test for Groundbreaker
Based on working Orlok test scripts
Uses simple digital HIGH/LOW control without PWM
"""

import lgpio
import time
import sys

# Groundbreaker motor pins from parts.json (FIXED - GPIO 37 doesn't exist!)
RPWM_PIN = 27  # GPIO 27 (Board Pin 13)
LPWM_PIN = 22  # GPIO 22 (Board Pin 15)
REN_PIN = 17   # GPIO 17 (Board Pin 11)
LEN_PIN = 17   # GPIO 17 (Board Pin 11) - same as REN

print("=" * 60)
print("GROUNDBREAKER BTS7960 MOTOR TEST")
print("=" * 60)
print(f"RPWM Pin: {RPWM_PIN}")
print(f"LPWM Pin: {LPWM_PIN}")
print(f"R_EN Pin: {REN_PIN}")
print(f"L_EN Pin: {LEN_PIN}")
print("=" * 60)

try:
    # Initialize GPIO
    h = lgpio.gpiochip_open(0)
    print("[OK] GPIO chip opened")

    # Claim all pins as outputs
    lgpio.gpio_claim_output(h, RPWM_PIN)
    lgpio.gpio_claim_output(h, LPWM_PIN)
    lgpio.gpio_claim_output(h, REN_PIN)
    lgpio.gpio_claim_output(h, LEN_PIN)
    print("[OK] All pins claimed as outputs")

    # Set all pins LOW initially
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    print("[OK] All pins set LOW")
    time.sleep(0.5)

    # Enable both sides
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
    print("[OK] Enable pins set HIGH (R_EN=1, L_EN=1)")
    time.sleep(0.5)

    # Test 1: Forward - RPWM HIGH, LPWM LOW
    print("\n" + "=" * 60)
    print("TEST 1: Forward for 2 seconds (RPWM=HIGH, LPWM=LOW)")
    print("=" * 60)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, RPWM_PIN, 1)
    print("Motor running FORWARD...")
    time.sleep(2)
    lgpio.gpio_write(h, RPWM_PIN, 0)
    print("[OK] Forward complete")
    time.sleep(1)

    # Test 2: Reverse - LPWM HIGH, RPWM LOW
    print("\n" + "=" * 60)
    print("TEST 2: Reverse for 2 seconds (LPWM=HIGH, RPWM=LOW)")
    print("=" * 60)
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 1)
    print("Motor running REVERSE...")
    time.sleep(2)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    print("[OK] Reverse complete")
    time.sleep(1)

    # Cleanup
    print("\n" + "=" * 60)
    print("CLEANUP")
    print("=" * 60)
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    print("[OK] All pins set LOW")

    lgpio.gpiochip_close(h)
    print("[OK] GPIO closed")

    print("\n" + "=" * 60)
    print("[SUCCESS] ALL TESTS PASSED")
    print("=" * 60)

except Exception as e:
    print(f"\n[ERROR] {e}")
    import traceback
    traceback.print_exc()

    # Try to cleanup
    try:
        lgpio.gpio_write(h, RPWM_PIN, 0)
        lgpio.gpio_write(h, LPWM_PIN, 0)
        lgpio.gpio_write(h, REN_PIN, 0)
        lgpio.gpio_write(h, LEN_PIN, 0)
        lgpio.gpiochip_close(h)
    except:
        pass

    sys.exit(1)

