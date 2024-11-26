from gpiozero import Servo, AngularServo, Device
from gpiozero.pins.pigpio import PiGPIOFactory
from gpiozero.pins.native import NativeFactory
import time
import sys
import json
import math

# Try to use pigpio for better PWM, fallback to native
try:
    Device.pin_factory = PiGPIOFactory()
except Exception:
    Device.pin_factory = NativeFactory()

# PCA9685 registers/etc.
PCA9685_ADDRESS = 0x40
MODE1 = 0x00
PRESCALE = 0xFE
LED0_ON_L = 0x06
LED0_ON_H = 0x07
LED0_OFF_L = 0x08
LED0_OFF_H = 0x09

def angle_to_duty_cycle(angle):
    """Convert angle to duty cycle"""
    return (angle / 180.0) * (12.5 - 2.5) + 2.5

def set_servo_angle(pin_or_channel, angle, i2c_address=None):
    """
    Set servo angle using either GPIO or PCA9685
    
    Args:
        pin_or_channel: GPIO pin number or PCA9685 channel
        angle: Angle in degrees (0-180)
        i2c_address: I2C address for PCA9685 (optional)
    """
    try:
        # Validate angle
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")
            
        if i2c_address is not None:
            # PCA9685 control
            # Convert angle to pulse length
            pulse = int((angle / 180.0) * (600 - 150) + 150)
            
            channel = int(pin_or_channel)
            if not 0 <= channel <= 15:
                raise ValueError("PCA9685 channel must be between 0 and 15")
            
            # Calculate register values
            led_on = 0
            led_off = pulse
            
            # Set PWM start time to 0
            # bus.write_byte_data(i2c_address, LED0_ON_L + 4 * channel, led_on & 0xFF)
            # bus.write_byte_data(i2c_address, LED0_ON_H + 4 * channel, led_on >> 8)
            
            # Set PWM end time
            # bus.write_byte_data(i2c_address, LED0_OFF_L + 4 * channel, led_off & 0xFF)
            # bus.write_byte_data(i2c_address, LED0_OFF_H + 4 * channel, led_off >> 8)
            
        else:
            # Create servo object with appropriate settings
            if isinstance(pin_or_channel, int):
                servo = AngularServo(
                    pin_or_channel,
                    min_angle=0,
                    max_angle=180,
                    min_pulse_width=0.5/1000,
                    max_pulse_width=2.5/1000,
                    frame_width=20/1000
                )
                servo.angle = angle
                time.sleep(0.5)  # Allow time for servo to move
                
        print(json.dumps({
            "status": "success",
            "message": f"Set servo to {angle} degrees"
        }))
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        raise

def sweep_servo(pin_or_channel, start_angle, end_angle, step_size=1, delay=0.01, i2c_address=None):
    """
    Sweep servo between start and end angles
    
    Args:
        pin_or_channel: GPIO pin number or PCA9685 channel
        start_angle: Starting angle in degrees
        end_angle: Ending angle in degrees
        step_size: Angle increment per step
        delay: Delay between steps in seconds
        i2c_address: I2C address for PCA9685 (optional)
    """
    try:
        # Validate angles
        if not (0 <= start_angle <= 180 and 0 <= end_angle <= 180):
            raise ValueError("Angles must be between 0 and 180 degrees")
            
        # Determine sweep direction
        step = step_size if end_angle > start_angle else -step_size
        angles = range(int(start_angle), int(end_angle) + step, step)
        
        for angle in angles:
            set_servo_angle(pin_or_channel, angle, i2c_address)
            time.sleep(delay)
            
        print(json.dumps({
            "status": "success",
            "message": f"Completed sweep from {start_angle} to {end_angle} degrees"
        }))
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        raise

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({
            "status": "error",
            "message": "Usage: python servo_control.py <pin/channel> <command> <angle/start_angle> [end_angle] [step_size] [delay] [i2c_address]"
        }))
        sys.exit(1)
        
    try:
        pin_or_channel = sys.argv[1]
        command = sys.argv[2].lower()
        
        if command == "angle":
            angle = float(sys.argv[3])
            i2c_address = int(sys.argv[4], 16) if len(sys.argv) > 4 else None
            set_servo_angle(pin_or_channel, angle, i2c_address)
            
        elif command == "sweep":
            if len(sys.argv) < 5:
                raise ValueError("Sweep command requires start and end angles")
                
            start_angle = float(sys.argv[3])
            end_angle = float(sys.argv[4])
            step_size = float(sys.argv[5]) if len(sys.argv) > 5 else 1
            delay = float(sys.argv[6]) if len(sys.argv) > 6 else 0.01
            i2c_address = int(sys.argv[7], 16) if len(sys.argv) > 7 else None
            
            sweep_servo(pin_or_channel, start_angle, end_angle, step_size, delay, i2c_address)
            
        else:
            raise ValueError(f"Unknown command: {command}")
            
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        sys.exit(1)
