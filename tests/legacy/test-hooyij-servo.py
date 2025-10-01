#!/usr/bin/env python3

"""
Hooyij Servo Diagnostic Script
Tests the Hooyij 40kg DS3240MG servo on PCA9685 channel 1
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

def test_servo_channel_1():
    """Test servo on PCA9685 channel 1 with various pulse widths"""
    
    print("🔧 Hooyij Servo Diagnostic Test")
    print("=" * 50)
    
    try:
        # Initialize PCA9685
        print("📡 Initializing PCA9685...")
        i2c = busio.I2C(board.SCL, board.SDA)
        pca = PCA9685(i2c, address=0x40)
        pca.frequency = 50
        print("✅ PCA9685 initialized at 50Hz")
        
        # Test sequence with extended pulse range for Hooyij servo
        print("\n🎯 Testing Hooyij servo pulse range...")
        
        # Hooyij servos often have wider pulse ranges
        test_sequence = [
            ("Neutral", 1500),
            ("Min position", 500),
            ("Max position", 2500),
            ("Extended min", 400),
            ("Extended max", 2600),
            ("Center", 1500),
            ("Quarter left", 1250),
            ("Quarter right", 1750),
            ("Back to center", 1500)
        ]
        
        for description, pulse_us in test_sequence:
            print(f"\n📍 {description}: {pulse_us}µs")
            duty_cycle = int((pulse_us / 20000.0) * 65535)
            print(f"   Duty cycle: {duty_cycle}")
            
            pca.channels[1].duty_cycle = duty_cycle
            
            # Wait and check for movement
            print("   ⏳ Waiting 3 seconds... (Watch for servo movement)")
            time.sleep(3)
            
            response = input("   Did you see movement? (y/n/q to quit): ").lower().strip()
            if response == 'q':
                break
            elif response == 'y':
                print("   ✅ Movement detected!")
            else:
                print("   ❌ No movement")
        
        # Test all channels to verify wiring
        print("\n🔍 Testing all PCA9685 channels (0-15)...")
        print("This will help identify which channel the servo is actually connected to.")
        
        test_all = input("Test all channels? (y/n): ").lower().strip()
        if test_all == 'y':
            for channel in range(16):
                print(f"\n📡 Testing channel {channel}...")
                pca.channels[channel].duty_cycle = int((1500 / 20000.0) * 65535)
                time.sleep(1)
                pca.channels[channel].duty_cycle = int((1000 / 20000.0) * 65535)
                time.sleep(1)
                pca.channels[channel].duty_cycle = int((2000 / 20000.0) * 65535)
                time.sleep(1)
                pca.channels[channel].duty_cycle = 0
                
                response = input(f"   Movement on channel {channel}? (y/n): ").lower().strip()
                if response == 'y':
                    print(f"   ✅ Servo responds on channel {channel}!")
                    break
        
        # Turn off all PWM
        print("\n🛑 Turning off all PWM channels...")
        for channel in range(16):
            pca.channels[channel].duty_cycle = 0
        
        pca.deinit()
        print("✅ Test completed")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    
    return True

def check_power_supply():
    """Check power supply recommendations"""
    print("\n⚡ Power Supply Check")
    print("=" * 30)
    print("The Hooyij 40kg DS3240MG servo requires:")
    print("• Voltage: 4.8V - 6.6V (6V recommended)")
    print("• Current: Up to 2.5A under load")
    print("• Make sure your power supply can provide sufficient current")
    print("• Check that power and ground are properly connected")
    print("• Verify the servo's power LED (if present) is on")

def check_wiring():
    """Display wiring check"""
    print("\n🔌 Wiring Check")
    print("=" * 20)
    print("PCA9685 Channel 1 should be connected to:")
    print("• Red wire (Power) → External 6V power supply positive")
    print("• Black/Brown wire (Ground) → Common ground with PCA9685")
    print("• Yellow/Orange wire (Signal) → PCA9685 channel 1 PWM output")
    print("\nDouble-check:")
    print("• All connections are secure")
    print("• No loose wires")
    print("• Correct channel number (should be channel 1)")

if __name__ == "__main__":
    print("🤖 MonsterBox Hooyij Servo Diagnostic")
    print("This script will help diagnose why your servo isn't moving.\n")
    
    check_power_supply()
    check_wiring()
    
    print("\nReady to test servo?")
    input("Press Enter to continue...")
    
    test_servo_channel_1()
    
    print("\n📋 Troubleshooting Summary:")
    print("1. If no movement on any channel: Check power supply")
    print("2. If movement on different channel: Update parts.json with correct channel")
    print("3. If movement but wrong direction: Adjust pulse width range")
    print("4. If intermittent movement: Check connections and power supply capacity")
