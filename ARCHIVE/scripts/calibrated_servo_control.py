#!/usr/bin/env python3

"""
Calibrated Servo Control System for MonsterBox
Uses calibration data to control both standard and continuous rotation servos
"""

import json
import time
import math
import board
import busio
from adafruit_pca9685 import PCA9685

class CalibratedServoController:
    def __init__(self):
        self.calibration_file = "data/servo_calibrations.json"
        self.parts_file = "data/parts.json"
        self.calibrations = self.load_calibrations()
        self.parts = self.load_parts()
        self.pca = None
        self.i2c = None
        
    def load_calibrations(self):
        """Load servo calibrations"""
        try:
            with open(self.calibration_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"⚠️  No calibration file found at {self.calibration_file}")
            print("   Run servo_calibration.py first to calibrate your servos")
            return {}
    
    def load_parts(self):
        """Load parts configuration"""
        with open(self.parts_file, 'r') as f:
            return json.load(f)
    
    def initialize_pca9685(self, address=0x40):
        """Initialize PCA9685 controller"""
        try:
            self.i2c = busio.I2C(board.SCL, board.SDA)
            self.pca = PCA9685(self.i2c, address=address)
            self.pca.frequency = 50
            return True
        except Exception as e:
            print(f"❌ Failed to initialize PCA9685: {e}")
            return False
    
    def cleanup(self):
        """Cleanup PCA9685 resources"""
        if self.pca:
            self.pca.deinit()
    
    def send_pwm_pulse(self, channel, pulse_width_us):
        """Send PWM pulse to servo channel"""
        if not self.pca:
            if not self.initialize_pca9685():
                return False
        
        try:
            duty_cycle = int((pulse_width_us / 20000.0) * 65535)
            self.pca.channels[channel].duty_cycle = duty_cycle
            return True
        except Exception as e:
            print(f"❌ Failed to send PWM: {e}")
            return False
    
    def stop_servo(self, channel):
        """Stop servo by turning off PWM"""
        if self.pca:
            self.pca.channels[channel].duty_cycle = 0
    
    def get_part_by_id(self, part_id):
        """Get part configuration by ID"""
        for part in self.parts:
            if part['id'] == part_id:
                return part
        return None
    
    def move_to_position(self, part_id, position_name, duration=None):
        """Move servo to a named position"""
        # Get calibration data
        calibration = self.calibrations.get(str(part_id))
        if not calibration:
            print(f"❌ No calibration found for part ID {part_id}")
            return False
        
        # Get part configuration
        part = self.get_part_by_id(part_id)
        if not part:
            print(f"❌ Part ID {part_id} not found")
            return False
        
        channel = calibration['channel']
        
        if calibration['servo_type'] == 'continuous':
            return self._move_continuous_to_position(calibration, position_name, duration)
        else:
            return self._move_standard_to_position(calibration, position_name)
    
    def _move_standard_to_position(self, calibration, position_name):
        """Move standard servo to position"""
        positions = calibration.get('positions', {})
        if position_name not in positions:
            print(f"❌ Position '{position_name}' not found in calibration")
            return False
        
        position_data = positions[position_name]
        if not position_data.get('calibrated', False):
            print(f"❌ Position '{position_name}' not calibrated")
            return False
        
        pulse_us = position_data['pulse_us']
        channel = calibration['channel']
        
        print(f"🎯 Moving {calibration['part_name']} to {position_name} ({pulse_us}µs)")
        return self.send_pwm_pulse(channel, pulse_us)
    
    def _move_continuous_to_position(self, calibration, position_name, duration=None):
        """Move continuous rotation servo to position using timed movement"""
        positions = calibration.get('positions', {})
        if position_name not in positions:
            print(f"❌ Position '{position_name}' not found in calibration")
            return False
        
        position_data = positions[position_name]
        if not position_data.get('calibrated', False):
            print(f"❌ Position '{position_name}' not calibrated")
            return False
        
        channel = calibration['channel']
        stop_pulse = calibration['stop_pulse_us']
        
        print(f"🎯 Moving {calibration['part_name']} to {position_name}")
        print("   Note: Continuous servo - you'll need to manually stop or set duration")
        
        # For now, just demonstrate the concept
        # In a real implementation, you'd need timing data from calibration
        if duration:
            print(f"   Rotating for {duration} seconds...")
            # This would need direction and speed from calibration
            self.send_pwm_pulse(channel, stop_pulse - 200)  # Example: rotate CW
            time.sleep(duration)
            self.send_pwm_pulse(channel, stop_pulse)  # Stop
        else:
            print("   Duration not specified - servo will rotate until stopped")
            self.send_pwm_pulse(channel, stop_pulse - 200)  # Example: rotate CW
        
        return True
    
    def move_to_angle(self, part_id, angle_degrees):
        """Move servo to specific angle (for standard servos)"""
        calibration = self.calibrations.get(str(part_id))
        if not calibration:
            print(f"❌ No calibration found for part ID {part_id}")
            return False
        
        if calibration['servo_type'] != 'standard':
            print(f"❌ Angle control not supported for continuous rotation servos")
            print("   Use move_to_position() with named positions instead")
            return False
        
        # Calculate pulse width from angle
        min_pulse = calibration['min_pulse_us']
        max_pulse = calibration['max_pulse_us']
        
        # Clamp angle to 0-180 range
        angle_degrees = max(0, min(180, angle_degrees))
        
        # Linear interpolation
        pulse_us = int(min_pulse + (angle_degrees / 180.0) * (max_pulse - min_pulse))
        
        channel = calibration['channel']
        print(f"🎯 Moving {calibration['part_name']} to {angle_degrees}° ({pulse_us}µs)")
        
        return self.send_pwm_pulse(channel, pulse_us)
    
    def stop_all_servos(self):
        """Stop all servos"""
        print("🛑 Stopping all servos...")
        for part_id, calibration in self.calibrations.items():
            channel = calibration['channel']
            if calibration['servo_type'] == 'continuous':
                # Send stop pulse for continuous servos
                stop_pulse = calibration['stop_pulse_us']
                self.send_pwm_pulse(channel, stop_pulse)
            else:
                # Turn off PWM for standard servos
                self.stop_servo(channel)
        
        time.sleep(0.5)
        print("✅ All servos stopped")
    
    def list_available_positions(self, part_id=None):
        """List available positions for a part or all parts"""
        if part_id:
            calibration = self.calibrations.get(str(part_id))
            if not calibration:
                print(f"❌ No calibration found for part ID {part_id}")
                return
            
            print(f"\n📍 Available positions for {calibration['part_name']}:")
            for pos_name, pos_data in calibration.get('positions', {}).items():
                status = "✅" if pos_data.get('calibrated', False) else "❌"
                print(f"   {status} {pos_name}: {pos_data['description']}")
        else:
            print("\n📍 All Available Positions:")
            for part_id, calibration in self.calibrations.items():
                print(f"\n🔧 {calibration['part_name']} (ID: {part_id}):")
                for pos_name, pos_data in calibration.get('positions', {}).items():
                    status = "✅" if pos_data.get('calibrated', False) else "❌"
                    print(f"   {status} {pos_name}: {pos_data['description']}")


def main():
    """Demo/test function"""
    controller = CalibratedServoController()
    
    print("🎯 Calibrated Servo Control Demo")
    print("=================================")
    
    # List available positions
    controller.list_available_positions()
    
    # Example usage (uncomment to test):
    # controller.move_to_position(29, "forward")  # Move Orlok head to forward position
    # time.sleep(2)
    # controller.move_to_position(29, "right_90")  # Move to right
    # time.sleep(2)
    # controller.stop_all_servos()
    
    controller.cleanup()


if __name__ == "__main__":
    main()
