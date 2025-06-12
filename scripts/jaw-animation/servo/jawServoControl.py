#!/usr/bin/env python3

"""
Jaw Servo Control Script for MonsterBox
Handles servo movement for jaw animation using GPIO or PCA9685
"""

import sys
import time
import argparse
import json
from typing import Optional, Dict, Any

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
    print("Warning: RPi.GPIO not available, running in simulation mode")

try:
    from adafruit_pca9685 import PCA9685
    import board
    import busio
    PCA9685_AVAILABLE = True
except ImportError:
    PCA9685_AVAILABLE = False
    print("Warning: PCA9685 libraries not available")

class JawServoController:
    """Controls jaw servo movement for animatronics"""
    
    def __init__(self, control_type: str = 'gpio', pin: int = 18, channel: int = 0, 
                 servo_type: str = 'Standard', frequency: int = 50):
        self.control_type = control_type.lower()
        self.pin = pin
        self.channel = channel
        self.servo_type = servo_type
        self.frequency = frequency
        self.pwm = None
        self.pca = None
        
        # Servo specifications based on type
        self.servo_specs = {
            'miuzei mg90s': {'min_pulse': 500, 'max_pulse': 2400, 'range': 180},
            'standard': {'min_pulse': 500, 'max_pulse': 2500, 'range': 180},
            'hooyij 40kg ds3240mg': {'min_pulse': 500, 'max_pulse': 2500, 'range': 180},
            'gobilda stingray 2 servo': {'min_pulse': 500, 'max_pulse': 2500, 'range': 180}
        }
        
        self.current_specs = self.servo_specs.get(servo_type.lower(), self.servo_specs['standard'])
        
        self.initialize()
    
    def initialize(self):
        """Initialize the servo controller"""
        try:
            if self.control_type == 'gpio':
                self._initialize_gpio()
            elif self.control_type == 'pca9685':
                self._initialize_pca9685()
            else:
                raise ValueError(f"Unknown control type: {self.control_type}")
                
            print(f"Servo controller initialized: {self.control_type} mode")
            return True
            
        except Exception as e:
            print(f"Error initializing servo controller: {e}")
            return False
    
    def _initialize_gpio(self):
        """Initialize GPIO-based servo control"""
        if not GPIO_AVAILABLE:
            print("GPIO simulation mode - servo commands will be logged only")
            return
            
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.pin, GPIO.OUT)
        self.pwm = GPIO.PWM(self.pin, self.frequency)
        self.pwm.start(0)
    
    def _initialize_pca9685(self):
        """Initialize PCA9685-based servo control"""
        if not PCA9685_AVAILABLE:
            print("PCA9685 simulation mode - servo commands will be logged only")
            return
            
        i2c = busio.I2C(board.SCL, board.SDA)
        self.pca = PCA9685(i2c)
        self.pca.frequency = self.frequency
    
    def angle_to_duty_cycle(self, angle: float) -> float:
        """Convert angle to PWM duty cycle"""
        # Clamp angle to valid range
        angle = max(0, min(self.current_specs['range'], angle))
        
        # Calculate pulse width in microseconds
        pulse_range = self.current_specs['max_pulse'] - self.current_specs['min_pulse']
        pulse_width = self.current_specs['min_pulse'] + (angle / self.current_specs['range']) * pulse_range
        
        # Convert to duty cycle (0-100%)
        period_us = 1000000 / self.frequency  # Period in microseconds
        duty_cycle = (pulse_width / period_us) * 100
        
        return duty_cycle
    
    def angle_to_pca9685_value(self, angle: float) -> int:
        """Convert angle to PCA9685 16-bit value"""
        # Clamp angle to valid range
        angle = max(0, min(self.current_specs['range'], angle))
        
        # Calculate pulse width in microseconds
        pulse_range = self.current_specs['max_pulse'] - self.current_specs['min_pulse']
        pulse_width = self.current_specs['min_pulse'] + (angle / self.current_specs['range']) * pulse_range
        
        # Convert to 16-bit value (0-65535)
        period_us = 1000000 / self.frequency
        value = int((pulse_width / period_us) * 65535)
        
        return value
    
    def move_to_angle(self, angle: float, duration: float = 0.5) -> bool:
        """Move servo to specified angle"""
        try:
            print(f"Moving servo to {angle}° over {duration}s")
            
            if self.control_type == 'gpio':
                return self._move_gpio(angle, duration)
            elif self.control_type == 'pca9685':
                return self._move_pca9685(angle, duration)
            else:
                print(f"Simulation: Would move servo to {angle}°")
                return True
                
        except Exception as e:
            print(f"Error moving servo: {e}")
            return False
    
    def _move_gpio(self, angle: float, duration: float) -> bool:
        """Move servo using GPIO PWM with improved jitter control"""
        if not GPIO_AVAILABLE or not self.pwm:
            print(f"GPIO Simulation: Moving to {angle}°")
            time.sleep(duration)
            return True

        # Check if movement is significant enough (deadband)
        if hasattr(self, 'last_angle') and abs(angle - self.last_angle) < 0.5:
            return True  # Skip micro-movements to reduce jitter

        duty_cycle = self.angle_to_duty_cycle(angle)
        self.pwm.ChangeDutyCycle(duty_cycle)
        time.sleep(duration)

        # Store last angle for deadband comparison
        self.last_angle = angle

        # Only stop PWM if we're at rest position (near min angle)
        if abs(angle - self.min_angle) < 1.0:
            time.sleep(0.1)  # Brief hold time
            self.pwm.ChangeDutyCycle(0)  # Stop sending signal to reduce jitter

        return True
    
    def _move_pca9685(self, angle: float, duration: float) -> bool:
        """Move servo using PCA9685"""
        if not PCA9685_AVAILABLE or not self.pca:
            print(f"PCA9685 Simulation: Moving to {angle}°")
            time.sleep(duration)
            return True
        
        value = self.angle_to_pca9685_value(angle)
        self.pca.channels[self.channel].duty_cycle = value
        time.sleep(duration)
        return True
    
    def test_servo(self) -> bool:
        """Test servo by moving through range of motion"""
        print("Testing servo range of motion...")
        
        test_angles = [0, 45, 90, 135, 180, 90, 0]
        
        for angle in test_angles:
            if not self.move_to_angle(angle, 0.5):
                return False
            time.sleep(0.2)
        
        print("Servo test completed successfully")
        return True
    
    def calibrate(self) -> bool:
        """Calibrate servo by finding min/max positions"""
        print("Calibrating servo...")
        
        # Move to minimum position
        if not self.move_to_angle(0, 1.0):
            return False
        time.sleep(1)
        
        # Move to maximum position
        if not self.move_to_angle(self.current_specs['range'], 1.0):
            return False
        time.sleep(1)
        
        # Return to center
        if not self.move_to_angle(self.current_specs['range'] / 2, 1.0):
            return False
        
        print("Servo calibration completed")
        return True
    
    def cleanup(self):
        """Clean up GPIO resources"""
        try:
            if self.control_type == 'gpio' and GPIO_AVAILABLE:
                if self.pwm:
                    self.pwm.stop()
                GPIO.cleanup()
            elif self.control_type == 'pca9685' and self.pca:
                # Turn off all channels
                for i in range(16):
                    self.pca.channels[i].duty_cycle = 0
            
            print("Servo controller cleanup completed")
            
        except Exception as e:
            print(f"Error during cleanup: {e}")

def main():
    """Main function for command line usage"""
    parser = argparse.ArgumentParser(description='MonsterBox Jaw Servo Control')
    parser.add_argument('command', choices=['test', 'move', 'calibrate'], 
                       help='Command to execute')
    parser.add_argument('control_type', choices=['gpio', 'pca9685'], 
                       help='Control method')
    parser.add_argument('pin_or_channel', type=int, 
                       help='GPIO pin number or PCA9685 channel')
    parser.add_argument('--angle', type=float, default=90, 
                       help='Angle to move to (for move command)')
    parser.add_argument('--duration', type=float, default=0.5, 
                       help='Movement duration in seconds')
    parser.add_argument('--servo-type', default='Standard', 
                       help='Servo type for specifications')
    parser.add_argument('--frequency', type=int, default=50, 
                       help='PWM frequency in Hz')
    
    args = parser.parse_args()
    
    # Create servo controller
    if args.control_type == 'gpio':
        controller = JawServoController(
            control_type='gpio',
            pin=args.pin_or_channel,
            servo_type=args.servo_type,
            frequency=args.frequency
        )
    else:
        controller = JawServoController(
            control_type='pca9685',
            channel=args.pin_or_channel,
            servo_type=args.servo_type,
            frequency=args.frequency
        )
    
    try:
        # Execute command
        if args.command == 'test':
            success = controller.test_servo()
        elif args.command == 'move':
            success = controller.move_to_angle(args.angle, args.duration)
        elif args.command == 'calibrate':
            success = controller.calibrate()
        else:
            print(f"Unknown command: {args.command}")
            success = False
        
        # Output result
        result = {
            'success': success,
            'command': args.command,
            'control_type': args.control_type,
            'pin_or_channel': args.pin_or_channel,
            'angle': args.angle if args.command == 'move' else None,
            'servo_type': args.servo_type
        }
        
        print(json.dumps(result))
        sys.exit(0 if success else 1)
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        controller.cleanup()

if __name__ == '__main__':
    main()
