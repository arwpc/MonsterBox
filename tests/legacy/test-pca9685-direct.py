#!/usr/bin/env python3

"""
Direct test of PCA9685 with 5V power to see if servo moves
"""

import time
import board
import busio
from adafruit_pca9685 import PCA9685
from adafruit_motor import servo

def test_pca9685_servo():
    print("🔧 Testing PCA9685 with 5V power...")

    try:
        # Initialize I2C bus
        i2c = busio.I2C(board.SCL, board.SDA)
        print("✅ I2C bus initialized")

        # Scan for I2C devices
        print("🔍 Scanning for I2C devices...")
        while not i2c.try_lock():
            pass
        try:
            devices = i2c.scan()
            print(f"   Found devices at addresses: {[hex(addr) for addr in devices]}")
        finally:
            i2c.unlock()

        # Try different PCA9685 addresses
        pca_addresses = [0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47]
        pca = None

        for addr in pca_addresses:
            try:
                print(f"   Trying PCA9685 at address {hex(addr)}...")
                pca = PCA9685(i2c, address=addr)
                pca.frequency = 50
                print(f"✅ PCA9685 found and initialized at {hex(addr)} with 50Hz")
                break
            except Exception as e:
                print(f"   No PCA9685 at {hex(addr)}: {e}")
                continue

        if pca is None:
            raise Exception("No PCA9685 found at any standard address")
        
        # Create servo object on channel 0 (where Orlok Head Servo is connected)
        servo_channel = pca.channels[0]
        orlok_servo = servo.Servo(servo_channel, min_pulse=600, max_pulse=2400)
        print("✅ Servo object created on channel 0")
        
        print("\n🎯 Testing servo movement...")
        
        # Test sequence
        angles = [90, 45, 135, 90, 0, 180, 90]
        
        for angle in angles:
            print(f"   Moving to {angle}°...")
            orlok_servo.angle = angle
            time.sleep(1)
            
        print("\n✅ Servo test sequence completed!")
        print("   If you saw the servo move, the PCA9685 is working correctly!")
        
        # Cleanup
        pca.deinit()
        print("✅ PCA9685 deinitialized")
        
    except Exception as e:
        print(f"❌ Error testing PCA9685: {e}")
        return False
        
    return True

if __name__ == "__main__":
    success = test_pca9685_servo()
    if success:
        print("\n🎉 PCA9685 test completed successfully!")
    else:
        print("\n💥 PCA9685 test failed!")
