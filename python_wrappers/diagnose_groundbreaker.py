#!/usr/bin/env python3
"""
Diagnostic script for Groundbreaker BTS7960
Tests different enable configurations and measures actual GPIO states
"""

import time
import sys

try:
    import pigpio
    HAVE_PIGPIO = True
except ImportError:
    HAVE_PIGPIO = False
    print("ERROR: pigpio not available")
    sys.exit(1)

# Your wiring
EN_PIN = 17      # Brown wire
RPWM_PIN = 27    # Red wire  
LPWM_PIN = 22    # Orange wire

print("="*60)
print("GROUNDBREAKER BTS7960 DIAGNOSTIC")
print("="*60)
print(f"EN Pin:   GPIO {EN_PIN} (Pin 11, Brown)")
print(f"RPWM Pin: GPIO {RPWM_PIN} (Pin 13, Red)")
print(f"LPWM Pin: GPIO {LPWM_PIN} (Pin 15, Orange)")
print("="*60)
print()

pi = pigpio.pi()
if not pi.connected:
    print("ERROR: pigpiod not running. Start with: sudo pigpiod")
    sys.exit(1)

print("[OK] Connected to pigpiod")
print()

# Setup all pins as outputs
pi.set_mode(EN_PIN, pigpio.OUTPUT)
pi.set_mode(RPWM_PIN, pigpio.OUTPUT)
pi.set_mode(LPWM_PIN, pigpio.OUTPUT)

# Set PWM frequency
pi.set_PWM_frequency(RPWM_PIN, 20000)
pi.set_PWM_frequency(LPWM_PIN, 20000)

print("[OK] Pins configured")
print()

# Start with everything off
pi.write(EN_PIN, 0)
pi.set_PWM_dutycycle(RPWM_PIN, 0)
pi.set_PWM_dutycycle(LPWM_PIN, 0)
time.sleep(0.5)

print("IMPORTANT: Watch the motor and measure voltages at the BTS7960 terminals")
print()
input("Press ENTER to start tests...")
print()

# Test 1: Enable HIGH, RPWM HIGH (forward)
print("="*60)
print("TEST 1: EN=HIGH, RPWM=FULL, LPWM=OFF")
print("="*60)
print("Setting EN=HIGH...")
pi.write(EN_PIN, 1)
time.sleep(0.2)
print("Setting RPWM=255 (full speed)...")
pi.set_PWM_dutycycle(RPWM_PIN, 255)
pi.set_PWM_dutycycle(LPWM_PIN, 0)
print()
print("Motor should be running FORWARD now for 5 seconds...")
print("Check:")
print("  - Is motor moving?")
print("  - Measure voltage at motor terminals")
print("  - Check BTS7960 LED indicators")
time.sleep(5)
pi.set_PWM_dutycycle(RPWM_PIN, 0)
pi.write(EN_PIN, 0)
print("[DONE] Stopped")
print()
time.sleep(2)

# Test 2: Enable HIGH, LPWM HIGH (reverse)
print("="*60)
print("TEST 2: EN=HIGH, RPWM=OFF, LPWM=FULL")
print("="*60)
print("Setting EN=HIGH...")
pi.write(EN_PIN, 1)
time.sleep(0.2)
print("Setting LPWM=255 (full speed)...")
pi.set_PWM_dutycycle(RPWM_PIN, 0)
pi.set_PWM_dutycycle(LPWM_PIN, 255)
print()
print("Motor should be running REVERSE now for 5 seconds...")
print("Check:")
print("  - Is motor moving?")
print("  - Measure voltage at motor terminals")
print("  - Check BTS7960 LED indicators")
time.sleep(5)
pi.set_PWM_dutycycle(LPWM_PIN, 0)
pi.write(EN_PIN, 0)
print("[DONE] Stopped")
print()
time.sleep(2)

# Test 3: Try with EN always HIGH, slower speed
print("="*60)
print("TEST 3: EN=HIGH, RPWM=50% speed")
print("="*60)
pi.write(EN_PIN, 1)
time.sleep(0.2)
print("Setting RPWM=128 (50% speed)...")
pi.set_PWM_dutycycle(RPWM_PIN, 128)
pi.set_PWM_dutycycle(LPWM_PIN, 0)
print()
print("Motor should be running FORWARD at 50% speed for 5 seconds...")
time.sleep(5)
pi.set_PWM_dutycycle(RPWM_PIN, 0)
pi.write(EN_PIN, 0)
print("[DONE] Stopped")
print()

# Cleanup
pi.set_PWM_dutycycle(RPWM_PIN, 0)
pi.set_PWM_dutycycle(LPWM_PIN, 0)
pi.write(EN_PIN, 0)
pi.stop()

print("="*60)
print("DIAGNOSTIC COMPLETE")
print("="*60)
print()
print("If motor did NOT move in any test:")
print("  1. Check 12V power supply is connected to BTS7960")
print("  2. Verify common ground between Pi and BTS7960")
print("  3. Check motor is connected to M+ and M- terminals")
print("  4. Verify wiring:")
print(f"     - Brown wire from GPIO {EN_PIN} to BTS7960 R_EN or L_EN")
print(f"     - Red wire from GPIO {RPWM_PIN} to BTS7960 RPWM")
print(f"     - Orange wire from GPIO {LPWM_PIN} to BTS7960 LPWM")
print("  5. Check if BTS7960 has BOTH R_EN and L_EN - may need both connected")
print()
print("If motor moved in one direction but not the other:")
print("  - One half of the H-bridge may be damaged")
print("  - Check enable pin connections (R_EN vs L_EN)")

