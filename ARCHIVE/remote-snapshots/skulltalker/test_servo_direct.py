#!/usr/bin/env python3
"""
Direct servo test script to diagnose GoBilda servo issues
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

def test_servo_range():
    """Test servo with different PWM values to find the working range"""
    print("🔧 Testing GoBilda servo on PCA9685 channel 0...")
    
    try:
        # Initialize PCA9685
        bus = pca9685_init(0x40)
        print("✅ PCA9685 initialized")
        
        # Test different pulse widths
        test_values = [
            (1000, "1000µs - Far CCW"),
            (1200, "1200µs - CCW 50%"),
            (1500, "1500µs - Neutral/Stop"),
            (1800, "1800µs - CW 50%"),
            (2000, "2000µs - Far CW"),
            (500, "500µs - Min positional"),
            (2500, "2500µs - Max positional"),
        ]
        
        for pulse_us, description in test_values:
            print(f"\n🧪 Testing {description}")
            
            # Convert microseconds to off-count for 50Hz (20ms period)
            off_count = int(max(0, min(4095, (pulse_us / 20000.0) * 4096)))
            print(f"   PWM off_count: {off_count}")
            
            # Set PWM
            pca9685_set_pwm(bus, 0x40, 0, 0, off_count)
            print(f"   ✅ PWM set to {pulse_us}µs")
            
            # Hold for 2 seconds
            print("   ⏱️  Holding for 2 seconds...")
            time.sleep(2)
            
            # Check for any response
            input("   👀 Did the servo move? Press Enter to continue...")
        
        # Return to neutral and turn off
        print("\n🛑 Returning to neutral and turning off PWM...")
        neutral_off = int((1500 / 20000.0) * 4096)
        pca9685_set_pwm(bus, 0x40, 0, 0, neutral_off)
        time.sleep(0.5)
        pca9685_set_pwm(bus, 0x40, 0, 0, 0)  # Turn off PWM
        print("✅ Test complete")
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_servo_range()
