#!/usr/bin/env python3
"""
Direct test of GPIO 19 - check if pin can output HIGH
"""

import lgpio
import time

PIN = 19

print(f"Testing GPIO {PIN} directly")
print("=" * 60)

try:
    h = lgpio.gpiochip_open(0)
    print(f"✓ GPIO chip opened")
    
    # Claim pin as output
    lgpio.gpio_claim_output(h, PIN)
    print(f"✓ GPIO {PIN} claimed as output")
    
    # Set LOW
    lgpio.gpio_write(h, PIN, 0)
    time.sleep(0.5)
    state = lgpio.gpio_read(h, PIN)
    print(f"\nSet LOW: Read back = {state} (should be 0)")
    
    # Set HIGH
    lgpio.gpio_write(h, PIN, 1)
    time.sleep(0.5)
    state = lgpio.gpio_read(h, PIN)
    print(f"Set HIGH: Read back = {state} (should be 1)")
    
    # Toggle test
    print(f"\nToggling GPIO {PIN} for 10 seconds...")
    print("Use multimeter/LED to verify pin is switching")
    print("Measure between GPIO 19 (physical pin 35) and GND\n")
    
    for i in range(20):
        lgpio.gpio_write(h, PIN, 1)
        print(f"HIGH ({10-i//2}s remaining)", end='\r')
        time.sleep(0.5)
        lgpio.gpio_write(h, PIN, 0)
        time.sleep(0.5)
    
    print("\n\n✓ Test complete")
    
    # Cleanup
    lgpio.gpio_write(h, PIN, 0)
    lgpio.gpiochip_close(h)
    
    print("\n" + "=" * 60)
    print("RESULTS:")
    print("=" * 60)
    print("If readback shows correct values (0 and 1):")
    print("  → GPIO 19 software control is working")
    print("  → Problem is likely:")
    print("    - Wire from GPIO 19 not connected to BTS7960 LPWM")
    print("    - Bad/loose connection")
    print("    - Wrong pin on BTS7960 board")
    print("\nIf readback shows wrong values:")
    print("  → GPIO 19 hardware may be damaged")
    print("  → Try using a different GPIO pin")
    print("=" * 60)
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()

