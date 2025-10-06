#!/usr/bin/env python3
"""
BTS7960 test with GPIO readback to verify pin states
"""

import lgpio
import time
import sys

# Pin configuration
RPWM_PIN = 19
LPWM_PIN = 21
REN_PIN = 5
LEN_PIN = 22

def read_pin_state(h, pin):
    """Read and return pin state"""
    try:
        return lgpio.gpio_read(h, pin)
    except:
        return "ERROR"

print("BTS7960 GPIO Readback Test")
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
    
    # Test 1: Set all LOW
    print("TEST 1: Setting all pins LOW")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    time.sleep(0.1)
    print(f"  RPWM (GPIO {RPWM_PIN}): {read_pin_state(h, RPWM_PIN)}")
    print(f"  LPWM (GPIO {LPWM_PIN}): {read_pin_state(h, LPWM_PIN)}")
    print(f"  R_EN (GPIO {REN_PIN}): {read_pin_state(h, REN_PIN)}")
    print(f"  L_EN (GPIO {LEN_PIN}): {read_pin_state(h, LEN_PIN)}")
    
    # Test 2: Enable pins HIGH
    print("\nTEST 2: Setting enable pins HIGH")
    lgpio.gpio_write(h, REN_PIN, 1)
    lgpio.gpio_write(h, LEN_PIN, 1)
    time.sleep(0.1)
    print(f"  R_EN (GPIO {REN_PIN}): {read_pin_state(h, REN_PIN)}")
    print(f"  L_EN (GPIO {LEN_PIN}): {read_pin_state(h, LEN_PIN)}")
    
    # Test 3: RPWM HIGH (forward)
    print("\nTEST 3: Setting RPWM HIGH (forward direction)")
    lgpio.gpio_write(h, RPWM_PIN, 1)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    time.sleep(0.1)
    print(f"  RPWM (GPIO {RPWM_PIN}): {read_pin_state(h, RPWM_PIN)} <- Should be 1")
    print(f"  LPWM (GPIO {LPWM_PIN}): {read_pin_state(h, LPWM_PIN)} <- Should be 0")
    print(f"  R_EN (GPIO {REN_PIN}): {read_pin_state(h, REN_PIN)} <- Should be 1")
    print(f"  L_EN (GPIO {LEN_PIN}): {read_pin_state(h, LEN_PIN)} <- Should be 1")
    print("  ** Motor should be running FORWARD now **")
    time.sleep(2)
    
    # Test 4: Stop
    print("\nTEST 4: Stopping (all PWM LOW)")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    time.sleep(0.1)
    print(f"  RPWM (GPIO {RPWM_PIN}): {read_pin_state(h, RPWM_PIN)}")
    print(f"  LPWM (GPIO {LPWM_PIN}): {read_pin_state(h, LPWM_PIN)}")
    time.sleep(1)
    
    # Test 5: LPWM HIGH (reverse)
    print("\nTEST 5: Setting LPWM HIGH (reverse direction)")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 1)
    time.sleep(0.1)
    print(f"  RPWM (GPIO {RPWM_PIN}): {read_pin_state(h, RPWM_PIN)} <- Should be 0")
    print(f"  LPWM (GPIO {LPWM_PIN}): {read_pin_state(h, LPWM_PIN)} <- Should be 1")
    print(f"  R_EN (GPIO {REN_PIN}): {read_pin_state(h, REN_PIN)} <- Should be 1")
    print(f"  L_EN (GPIO {LEN_PIN}): {read_pin_state(h, LEN_PIN)} <- Should be 1")
    print("  ** Motor should be running REVERSE now **")
    time.sleep(2)
    
    # Cleanup
    print("\nCleaning up...")
    lgpio.gpio_write(h, RPWM_PIN, 0)
    lgpio.gpio_write(h, LPWM_PIN, 0)
    lgpio.gpio_write(h, REN_PIN, 0)
    lgpio.gpio_write(h, LEN_PIN, 0)
    lgpio.gpiochip_close(h)
    print("✓ GPIO cleanup completed")
    
    print("\n" + "=" * 60)
    print("HARDWARE CHECKLIST:")
    print("=" * 60)
    print("1. Is the BTS7960 board powered? (VCC and GND connected)")
    print("2. Is the motor power supply connected? (B+ and B-)")
    print("3. Are the motor wires connected to M+ and M-?")
    print("4. Are the GPIO pins correctly wired?")
    print("   - Pi GPIO 19 → BTS7960 RPWM")
    print("   - Pi GPIO 21 → BTS7960 LPWM")
    print("   - Pi GPIO 5  → BTS7960 R_EN")
    print("   - Pi GPIO 22 → BTS7960 L_EN")
    print("   - Pi GND     → BTS7960 GND")
    print("5. Is the motor power supply turned ON?")
    print("6. Try measuring voltage at M+ and M- with multimeter")
    print("=" * 60)
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

