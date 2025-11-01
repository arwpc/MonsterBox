#!/usr/bin/env python3
"""
Direct MDD10A motor driver test - bypass all abstractions
This will set DIR and PWM pins directly to verify motor driver connectivity
"""

import lgpio
import time
import sys

def test_mdd10a_direct():
    """Test MDD10A with DIR=HIGH (forward) and PWM=HIGH for 5 seconds"""
    print("🔧 Direct MDD10A Motor Driver Test")
    print("=" * 50)
    
    # Configuration
    DIR_PIN = 23
    PWM_PIN = 12
    
    try:
        # Open GPIO chip
        h = lgpio.gpiochip_open(0)
        print(f"✅ GPIO chip opened")
        
        # Configure pins as outputs
        lgpio.gpio_claim_output(h, DIR_PIN)
        lgpio.gpio_claim_output(h, PWM_PIN)
        print(f"✅ Pins configured: DIR={DIR_PIN}, PWM={PWM_PIN}")
        
        # Ensure both pins start LOW
        lgpio.gpio_write(h, DIR_PIN, 0)
        lgpio.gpio_write(h, PWM_PIN, 0)
        print("⏸️  Both pins set LOW (motor should be stopped)")
        time.sleep(1)
        
        # Test sequence
        print("\n🚀 Starting motor test...")
        print("Setting DIR=HIGH (forward direction)")
        lgpio.gpio_write(h, DIR_PIN, 1)
        time.sleep(0.1)  # Let direction settle
        
        print("Setting PWM=HIGH (full speed)")
        lgpio.gpio_write(h, PWM_PIN, 1)
        print("⚡ MOTOR SHOULD BE RUNNING NOW")
        print("   - Watch for movement")
        print("   - Listen for motor hum")
        print("   - Check motor driver LEDs")
        
        # Run for 5 seconds
        for i in range(5, 0, -1):
            print(f"   Running... {i}s remaining")
            time.sleep(1)
        
        # Stop motor
        print("\n🛑 Stopping motor...")
        lgpio.gpio_write(h, PWM_PIN, 0)
        lgpio.gpio_write(h, DIR_PIN, 0)
        print("✅ Motor stopped, pins set to LOW")
        
        # Cleanup
        lgpio.gpiochip_close(h)
        print("✅ GPIO cleanup complete")
        
        print("\n" + "=" * 50)
        print("Test complete!")
        print("\nDid the motor move? If not, check:")
        print("  1. 12V power supply connected to motor driver")
        print("  2. Motor driver board connections (DIR, PWM, GND)")
        print("  3. Motor connected to motor driver outputs")
        print("  4. Motor driver board power LED lit")
        print("  5. Measure voltage at motor driver outputs with multimeter")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_mdd10a_direct()
