#!/usr/bin/env python3
"""
Simple script to verify GPIO pins are actually outputting
"""

import time
import sys

try:
    import pigpio
except ImportError:
    print("ERROR: pigpio not available")
    sys.exit(1)

EN = 17
RPWM = 27
LPWM = 22

pi = pigpio.pi()
if not pi.connected:
    print("ERROR: pigpiod not running")
    sys.exit(1)

print("Setting up GPIO pins as outputs...")
pi.set_mode(EN, pigpio.OUTPUT)
pi.set_mode(RPWM, pigpio.OUTPUT)
pi.set_mode(LPWM, pigpio.OUTPUT)

print()
print("="*60)
print("GPIO OUTPUT TEST")
print("="*60)
print("Use a multimeter to measure voltage on each pin")
print()

print(f"Setting GPIO {EN} (Pin 11, Brown) = HIGH")
pi.write(EN, 1)
print("  -> Should measure ~3.3V")
input("Press ENTER when measured...")

print(f"\nSetting GPIO {RPWM} (Pin 13, Red) = HIGH")
pi.write(RPWM, 1)
print("  -> Should measure ~3.3V")
input("Press ENTER when measured...")

print(f"\nSetting GPIO {LPWM} (Pin 15, Orange) = HIGH")
pi.write(LPWM, 1)
print("  -> Should measure ~3.3V")
input("Press ENTER when measured...")

print("\nSetting all LOW...")
pi.write(EN, 0)
pi.write(RPWM, 0)
pi.write(LPWM, 0)
print("  -> All should measure ~0V")
input("Press ENTER when measured...")

print("\nTest complete!")
pi.stop()

