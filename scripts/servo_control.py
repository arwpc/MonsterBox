#!/usr/bin/env python3

import lgpio
import time
import sys
import json
import smbus

def log_message(message):
    print(json.dumps(message), flush=True)

def validate_pin(pin_or_channel):
    try:
        pin = int(pin_or_channel)
        if not 0 <= pin <= 27:
            raise ValueError(f"Pin must be between 0 and 27. Got {pin}")
        return pin
    except ValueError as e:
        raise ValueError(f"Invalid pin number: {str(e)}")

def validate_channel(channel):
    try:
        channel_num = int(channel)
        if not 0 <= channel_num <= 15:
            raise ValueError(f"PCA9685 channel must be between 0 and 15. Got {channel_num}")
        return channel_num
    except ValueError as e:
        raise ValueError(f"Invalid channel number: {str(e)}")

# PCA9685 constants
PCA9685_MODE1 = 0x00
PCA9685_MODE2 = 0x01
PCA9685_SUBADR1 = 0x02
PCA9685_SUBADR2 = 0x03
PCA9685_SUBADR3 = 0x04
PCA9685_PRESCALE = 0xFE
PCA9685_LED0_ON_L = 0x06
PCA9685_LED0_ON_H = 0x07
PCA9685_LED0_OFF_L = 0x08
PCA9685_LED0_OFF_H = 0x09
PCA9685_ALLLED_ON_L = 0xFA
PCA9685_ALLLED_ON_H = 0xFB
PCA9685_ALLLED_OFF_L = 0xFC
PCA9685_ALLLED_OFF_H = 0xFD
PCA9685_DEFAULT_ADDRESS = 0x40

def pca9685_init(i2c_address=PCA9685_DEFAULT_ADDRESS):
    """Initialize PCA9685 device"""
    try:
        bus = smbus.SMBus(1)  # Use bus 1 for Raspberry Pi
        
        # Reset
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
        
        # Set sleep mode to allow prescale change
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x10)
        
        # Set prescale for 50Hz PWM frequency
        prescale = 25  # For 50Hz on 25MHz oscillator
        bus.write_byte_data(i2c_address, PCA9685_PRESCALE, prescale)
        
        # Wake up
        mode1 = bus.read_byte_data(i2c_address, PCA9685_MODE1)
        mode1 = (mode1 & ~0x10) | 0x20  # Wake up and use internal oscillator
        bus.write_byte_data(i2c_address, PCA9685_MODE1, mode1)
        
        # Wait for oscillator to stabilize
        time.sleep(0.005)
        
        # Clear the restart bit
        mode1 = bus.read_byte_data(i2c_address, PCA9685_MODE1)
        mode1 = mode1 & ~0x80
        bus.write_byte_data(i2c_address, PCA9685_MODE1, mode1)
        
        log_message({
            "status": "success",
            "message": f"PCA9685 initialized at address 0x{i2c_address:02X}"
        })
        
        return bus
    
    except Exception as e:
        log_message({
            "status": "error",
            "message": f"Failed to initialize PCA9685: {str(e)}"
        })
        raise

def pca9685_set_pwm(bus, i2c_address, channel, on, off):
    """Set PWM for a specific channel on PCA9685"""
    try:
        reg = PCA9685_LED0_ON_L + 4 * channel
        bus.write_byte_data(i2c_address, reg, on & 0xFF)
        bus.write_byte_data(i2c_address, reg+1, on >> 8)
        bus.write_byte_data(i2c_address, reg+2, off & 0xFF)
        bus.write_byte_data(i2c_address, reg+3, off >> 8)
    except Exception as e:
        log_message({
            "status": "error",
            "message": f"Failed to set PWM: {str(e)}"
        })
        raise

def pca9685_set_angle(channel, angle, i2c_address=PCA9685_DEFAULT_ADDRESS):
    """
    Set servo angle using PCA9685
    
    Args:
        channel: PCA9685 channel (0-15)
        angle: Angle in degrees (0-180)
        i2c_address: PCA9685 I2C address
    """
    try:
        # Validate angle
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")
            
        # Validate channel
        channel = validate_channel(channel)
        
        # Initialize PCA9685
        bus = pca9685_init(i2c_address)
        
        # Convert angle to pulse width (typically 500-2500 microseconds)
        # For most servos: 0° = 500µs, 180° = 2500µs
        # PCA9685 PWM frequency is set to 50Hz (20ms period)
        # 4096 steps per period
        # Convert pulse width to steps: steps = (pulse_width / 20000) * 4096
        
        pulse_width = int((angle / 180.0) * (2500 - 500) + 500)
        off_value = int((pulse_width / 20000.0) * 4096)
        
        # Set PWM
        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)
        
        # Allow time for servo to move
        time.sleep(0.5)
        
        log_message({
            "status": "success",
            "message": f"Set servo on channel {channel} to {angle} degrees"
        })
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

def set_servo_angle_gpio(pin_or_channel, angle):
    """
    Set servo angle using lgpio
    
    Args:
        pin_or_channel: GPIO pin number
        angle: Angle in degrees (0-180)
    """
    try:
        # Validate angle
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")
            
        # Validate pin
        pin = validate_pin(pin_or_channel)
        
        # Convert angle to pulse width (typically 500-2500 microseconds)
        # For most servos: 0° = 500µs, 180° = 2500µs
        pulse_width = int((angle / 180.0) * (2500 - 500) + 500)
        
        try:
            # Initialize GPIO
            h = lgpio.gpiochip_open(0)
            
            # Set up servo pin for PWM
            # 50Hz frequency (20ms period) is standard for servos
            frequency = 50
            
            # Calculate duty cycle (0-1000000)
            # pulse_width is in microseconds, period is 20000 microseconds
            duty_cycle = int((pulse_width / 20000.0) * 1000000)
            
            # Configure PWM
            lgpio.tx_pwm(h, pin, frequency, duty_cycle)
            
            # Allow time for servo to move
            time.sleep(0.5)
            
            # Stop PWM
            lgpio.tx_pwm(h, pin, frequency, 0)
            
            log_message({
                "status": "success",
                "message": f"Set servo to {angle} degrees using GPIO PWM"
            })
            
        finally:
            # Clean up
            lgpio.gpiochip_close(h)
            
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

def sweep_servo_gpio(pin_or_channel, start_angle, end_angle, step_size=1, delay=0.01):
    """
    Sweep servo between start and end angles using lgpio
    
    Args:
        pin_or_channel: GPIO pin number
        start_angle: Starting angle in degrees
        end_angle: Ending angle in degrees
        step_size: Angle increment per step
        delay: Delay between steps in seconds
    """
    try:
        # Validate angles
        if not (0 <= start_angle <= 180 and 0 <= end_angle <= 180):
            raise ValueError("Angles must be between 0 and 180 degrees")
            
        # Validate pin
        pin = validate_pin(pin_or_channel)
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        try:
            # Determine sweep direction
            step = step_size if end_angle > start_angle else -step_size
            angles = range(int(start_angle), int(end_angle) + (1 if step > 0 else -1), step)
            
            # Standard servo frequency is 50Hz
            frequency = 50
            
            for angle in angles:
                # Convert angle to pulse width
                pulse_width = int((angle / 180.0) * (2500 - 500) + 500)
                
                # Calculate duty cycle
                duty_cycle = int((pulse_width / 20000.0) * 1000000)
                
                # Set PWM
                lgpio.tx_pwm(h, pin, frequency, duty_cycle)
                time.sleep(delay)
            
            # Stop PWM
            lgpio.tx_pwm(h, pin, frequency, 0)
            
            log_message({
                "status": "success",
                "message": f"Completed sweep from {start_angle} to {end_angle} degrees"
            })
            
        finally:
            # Clean up
            lgpio.gpiochip_close(h)
            
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

if __name__ == "__main__":
    if len(sys.argv) < 3:
        log_message({
            "status": "error",
            "message": "Usage: python servo_control.py <command> <control_type> <pin/channel> <angle> [duration] [servo_type]"
        })
        sys.exit(1)
        
    try:
        command = sys.argv[1].lower()
        control_type = sys.argv[2].lower()
        
        if command == "test":
            pin_or_channel = sys.argv[3]
            angle = float(sys.argv[4])
            duration = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
            servo_type = sys.argv[6] if len(sys.argv) > 6 else "Standard"
            
            if control_type == "gpio":
                set_servo_angle_gpio(pin_or_channel, angle)
            elif control_type == "pca9685":
                i2c_address = PCA9685_DEFAULT_ADDRESS
                pca9685_set_angle(pin_or_channel, angle, i2c_address)
            else:
                raise ValueError(f"Unknown control type: {control_type}")
                
        elif command == "sweep":
            pin_or_channel = sys.argv[3]
            start_angle = float(sys.argv[4])
            end_angle = float(sys.argv[5])
            step_size = float(sys.argv[6]) if len(sys.argv) > 6 else 1
            delay = float(sys.argv[7]) if len(sys.argv) > 7 else 0.01
            
            if control_type == "gpio":
                sweep_servo_gpio(pin_or_channel, start_angle, end_angle, step_size, delay)
            else:
                raise ValueError(f"Sweep not implemented for control type: {control_type}")
                
        else:
            raise ValueError(f"Unknown command: {command}")
            
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        sys.exit(1)
