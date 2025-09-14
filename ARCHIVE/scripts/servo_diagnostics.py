#!/usr/bin/env python3
"""
Comprehensive Servo Diagnostics Script
Helps diagnose servo hardware issues by testing different configurations
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

def load_all_servos():
    """Load all servo configurations"""
    try:
        with open('data/parts.json', 'r') as f:
            parts = json.load(f)
        
        servos = []
        for part in parts:
            if part.get('type') == 'servo':
                servos.append(part)
        
        return servos
    except Exception as e:
        print(f"❌ Error loading servo configs: {e}")
        return []

def test_channel_wiring():
    """Test if channels are wired correctly by testing known working servo on different channels"""
    print("🔌 Channel Wiring Diagnostic")
    print("=" * 40)
    
    servos = load_all_servos()
    working_servo = None
    problem_servo = None
    
    # Find working and problem servos
    for servo in servos:
        if servo['id'] == 29:  # GoBilda (working)
            working_servo = servo
        elif servo['id'] == 30:  # DS3240MG (problem)
            problem_servo = servo
    
    if not working_servo or not problem_servo:
        print("❌ Could not find both servos")
        return
    
    print(f"✅ Working servo: {working_servo['name']} (Channel {working_servo['channel']})")
    print(f"❓ Problem servo: {problem_servo['name']} (Channel {problem_servo['channel']})")
    
    # Initialize PCA9685
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        pca = PCA9685(i2c, address=0x40)
        pca.frequency = 50
        
        # Test working servo on its own channel
        print(f"\n🧪 Testing working servo on its channel ({working_servo['channel']})...")
        duty_cycle = int((1500 / 20000.0) * 65535)
        pca.channels[working_servo['channel']].duty_cycle = duty_cycle
        time.sleep(2)
        
        response = input("Did the working servo move? (y/n): ").lower()
        working_on_own = response == 'y'
        
        # Test working servo on problem servo's channel
        print(f"\n🧪 Testing working servo on problem channel ({problem_servo['channel']})...")
        pca.channels[working_servo['channel']].duty_cycle = 0  # Turn off original
        pca.channels[problem_servo['channel']].duty_cycle = duty_cycle
        time.sleep(2)
        
        response = input("Did the working servo move on the problem channel? (y/n): ").lower()
        working_on_problem_channel = response == 'y'
        
        # Turn off all channels
        for i in range(16):
            pca.channels[i].duty_cycle = 0
        
        pca.deinit()
        
        # Analyze results
        print("\n📊 Channel Wiring Analysis:")
        if working_on_own and working_on_problem_channel:
            print("✅ Both channels are wired correctly")
            print("❓ Issue is likely with the DS3240MG servo itself or power supply")
        elif working_on_own and not working_on_problem_channel:
            print("❌ Problem channel is not wired correctly")
            print("🔧 Check wiring to channel 2")
        else:
            print("❌ Unexpected results - check all connections")
            
    except Exception as e:
        print(f"❌ Channel test failed: {e}")

def test_power_requirements():
    """Test if power supply is adequate"""
    print("\n⚡ Power Supply Diagnostic")
    print("=" * 40)
    
    print("DS3240MG Power Requirements:")
    print("- Voltage: 4.8V - 6.6V")
    print("- Current: Up to 2.5A at stall")
    print("- Torque: 40kg·cm")
    print()
    print("GoBilda Stingray 2 Power Requirements:")
    print("- Voltage: 4.8V - 6.0V") 
    print("- Current: ~1.5A at stall")
    print("- Torque: ~25kg·cm")
    print()
    print("💡 DS3240MG requires significantly more power!")
    print("   Check if your power supply can provide 2.5A+ per servo")

def test_extended_pulse_range():
    """Test extended pulse width ranges"""
    print("\n📡 Extended Pulse Range Test")
    print("=" * 40)
    
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        pca = PCA9685(i2c, address=0x40)
        pca.frequency = 50
        
        # Test wider pulse range for DS3240MG
        extended_pulses = [
            (400, "Extended Min"),
            (600, "Safe Min"),
            (1500, "Center"),
            (2400, "Safe Max"),
            (2600, "Extended Max")
        ]
        
        print("Testing DS3240MG on channel 2 with extended pulse range:")
        
        for pulse_us, description in extended_pulses:
            print(f"\n📡 {description}: {pulse_us}µs")
            duty_cycle = int((pulse_us / 20000.0) * 65535)
            pca.channels[2].duty_cycle = duty_cycle
            time.sleep(3)
            
            response = input("Any movement? (y/n/q to quit): ").lower()
            if response == 'q':
                break
            elif response == 'y':
                print(f"✅ Movement detected at {pulse_us}µs!")
            else:
                print(f"❌ No movement at {pulse_us}µs")
        
        # Turn off PWM
        pca.channels[2].duty_cycle = 0
        pca.deinit()
        
    except Exception as e:
        print(f"❌ Extended pulse test failed: {e}")

def main():
    print("🔧 MonsterBox Servo Diagnostics")
    print("=" * 50)
    
    print("\nThis script will help diagnose servo issues by testing:")
    print("1. Channel wiring")
    print("2. Power supply requirements") 
    print("3. Extended pulse ranges")
    print()
    
    # Test channel wiring
    test_channel_wiring()
    
    # Test power requirements
    test_power_requirements()
    
    # Test extended pulse range
    test_extended_pulse_range()
    
    print("\n✅ Diagnostics completed!")
    print("\nRecommendations:")
    print("1. Verify power supply can provide 2.5A+ for DS3240MG")
    print("2. Check channel 2 wiring if channel test failed")
    print("3. Try different pulse ranges if standard range didn't work")
    print("4. Consider servo may be defective if all tests fail")

if __name__ == "__main__":
    main()
