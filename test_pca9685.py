#!/usr/bin/env python3

import smbus
import time

def test_pca9685():
    try:
        print("Testing PCA9685 on I2C bus 21...")
        bus = smbus.SMBus(21)
        
        # Read MODE1 register
        mode1 = bus.read_byte_data(0x40, 0x00)
        print(f"PCA9685 MODE1 register: 0x{mode1:02X}")
        
        # Initialize PCA9685
        print("Initializing PCA9685...")
        
        # Reset
        bus.write_byte_data(0x40, 0x00, 0x00)
        
        # Set sleep mode
        bus.write_byte_data(0x40, 0x00, 0x10)
        
        # Set prescale for 50Hz
        prescale = 121  # For 50Hz: prescale = round(25MHz / (4096 * 50Hz)) - 1
        bus.write_byte_data(0x40, 0xFE, prescale)
        
        # Wake up
        bus.write_byte_data(0x40, 0x00, 0x20)
        time.sleep(0.005)
        
        # Clear restart bit
        mode1 = bus.read_byte_data(0x40, 0x00)
        bus.write_byte_data(0x40, 0x00, mode1 & ~0x80)
        
        print("PCA9685 initialized successfully!")
        
        # Test servo on channel 0
        print("Testing servo on channel 0...")
        
        # Calculate PWM values for 90 degrees
        # For MG90S: 90° = 1450µs pulse width
        # PWM value = (pulse_width / 20000) * 4096
        pulse_width = 1450  # microseconds for 90 degrees
        pwm_value = int((pulse_width / 20000.0) * 4096)
        
        print(f"Setting PWM value: {pwm_value} (pulse width: {pulse_width}µs)")
        
        # Set PWM for channel 0
        # LED0_ON_L = 0x06, channel 0 registers start at 0x06
        bus.write_byte_data(0x40, 0x06, 0)      # LED0_ON_L
        bus.write_byte_data(0x40, 0x07, 0)      # LED0_ON_H
        bus.write_byte_data(0x40, 0x08, pwm_value & 0xFF)  # LED0_OFF_L
        bus.write_byte_data(0x40, 0x09, pwm_value >> 8)    # LED0_OFF_H
        
        print("Servo should move to 90 degrees!")
        time.sleep(2)
        
        # Turn off servo
        bus.write_byte_data(0x40, 0x08, 0)
        bus.write_byte_data(0x40, 0x09, 0)
        print("Servo turned off")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_pca9685()
