#!/usr/bin/env python3

"""
PCA9685 Channel Scanner for Hooyij Servo
Systematically tests each channel to find where the servo is connected
"""

import time
import sys

try:
    from adafruit_pca9685 import PCA9685
    import board
    import busio
except ImportError:
    print("❌ PCA9685 libraries not available")
    sys.exit(1)

def scan_channels():
    """Scan all PCA9685 channels to find the servo"""
    
    print("🔍 PCA9685 Channel Scanner")
    print("=" * 40)
    print("This will test each channel with a sweep pattern.")
    print("Watch your servo and note which channel causes movement.\n")
    
    try:
        # Initialize PCA9685
        print("📡 Initializing PCA9685...")
        i2c = busio.I2C(board.SCL, board.SDA)
        pca = PCA9685(i2c, address=0x40)
        pca.frequency = 50
        print("✅ PCA9685 initialized at 50Hz\n")
        
        # Test each channel
        for channel in range(16):
            print(f"🎯 Testing Channel {channel}...")
            
            # Sweep pattern: center -> left -> center -> right -> center
            sweep_sequence = [
                ("Center", 1500),
                ("Left", 1000),
                ("Center", 1500),
                ("Right", 2000),
                ("Center", 1500)
            ]
            
            for position, pulse_us in sweep_sequence:
                duty_cycle = int((pulse_us / 20000.0) * 65535)
                pca.channels[channel].duty_cycle = duty_cycle
                print(f"   {position}: {pulse_us}µs", end="", flush=True)
                time.sleep(0.8)
                print(" ✓")
            
            # Turn off this channel
            pca.channels[channel].duty_cycle = 0
            
            print(f"   Channel {channel} test complete.")
            
            # Ask user if they saw movement
            while True:
                response = input(f"   Did you see servo movement on channel {channel}? (y/n/skip): ").lower().strip()
                if response in ['y', 'yes']:
                    print(f"🎉 FOUND IT! Servo is connected to channel {channel}")
                    print(f"\n📝 Update your parts.json:")
                    print(f'   Change "channel": 1 to "channel": {channel}')
                    
                    # Test the found channel more thoroughly
                    test_found_channel(pca, channel)
                    pca.deinit()
                    return channel
                elif response in ['n', 'no']:
                    break
                elif response == 'skip':
                    print("   Skipping to next channel...")
                    break
                else:
                    print("   Please enter 'y', 'n', or 'skip'")
            
            print()  # Empty line for readability
        
        print("❌ No servo movement detected on any channel.")
        print("\n🔧 Troubleshooting suggestions:")
        print("1. Check servo power connections (red wire to 6V+)")
        print("2. Check ground connection (black wire to common ground)")
        print("3. Verify signal wire is connected to a PCA9685 PWM output")
        print("4. Try a different servo to test the PCA9685")
        print("5. Check if servo has a power LED and if it's on")
        
        pca.deinit()
        return None
        
    except Exception as e:
        print(f"❌ Scanner failed: {e}")
        return None

def test_found_channel(pca, channel):
    """Test the found channel with extended pulse range"""
    print(f"\n🎯 Testing channel {channel} with extended pulse range...")
    
    # Extended test for Hooyij servo
    extended_tests = [
        ("Minimum", 500),
        ("Quarter", 1000),
        ("Center", 1500),
        ("Three-quarter", 2000),
        ("Maximum", 2500),
        ("Extended min", 400),
        ("Extended max", 2600)
    ]
    
    for description, pulse_us in extended_tests:
        print(f"   {description}: {pulse_us}µs")
        duty_cycle = int((pulse_us / 20000.0) * 65535)
        pca.channels[channel].duty_cycle = duty_cycle
        time.sleep(1.5)
    
    # Return to center
    pca.channels[channel].duty_cycle = int((1500 / 20000.0) * 65535)
    time.sleep(1)
    pca.channels[channel].duty_cycle = 0

if __name__ == "__main__":
    print("🤖 MonsterBox Servo Channel Scanner")
    print("This will help find which PCA9685 channel your servo is connected to.\n")
    
    input("Make sure your servo is connected and powered. Press Enter to start...")
    
    found_channel = scan_channels()
    
    if found_channel is not None:
        print(f"\n✅ Success! Your servo is on channel {found_channel}")
    else:
        print(f"\n❌ Servo not found. Check connections and power supply.")
