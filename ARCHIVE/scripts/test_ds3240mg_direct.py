#!/usr/bin/env python3
"""
Direct DS3240MG Servo Test Script
Tests the Hooyij DS3240MG servo directly via PCA9685 to isolate hardware issues
"""

import time
import sys
import json

try:
    from adafruit_pca9685 import PCA9685
    import board
    import busio
    PCA9685_AVAILABLE = True
except ImportError:
    print("❌ PCA9685 libraries not available")
    sys.exit(1)

def load_servo_config():
    """Load servo 30 configuration from parts.json"""
    try:
        with open('data/parts.json', 'r') as f:
            parts = json.load(f)
        
        for part in parts:
            if part.get('id') == 30 and part.get('type') == 'servo':
                return part
        
        print("❌ Servo 30 not found in parts.json")
        return None
    except Exception as e:
        print(f"❌ Error loading servo config: {e}")
        return None

def test_servo_direct():
    """Test DS3240MG servo directly"""
    print("🔧 DS3240MG Direct Hardware Test")
    print("=" * 50)
    
    # Load servo configuration
    servo_config = load_servo_config()
    if not servo_config:
        return False
    
    print(f"📋 Servo Config:")
    print(f"   Name: {servo_config['name']}")
    print(f"   Type: {servo_config['servoType']}")
    print(f"   Channel: {servo_config['channel']}")
    print(f"   Min Pulse: {servo_config['minPulse']}µs")
    print(f"   Max Pulse: {servo_config['maxPulse']}µs")
    
    pca9685_settings = servo_config.get('pca9685Settings', {})
    address_str = pca9685_settings.get('address', '0x40')
    address = int(address_str, 16) if isinstance(address_str, str) else address_str
    frequency = pca9685_settings.get('frequency', 50)
    channel = servo_config['channel']
    
    print(f"   PCA9685 Address: 0x{address:02X}")
    print(f"   PCA9685 Frequency: {frequency}Hz")
    print()
    
    try:
        # Initialize PCA9685
        print("🔌 Initializing PCA9685...")
        i2c = busio.I2C(board.SCL, board.SDA)
        pca = PCA9685(i2c, address=address)
        pca.frequency = frequency
        print(f"✅ PCA9685 initialized at 0x{address:02X}")
        
        # Test pulse widths
        test_pulses = [
            (1500, "Center"),
            (500, "Minimum"),
            (2500, "Maximum"),
            (1000, "Quarter"),
            (2000, "Three-Quarter")
        ]
        
        print("\n🎯 Testing Servo Positions:")
        print("-" * 30)
        
        for pulse_us, description in test_pulses:
            print(f"📡 {description}: {pulse_us}µs")
            
            # Calculate duty cycle
            duty_cycle = int((pulse_us / 20000.0) * 65535)
            print(f"   Duty cycle: {duty_cycle}")
            
            # Set PWM
            pca.channels[channel].duty_cycle = duty_cycle
            print(f"   ✅ PWM signal sent to channel {channel}")
            
            # Wait for movement
            print("   ⏳ Waiting 3 seconds for movement...")
            time.sleep(3)
            
            # Ask user for feedback
            response = input("   👀 Did you see servo movement? (y/n/q to quit): ").lower()
            if response == 'q':
                break
            elif response == 'y':
                print("   ✅ Movement confirmed!")
            else:
                print("   ❌ No movement detected")
            print()
        
        # Turn off PWM
        print("🔌 Turning off PWM...")
        pca.channels[channel].duty_cycle = 0
        
        # Cleanup
        pca.deinit()
        print("✅ Test completed and PCA9685 cleaned up")
        
        return True
        
    except Exception as e:
        print(f"❌ Hardware test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_servo_direct()
    sys.exit(0 if success else 1)
