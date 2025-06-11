#!/usr/bin/env python3
"""
Test wider jaw opening range
"""

import lgpio
import time
import json

def test_wider_jaw():
    """Test jaw with wider opening range"""
    
    pin = 18
    
    print(f"🦴 Testing Wider Jaw Opening")
    print(f"   Pin: {pin}")
    print()
    
    # Initialize GPIO
    try:
        handle = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(handle, pin)
        print("✅ GPIO initialized")
    except Exception as e:
        print(f"❌ GPIO failed: {e}")
        return False
    
    def move_to_angle(angle, description=""):
        """Move servo to angle"""
        pulse_width = int((angle / 180.0) * (2400 - 500) + 500)
        lgpio.tx_servo(handle, pin, pulse_width, 50, 0, 1)
        print(f"   {description}: {angle}° (pulse: {pulse_width}µs)")
        time.sleep(2)
    
    try:
        print("🔄 Testing jaw opening sequence...")
        
        # Test sequence with wider range
        test_positions = [
            (90, "CLOSED (starting position)"),
            (60, "Slightly open"),
            (30, "Half open"),
            (10, "WIDE OPEN"),
            (0, "MAXIMUM OPEN (if safe)"),
            (30, "Back to half open"),
            (90, "CLOSED (final position)")
        ]
        
        for angle, description in test_positions:
            print(f"\n→ {description}")
            move_to_angle(angle, description)
            
            if "MAXIMUM" in description:
                response = input("   Is this position safe? (y/n): ").lower()
                if response != 'y':
                    print("   ⚠️ Stopping at safe position")
                    break
        
        print("\n✅ Wider jaw test completed!")
        print("The jaw should now have a much wider opening range!")
        
        return True
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted")
        return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    finally:
        # Return to closed position and cleanup
        move_to_angle(90, "Returning to CLOSED")
        lgpio.gpiochip_close(handle)
        print("🧹 GPIO cleaned up")

if __name__ == "__main__":
    test_wider_jaw()
