#!/usr/bin/env python3
"""
Quick test script to verify jaw servo orientation is correct
"""

import lgpio
import time
import json

def test_jaw_orientation():
    """Test jaw open/close with corrected orientation"""
    
    # Load calibration
    try:
        with open('jaw_calibration.json', 'r') as f:
            config = json.load(f)
    except:
        print("❌ Could not load jaw_calibration.json")
        return False
    
    pin = config.get('pin', 18)
    jaw_closed = config.get('jaw_closed_angle', 90)
    jaw_open = config.get('jaw_open_angle', 0)
    
    print(f"🦴 Testing Jaw Orientation")
    print(f"   Pin: {pin}")
    print(f"   Jaw Closed Position: {jaw_closed}°")
    print(f"   Jaw Open Position: {jaw_open}°")
    print()
    
    # Initialize GPIO
    try:
        handle = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(handle, pin)
        print("✅ GPIO initialized")
    except Exception as e:
        print(f"❌ GPIO failed: {e}")
        return False
    
    def move_to_angle(angle):
        """Move servo to angle"""
        pulse_width = int((angle / 180.0) * (2400 - 500) + 500)
        lgpio.tx_servo(handle, pin, pulse_width, 50, 0, 1)
        print(f"   Moved to {angle}° (pulse: {pulse_width}µs)")
        time.sleep(2)
    
    try:
        print("🔄 Testing jaw movement sequence...")
        
        # Test sequence
        print("\n1. Moving to CLOSED position...")
        move_to_angle(jaw_closed)
        input("   Press Enter when you confirm jaw is CLOSED...")
        
        print("\n2. Moving to OPEN position...")
        move_to_angle(jaw_open)
        input("   Press Enter when you confirm jaw is OPEN...")
        
        print("\n3. Moving back to CLOSED...")
        move_to_angle(jaw_closed)
        input("   Press Enter when you confirm jaw is CLOSED again...")
        
        print("\n✅ Orientation test completed!")
        print("If the jaw moved correctly (closed->open->closed), the orientation is fixed!")
        
        return True
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted")
        return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    finally:
        # Cleanup
        lgpio.gpiochip_close(handle)
        print("🧹 GPIO cleaned up")

if __name__ == "__main__":
    test_jaw_orientation()
