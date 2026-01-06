#!/usr/bin/env python3
"""
Test Groundbreaker with assumption that GPIO 17 controls BOTH R_EN and L_EN
(they might be tied together on the board)

Alternative: Maybe the wiring is:
- GPIO 17 = R_EN
- GPIO 27 = RPWM  
- GPIO 22 = LPWM
- L_EN = tied to 5V or needs separate control
"""

import time
import sys

try:
    import pigpio
except ImportError:
    print("ERROR: pigpio not available")
    sys.exit(1)

# Wiring
R_EN = 17       # Brown wire - Right Enable
RPWM = 27       # Red wire - Right PWM (forward)
LPWM = 22       # Orange wire - Left PWM (reverse)

print("="*60)
print("GROUNDBREAKER BTS7960 TEST - Dual Enable Mode")
print("="*60)
print(f"R_EN:  GPIO {R_EN} (Pin 11, Brown)")
print(f"RPWM:  GPIO {RPWM} (Pin 13, Red)")
print(f"LPWM:  GPIO {LPWM} (Pin 15, Orange)")
print()
print("Assumption: L_EN is either:")
print("  - Tied to R_EN internally")
print("  - Tied to 5V on the board")
print("  - Needs to be jumpered to 5V")
print("="*60)
print()

pi = pigpio.pi()
if not pi.connected:
    print("ERROR: pigpiod not running")
    sys.exit(1)

# Setup
pi.set_mode(R_EN, pigpio.OUTPUT)
pi.set_mode(RPWM, pigpio.OUTPUT)
pi.set_mode(LPWM, pigpio.OUTPUT)

# Set PWM frequency to 20kHz
pi.set_PWM_frequency(RPWM, 20000)
pi.set_PWM_frequency(LPWM, 20000)

# Start with everything off
pi.write(R_EN, 0)
pi.set_PWM_dutycycle(RPWM, 0)
pi.set_PWM_dutycycle(LPWM, 0)
time.sleep(0.5)

print("[OK] Ready to test")
print()

# Test Forward
print("="*60)
print("TEST: FORWARD (R_EN=HIGH, RPWM=FULL, LPWM=OFF)")
print("="*60)
pi.write(R_EN, 1)  # Enable
time.sleep(0.1)
pi.set_PWM_dutycycle(LPWM, 0)
pi.set_PWM_dutycycle(RPWM, 255)
print("Running forward for 5 seconds...")
print("WATCH THE MOTOR NOW!")
time.sleep(5)
pi.set_PWM_dutycycle(RPWM, 0)
pi.write(R_EN, 0)
print("[DONE]")
print()
time.sleep(2)

# Test Reverse
print("="*60)
print("TEST: REVERSE (R_EN=HIGH, RPWM=OFF, LPWM=FULL)")
print("="*60)
pi.write(R_EN, 1)  # Enable
time.sleep(0.1)
pi.set_PWM_dutycycle(RPWM, 0)
pi.set_PWM_dutycycle(LPWM, 255)
print("Running reverse for 5 seconds...")
print("WATCH THE MOTOR NOW!")
time.sleep(5)
pi.set_PWM_dutycycle(LPWM, 0)
pi.write(R_EN, 0)
print("[DONE]")
print()

# Cleanup
pi.set_PWM_dutycycle(RPWM, 0)
pi.set_PWM_dutycycle(LPWM, 0)
pi.write(R_EN, 0)
pi.stop()

print("="*60)
print("TEST COMPLETE")
print("="*60)
print()
print("If NO movement:")
print("  1. Check 12V power to BTS7960 VMOT")
print("  2. Check common ground (Pi GND to BTS7960 GND)")
print("  3. Check motor connections (M+ and M-)")
print("  4. Verify L_EN on BTS7960:")
print("     - Is it tied to 5V?")
print("     - Is it tied to R_EN?")
print("     - Does it need a separate GPIO?")
print("  5. Use multimeter to check:")
print("     - GPIO 17 shows 3.3V when enabled")
print("     - GPIO 27 shows PWM signal")
print("     - GPIO 22 shows PWM signal")
print("     - Motor terminals show 12V when running")

