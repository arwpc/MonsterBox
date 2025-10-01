#!/usr/bin/env python3
"""
Test GoBilda servo with exact configuration
"""

import sys
import time
sys.path.insert(0, '/home/remote/MonsterBox/python_wrappers')

try:
    from pca9685_control import pca9685_init, pca9685_set_pwm
    print("[OK] pca9685_control module imported successfully")
except Exception as e:
    print(f"[ERROR] Failed to import pca9685_control: {e}")
    sys.exit(1)

def test_gobilda_exact():
    """Test GoBilda servo with exact pulse widths"""
    print("[TEST] Testing GoBilda servo with configuration...")
    print("   - Model: GoBilda Stingray 2 Servo")
    print("   - Mode: Feedback")
    print("   - Pulse Range: 500-2500us")
    print("   - Channel: 0")
    print("   - Address: 0x40")

    try:
        # Initialize PCA9685
        bus = pca9685_init(0x40)
        print("[OK] PCA9685 initialized at 50Hz")
        
        # Test exact pulse widths from configuration
        test_values = [
            (1500, "Neutral/Center (1500µs)"),
            (500, "Min Position (500µs)"),
            (1000, "Quarter Position (1000µs)"),
            (1500, "Center Position (1500µs)"),
            (2000, "Three-Quarter Position (2000µs)"),
            (2500, "Max Position (2500µs)"),
            (1500, "Return to Center (1500µs)"),
        ]
        
        for pulse_us, description in test_values:
            print(f"\n[TEST] Testing {description}")

            # Convert microseconds to off-count for 50Hz (20ms period)
            off_count = int(max(0, min(4095, (pulse_us / 20000.0) * 4096)))
            print(f"   PWM calculation: {pulse_us}us -> off_count={off_count}")

            # Set PWM
            pca9685_set_pwm(bus, 0x40, 0, 0, off_count)
            print(f"   [OK] PWM set to {pulse_us}us")

            # Hold for 3 seconds to allow movement
            print("   [WAIT] Holding for 3 seconds...")
            time.sleep(3)

            # Check for movement
            response = input("   [INPUT] Did the servo move? (y/n/q to quit): ").lower()
            if response == 'q':
                break
            elif response == 'y':
                print("   [SUCCESS] MOVEMENT DETECTED!")
            else:
                print("   [INFO] No movement detected")
        
        # Test continuous rotation (if servo supports it)
        print("\n[TEST] Testing continuous rotation mode...")
        continuous_tests = [
            (1600, "Slow CW (1600us)"),
            (1500, "Stop (1500us)"),
            (1400, "Slow CCW (1400us)"),
            (1500, "Stop (1500us)"),
        ]

        for pulse_us, description in continuous_tests:
            print(f"\n[TEST] Testing {description}")
            off_count = int(max(0, min(4095, (pulse_us / 20000.0) * 4096)))
            pca9685_set_pwm(bus, 0x40, 0, 0, off_count)
            print(f"   [OK] PWM set to {pulse_us}us")
            time.sleep(2)

            response = input("   [INPUT] Any continuous movement? (y/n/q): ").lower()
            if response == 'q':
                break
            elif response == 'y':
                print("   [SUCCESS] CONTINUOUS MOVEMENT DETECTED!")

        # Return to neutral and turn off
        print("\n[CLEANUP] Returning to neutral and turning off PWM...")
        neutral_off = int((1500 / 20000.0) * 4096)
        pca9685_set_pwm(bus, 0x40, 0, 0, neutral_off)
        time.sleep(1)
        pca9685_set_pwm(bus, 0x40, 0, 0, 0)  # Turn off PWM
        print("[OK] Test complete")
        
    except Exception as e:
        print(f"[ERROR] Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_gobilda_exact()
