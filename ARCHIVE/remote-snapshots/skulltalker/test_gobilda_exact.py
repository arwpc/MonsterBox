#!/usr/bin/env python3
"""
Test GoBilda servo with exact configuration
"""

import sys
import time
import json
sys.path.insert(0, '/home/remote/MonsterBox/python_wrappers')

try:
    from servo_control import pca9685_init, pca9685_set_pwm, PCA9685_DEFAULT_ADDRESS
    print("✅ servo_control module imported successfully")
except Exception as e:
    print(f"❌ Failed to import servo_control: {e}")
    sys.exit(1)

def test_gobilda_exact():
    """Test GoBilda servo with exact pulse widths"""
    print("🔧 Testing GoBilda servo with configuration...")
    print("   - Model: GoBilda Stingray 2 Servo")
    print("   - Mode: Feedback")
    print("   - Pulse Range: 500-2500µs")
    print("   - Channel: 0")
    print("   - Address: 0x40")
    
    try:
        # Initialize PCA9685
        bus = pca9685_init(0x40)
        print("✅ PCA9685 initialized at 50Hz")
        
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
            print(f"\n🧪 Testing {description}")
            
            # Convert microseconds to off-count for 50Hz (20ms period)
            off_count = int(max(0, min(4095, (pulse_us / 20000.0) * 4096)))
            print(f"   PWM calculation: {pulse_us}µs → off_count={off_count}")
            
            # Set PWM
            pca9685_set_pwm(bus, 0x40, 0, 0, off_count)
            print(f"   ✅ PWM set to {pulse_us}µs")
            
            # Hold for 3 seconds to allow movement
            print("   ⏱️  Holding for 3 seconds...")
            time.sleep(3)
            
            # Check for movement
            response = input("   👀 Did the servo move? (y/n/q to quit): ").lower()
            if response == 'q':
                break
            elif response == 'y':
                print("   🎉 MOVEMENT DETECTED!")
            else:
                print("   😞 No movement detected")
        
        # Test continuous rotation (if servo supports it)
        print("\n🔄 Testing continuous rotation mode...")
        continuous_tests = [
            (1600, "Slow CW (1600µs)"),
            (1500, "Stop (1500µs)"),
            (1400, "Slow CCW (1400µs)"),
            (1500, "Stop (1500µs)"),
        ]
        
        for pulse_us, description in continuous_tests:
            print(f"\n🧪 Testing {description}")
            off_count = int(max(0, min(4095, (pulse_us / 20000.0) * 4096)))
            pca9685_set_pwm(bus, 0x40, 0, 0, off_count)
            print(f"   ✅ PWM set to {pulse_us}µs")
            time.sleep(2)
            
            response = input("   👀 Any continuous movement? (y/n/q): ").lower()
            if response == 'q':
                break
            elif response == 'y':
                print("   🎉 CONTINUOUS MOVEMENT DETECTED!")
        
        # Return to neutral and turn off
        print("\n🛑 Returning to neutral and turning off PWM...")
        neutral_off = int((1500 / 20000.0) * 4096)
        pca9685_set_pwm(bus, 0x40, 0, 0, neutral_off)
        time.sleep(1)
        pca9685_set_pwm(bus, 0x40, 0, 0, 0)  # Turn off PWM
        print("✅ Test complete")
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_gobilda_exact()
