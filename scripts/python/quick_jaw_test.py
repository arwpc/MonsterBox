#!/usr/bin/env python3
"""
Quick jaw opening test
"""

import lgpio
import time

def quick_jaw_test():
    """Quick test of jaw positions"""
    
    pin = 18
    
    print(f"🦴 Quick Jaw Test - Pin {pin}")
    
    # Initialize GPIO
    try:
        handle = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(handle, pin)
        print("✅ GPIO ready")
    except Exception as e:
        print(f"❌ GPIO failed: {e}")
        return False
    
    def move_jaw(angle, name):
        """Move jaw to angle"""
        pulse_width = int((angle / 180.0) * (2400 - 500) + 500)
        lgpio.tx_servo(handle, pin, pulse_width, 50, 0, 1)
        print(f"→ {name}: {angle}° (pulse: {pulse_width}µs)")
        time.sleep(1.5)  # Shorter delay
    
    try:
        # Quick test sequence
        print("\n🔄 Testing jaw positions...")
        
        move_jaw(90, "CLOSED")
        move_jaw(45, "Half Open")
        move_jaw(20, "More Open")
        move_jaw(10, "Wide Open")
        move_jaw(0, "MAXIMUM")
        move_jaw(90, "Back to Closed")
        
        print("\n✅ Quick test done!")
        print("How did the jaw movement look?")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        lgpio.gpiochip_close(handle)
        print("🧹 Cleaned up")

if __name__ == "__main__":
    quick_jaw_test()
