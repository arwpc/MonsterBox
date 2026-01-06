#!/usr/bin/env python3

"""
PCA9685 Control Module for MonsterBox 5.5
Direct hardware control for MonsterBox 5.5
"""

import json
import time
import sys

# PCA9685 Constants
PCA9685_DEFAULT_ADDRESS = 0x40
PCA9685_MODE1 = 0x00
PCA9685_PRESCALE = 0xFE
PCA9685_LED0_ON_L = 0x06

def log_message(msg_dict):
    """Log structured message to stdout"""
    print(json.dumps(msg_dict))

def validate_channel(channel):
    """Validate PCA9685 channel (0-15)"""
    channel = int(channel)
    if not 0 <= channel <= 15:
        raise ValueError(f"Channel must be 0-15, got {channel}")
    return channel

def pca9685_init(i2c_address=PCA9685_DEFAULT_ADDRESS):
    """Initialize PCA9685 device"""
    try:
        import smbus
        bus = smbus.SMBus(1)  # Use bus 1 for Raspberry Pi 4B I2C
        
        # Reset
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
        
        # Set sleep mode to allow prescale change
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x10)
        
        # Set prescale for 50Hz PWM frequency
        # prescale = round(osc_clock / (4096 * freq)) - 1  with osc_clock=25MHz
        desired_freq_hz = 50
        prescale_val = int(round(25000000.0 / (4096.0 * desired_freq_hz)) - 1)
        if prescale_val < 3:
            prescale_val = 3
        if prescale_val > 255:
            prescale_val = 255
        bus.write_byte_data(i2c_address, PCA9685_PRESCALE, prescale_val)
        
        # Wake up (turn off sleep mode)
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
        time.sleep(0.005)  # Wait for oscillator
        
        # Enable auto increment
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x20)
        
        log_message({
            "status": "success",
            "message": f"PCA9685 initialized at address 0x{i2c_address:02x}"
        })
        
        return bus
        
    except ImportError:
        log_message({
            "status": "error",
            "message": "smbus library not available. Install with: sudo apt install python3-smbus"
        })
        raise
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

def pca9685_set_angle(channel, angle, i2c_address=PCA9685_DEFAULT_ADDRESS, servo_type="standard"):
    """
    Set servo angle using PCA9685
    
    Args:
        channel: PCA9685 channel (0-15)
        angle: Angle in degrees (0-180)
        i2c_address: PCA9685 I2C address
        servo_type: Type of servo ("standard", "continuous")
    """
    try:
        # Validate angle
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")
            
        # Validate channel
        channel = validate_channel(channel)
        
        # Initialize PCA9685
        bus = pca9685_init(i2c_address)
        
        # Convert angle to pulse width for standard servo
        # Standard servo: 0° = 500µs, 180° = 2400µs
        # PCA9685 PWM frequency is set to 50Hz (20ms period)
        # 4096 steps per period
        # Convert pulse width to steps: steps = (pulse_width / 20000) * 4096
        pulse_width = int((angle / 180.0) * (2400 - 500) + 500)
        off_value = int((pulse_width / 20000.0) * 4096)
        
        # Set PWM
        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)

        # Allow time for servo to move
        time.sleep(0.5)

        # For standard positioning servos, keep PWM active to maintain position
        # Standard servos need continuous PWM signal to hold their position
        if servo_type == "standard":
            log_message({
                "status": "info",
                "message": f"Keeping PWM active for standard servo on channel {channel} to maintain position"
            })
        else:
            # For continuous servos, turn off PWM after movement
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)
            log_message({
                "status": "info",
                "message": f"Turned off PWM for continuous servo on channel {channel}"
            })
        
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

def pca9685_set_pulse_width(channel, pulse_us, i2c_address=PCA9685_DEFAULT_ADDRESS, servo_type="standard"):
    """
    Set servo pulse width directly using PCA9685
    
    Args:
        channel: PCA9685 channel (0-15)
        pulse_us: Pulse width in microseconds
        i2c_address: PCA9685 I2C address
        servo_type: Type of servo ("standard", "continuous")
    """
    try:
        # Validate channel
        channel = validate_channel(channel)
        
        # Initialize PCA9685
        bus = pca9685_init(i2c_address)
        
        # Convert microseconds to 0..4095 off-count for 50Hz (20ms period)
        off_value = int((pulse_us / 20000.0) * 4096)
        off_value = max(0, min(4095, off_value))
        
        # Set PWM
        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)

        # Allow time for servo to move
        time.sleep(0.5)

        # For standard positioning servos, keep PWM active to maintain position
        if servo_type == "standard":
            log_message({
                "status": "info",
                "message": f"Keeping PWM active for standard servo on channel {channel} (pulse: {pulse_us}µs)"
            })
        else:
            # For continuous servos, turn off PWM after movement
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)
            log_message({
                "status": "info",
                "message": f"Turned off PWM for continuous servo on channel {channel}"
            })
        
        log_message({
            "status": "success",
            "message": f"Set servo on channel {channel} to {pulse_us}µs pulse width"
        })
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

def pca9685_continuous_rotation(channel, direction, speed, duration_ms, i2c_address=PCA9685_DEFAULT_ADDRESS):
    """
    Control continuous rotation servo via PCA9685
    
    Args:
        channel: PCA9685 channel (0-15)
        direction: 'cw', 'ccw', or 'stop'
        speed: Speed percentage (0-100)
        duration_ms: Duration in milliseconds
        i2c_address: PCA9685 I2C address
    """
    try:
        if direction not in ['cw', 'ccw', 'stop']:
            raise ValueError(f"Invalid direction: {direction}")
            
        channel = validate_channel(channel)
        speed = max(0, min(100, int(speed)))
        duration_s = max(0.0, int(duration_ms) / 1000.0)
        
        # Initialize PCA9685
        bus = pca9685_init(i2c_address)
        
        # Standard continuous servo range: 1000-2000µs, 1500µs neutral
        neutral = 1500
        min_pulse = 1000
        max_pulse = 2000
        
        if direction == 'stop':
            pulse_us = neutral
        elif direction == 'cw':
            # CW: 1500µs (stop) to 2000µs (full speed CW)
            pulse_us = int(round(neutral + (max_pulse - neutral) * (speed / 100.0)))
        else:  # ccw
            # CCW: 1500µs (stop) to 1000µs (full speed CCW)
            pulse_us = int(round(neutral - (neutral - min_pulse) * (speed / 100.0)))
        
        # Convert microseconds to 0..4095 off-count for 50Hz (20ms period)
        off_value = int((pulse_us / 20000.0) * 4096)
        off_value = max(0, min(4095, off_value))
        
        # Set PWM for the requested pulse width
        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)
        
        log_message({
            "status": "info",
            "message": f"Set continuous servo on channel {channel} to {pulse_us}µs ({direction} at {speed}%)"
        })
        
        # For continuous motion, maintain PWM during duration
        if direction != 'stop' and duration_s > 0:
            time.sleep(duration_s)
            # After duration, stop rotation WITHOUT sending a neutral pulse to avoid recentring
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)  # PWM off
            log_message({
                "status": "info",
                "message": f"Stopped rotation on channel {channel} after duration (PWM off)"
            })
        elif direction == 'stop':
            # For explicit stop, turn off PWM completely (no neutral pulse to avoid drift)
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)
            log_message({
                "status": "info",
                "message": f"Turned off PWM for servo on channel {channel}"
            })
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise
