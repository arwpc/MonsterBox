#!/usr/bin/env python3

import smbus
import time

def test_device_at_0x40():
    try:
        print("Testing device at 0x40 on bus 20...")
        bus = smbus.SMBus(20)
        
        # Try to read a single byte (this should work for any I2C device)
        try:
            data = bus.read_byte(0x40)
            print(f"Successfully read byte from 0x40: 0x{data:02X}")
        except Exception as e:
            print(f"Failed to read byte from 0x40: {e}")
        
        # Try to read from register 0 (MODE1 for PCA9685)
        try:
            data = bus.read_byte_data(0x40, 0x00)
            print(f"Successfully read register 0x00 from 0x40: 0x{data:02X}")
        except Exception as e:
            print(f"Failed to read register 0x00 from 0x40: {e}")
        
        # Try to write to register 0 (should be safe)
        try:
            bus.write_byte_data(0x40, 0x00, 0x00)
            print("Successfully wrote to register 0x00")
        except Exception as e:
            print(f"Failed to write to register 0x00: {e}")
        
        bus.close()
        
    except Exception as e:
        print(f"Error opening I2C bus: {e}")

if __name__ == "__main__":
    test_device_at_0x40()
