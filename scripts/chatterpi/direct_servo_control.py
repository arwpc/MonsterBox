#!/usr/bin/env python3
"""
Direct Servo Control for ChatterPi
Simple, reliable servo control using lgpio - based on working WebSocket implementation
"""

import sys
import time
import json

try:
    import lgpio
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
    print("Warning: lgpio not available, running in simulation mode")

class DirectServoControl:
    """Direct servo control using lgpio - simplified from working WebSocket version"""
    
    def __init__(self, pin=18, servo_type="Miuzei MG90S"):
        self.pin = pin
        self.servo_type = servo_type
        self.gpio_handle = None
        
        # Servo specifications (from working WebSocket code)
        self.servo_specs = {
            'miuzei mg90s': {'min_pulse': 500, 'max_pulse': 2400, 'range': 180},
            'standard': {'min_pulse': 500, 'max_pulse': 2500, 'range': 180}
        }
        
        self.specs = self.servo_specs.get(servo_type.lower(), self.servo_specs['standard'])
        self.min_pulse = self.specs['min_pulse']
        self.max_pulse = self.specs['max_pulse']
        
        self.initialize()
    
    def initialize(self):
        """Initialize GPIO"""
        if GPIO_AVAILABLE:
            try:
                self.gpio_handle = lgpio.gpiochip_open(0)
                lgpio.gpio_claim_output(self.gpio_handle, self.pin)
                print(f"✅ GPIO initialized for pin {self.pin}")
                return True
            except Exception as e:
                print(f"❌ GPIO initialization failed: {e}")
                return False
        else:
            print(f"🔧 Simulation mode - GPIO pin {self.pin}")
            return True
    
    def angle_to_pulse_width(self, angle):
        """Convert angle to pulse width (from working WebSocket code)"""
        # Clamp angle to valid range
        angle = max(0, min(180, angle))
        
        # Linear interpolation between min and max pulse
        pulse_width = int((angle / 180.0) * (self.max_pulse - self.min_pulse) + self.min_pulse)
        return pulse_width
    
    def move_to_angle(self, angle, duration=0.5):
        """Move servo to specified angle (from working WebSocket code)"""
        try:
            print(f"🦴 Moving servo to {angle}° over {duration}s")

            if GPIO_AVAILABLE and self.gpio_handle:
                pulse_width = self.angle_to_pulse_width(angle)

                # Validate pulse width range for lgpio (must be 0-40000 microseconds)
                if pulse_width < 0 or pulse_width > 40000:
                    print(f"❌ Invalid pulse width: {pulse_width}µs (must be 0-40000)")
                    return False

                print(f"🔧 Using pulse width: {pulse_width}µs for {angle}°")

                # Use lgpio's servo function with proper error handling
                result = lgpio.tx_servo(self.gpio_handle, self.pin, pulse_width, 50, 0, 1)
                if result < 0:
                    print(f"❌ lgpio.tx_servo failed with code: {result}")
                    return False

                # Allow time for servo to move
                time.sleep(duration)

                # Stop servo signal to reduce jitter (from working code)
                lgpio.tx_servo(self.gpio_handle, self.pin, 0)

                print(f"✅ Servo moved to {angle}° (pulse: {pulse_width}µs)")
                return True
            else:
                print(f"🔧 Simulation: Would move servo to {angle}°")
                time.sleep(duration)
                return True

        except Exception as e:
            print(f"❌ Error moving servo: {e}")
            return False
    
    def animate_sequence(self, animation_data):
        """Animate a sequence of movements"""
        try:
            for frame in animation_data:
                if 'angle' in frame:
                    angle = frame['angle']
                    duration = frame.get('duration', 0.2)
                    delay = frame.get('delay', 0)
                    
                    # Wait for delay
                    if delay > 0:
                        time.sleep(delay)
                    
                    # Move servo
                    self.move_to_angle(angle, duration)
            
            return True
        except Exception as e:
            print(f"❌ Error in animation sequence: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO resources"""
        if GPIO_AVAILABLE and self.gpio_handle:
            try:
                lgpio.gpio_free(self.gpio_handle, self.pin)
                lgpio.gpiochip_close(self.gpio_handle)
                print(f"✅ GPIO cleanup completed for pin {self.pin}")
            except Exception as e:
                print(f"⚠️ GPIO cleanup error: {e}")

def main():
    """Command line interface"""
    if len(sys.argv) < 2:
        print("Usage: python3 direct_servo_control.py <command> [args...]")
        print("Commands:")
        print("  move <angle> [duration] - Move to angle")
        print("  animate <json_file> - Animate from JSON file")
        print("  test - Test movement sequence")
        return
    
    command = sys.argv[1].lower()
    servo = DirectServoControl()
    
    try:
        if command == 'move':
            if len(sys.argv) < 3:
                print("Usage: move <angle> [duration]")
                return
            
            angle = float(sys.argv[2])
            duration = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
            servo.move_to_angle(angle, duration)
            
        elif command == 'animate':
            if len(sys.argv) < 3:
                print("Usage: animate <json_data>")
                return
            
            # Parse JSON animation data
            animation_data = json.loads(sys.argv[2])
            servo.animate_sequence(animation_data)
            
        elif command == 'test':
            print("🧪 Testing servo movement...")
            # Test sequence: closed (70°) -> open (30°) -> closed (70°)
            test_sequence = [
                {'angle': 70, 'duration': 1.0, 'delay': 0},
                {'angle': 30, 'duration': 1.0, 'delay': 0.5},
                {'angle': 70, 'duration': 1.0, 'delay': 0.5}
            ]
            servo.animate_sequence(test_sequence)
            
        else:
            print(f"Unknown command: {command}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        servo.cleanup()

if __name__ == "__main__":
    main()
