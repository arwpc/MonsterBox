#!/usr/bin/env python3
"""
Quick Servo Channel Test
Tests if the issue is channel wiring or servo hardware
"""

import time
import sys

try:
    from adafruit_pca9685 import PCA9685
    import board
    import busio
    PCA9685_AVAILABLE = True
except ImportError:
    print("❌ PCA9685 libraries not available")
    sys.exit(1)

def test_channels():
    """Test both channels with same pulse widths"""
    print("🔧 Quick Channel Diagnostic Test")
    print("=" * 50)
    
    try:
        # Initialize PCA9685
        i2c = busio.I2C(board.SCL, board.SDA)
        pca = PCA9685(i2c, address=0x40)
        pca.frequency = 50
        print("✅ PCA9685 initialized")
        
        # Test sequence
        test_pulses = [1500, 1000, 2000, 1500]  # Center, quarter, three-quarter, center
        
        print("\n🎯 Testing Channel 0 (GoBilda - should work):")
        for i, pulse_us in enumerate(test_pulses):
            print(f"   Step {i+1}: {pulse_us}µs")
            duty_cycle = int((pulse_us / 20000.0) * 65535)
            pca.channels[0].duty_cycle = duty_cycle
            time.sleep(2)
            
            response = input(f"   Did GoBilda move to {pulse_us}µs? (y/n): ").lower()
            if response != 'y':
                print("   ❌ GoBilda not working - system issue!")
                return False
        
        print("\n🎯 Testing Channel 2 (DS3240MG - problem channel):")
        for i, pulse_us in enumerate(test_pulses):
            print(f"   Step {i+1}: {pulse_us}µs")
            duty_cycle = int((pulse_us / 20000.0) * 65535)
            pca.channels[2].duty_cycle = duty_cycle
            time.sleep(2)
            
            response = input(f"   Did DS3240MG move to {pulse_us}µs? (y/n): ").lower()
            if response == 'y':
                print("   ✅ DS3240MG working!")
            else:
                print("   ❌ DS3240MG not moving")
        
        # Turn off all channels
        for i in range(16):
            pca.channels[i].duty_cycle = 0
        
        pca.deinit()
        print("\n✅ Test completed")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def main():
    print("This test will help determine if the issue is:")
    print("1. Channel 2 wiring problem")
    print("2. DS3240MG servo hardware problem") 
    print("3. Power supply issue")
    print()
    
    if test_channels():
        print("\n📊 Diagnosis:")
        print("If GoBilda worked but DS3240MG didn't:")
        print("  🔌 Check channel 2 wiring")
        print("  ⚡ Check power supply (DS3240MG needs 2.5A)")
        print("  🔧 DS3240MG may be defective")
        print()
        print("If both worked:")
        print("  ✅ Hardware is fine - software issue")
        print()
        print("If neither worked:")
        print("  ❌ System-wide problem - check PCA9685 connections")

if __name__ == "__main__":
    main()
