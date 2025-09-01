#!/usr/bin/env python3

"""
Servo Calibration System for MonsterBox
Supports both standard servos and continuous rotation servos
"""

import json
import time
import os
import sys
from datetime import datetime
import board
import busio
from adafruit_pca9685 import PCA9685

class ServoCalibrator:
    def __init__(self):
        self.calibration_file = "data/servo_calibrations.json"
        self.parts_file = "data/parts.json"
        self.calibrations = self.load_calibrations()
        self.parts = self.load_parts()
        self.pca = None
        self.i2c = None
        
    def load_calibrations(self):
        """Load existing calibrations"""
        if os.path.exists(self.calibration_file):
            with open(self.calibration_file, 'r') as f:
                return json.load(f)
        return {}
    
    def save_calibrations(self):
        """Save calibrations to file"""
        os.makedirs(os.path.dirname(self.calibration_file), exist_ok=True)
        with open(self.calibration_file, 'w') as f:
            json.dump(self.calibrations, f, indent=2)
        print(f"✅ Calibrations saved to {self.calibration_file}")
    
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
            print(f"✅ PCA9685 initialized at address {hex(address)}")
            return True
        except Exception as e:
            print(f"❌ Failed to initialize PCA9685: {e}")
            return False
    
    def cleanup(self):
        """Cleanup PCA9685 resources"""
        if self.pca:
            self.pca.deinit()
            print("✅ PCA9685 cleaned up")
    
    def get_servo_parts(self):
        """Get all servo parts from parts.json"""
        servo_parts = []
        for part in self.parts:
            if part.get('type') == 'servo':
                servo_parts.append(part)
        return servo_parts
    
    def send_pwm_pulse(self, channel, pulse_width_us):
        """Send PWM pulse to servo channel"""
        if not self.pca:
            print("❌ PCA9685 not initialized")
            return False
        
        try:
            # Convert microseconds to duty cycle (0-65535)
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
    
    def calibrate_continuous_servo(self, part):
        """Calibrate a continuous rotation servo"""
        print(f"\n🎯 Calibrating Continuous Rotation Servo: {part['name']}")
        print(f"   Channel: {part['channel']}, Type: {part.get('servoType', 'Unknown')}")
        print("\nFor continuous rotation servos:")
        print("- We'll find the STOP pulse width first")
        print("- Then calibrate rotation speeds and directions")
        print("- Finally map logical positions to timed movements")
        
        channel = part['channel']
        part_id = part['id']
        
        # Initialize calibration data
        calibration = {
            "part_id": part_id,
            "part_name": part['name'],
            "servo_type": "continuous",
            "channel": channel,
            "calibrated_date": datetime.now().isoformat(),
            "stop_pulse_us": 1500,  # Default
            "cw_pulse_us": 1200,    # Default
            "ccw_pulse_us": 1800,   # Default
            "positions": {},
            "timing_data": {}
        }
        
        print(f"\n🔧 Step 1: Finding STOP position")
        print("Testing different pulse widths to find where servo stops...")
        
        # Test different stop positions
        stop_candidates = [1500, 1480, 1520, 1460, 1540]
        for pulse in stop_candidates:
            print(f"   Testing {pulse}µs - Press Enter when servo stops, 's' to skip: ", end='')
            self.send_pwm_pulse(channel, pulse)
            response = input().strip().lower()
            if response != 's':
                calibration["stop_pulse_us"] = pulse
                print(f"   ✅ STOP position set to {pulse}µs")
                break
        
        self.stop_servo(channel)
        time.sleep(1)
        
        return self.calibrate_positions_continuous(part, calibration)
    
    def calibrate_positions_continuous(self, part, calibration):
        """Calibrate logical positions for continuous servo"""
        print(f"\n🎯 Step 2: Calibrating Positions for {part['name']}")
        print("We'll move to each position and record the timing needed")
        
        channel = part['channel']
        stop_pulse = calibration["stop_pulse_us"]
        
        # Define the positions to calibrate
        positions_to_calibrate = [
            ("forward", "0° - Facing directly forward"),
            ("right_90", "90° - Facing right"),
            ("left_90", "-90° - Facing left"),
            ("backward", "180° - Facing backward")
        ]
        
        print(f"\nStarting from STOP position ({stop_pulse}µs)")
        self.send_pwm_pulse(channel, stop_pulse)
        time.sleep(1)
        
        for pos_key, pos_description in positions_to_calibrate:
            print(f"\n📍 Calibrating: {pos_description}")
            print("1. Use 'a' and 'd' to rotate left/right")
            print("2. Use 'w' and 's' to adjust speed")
            print("3. Press 'p' when positioned correctly")
            print("4. Press 'q' to skip this position")
            
            current_pulse = stop_pulse
            speed_offset = 200  # Default speed
            
            while True:
                print(f"   Current pulse: {current_pulse}µs | Commands: a/d (rotate), w/s (speed), p (position set), q (skip): ", end='')
                cmd = input().strip().lower()
                
                if cmd == 'a':  # Rotate left (CCW)
                    current_pulse = stop_pulse + speed_offset
                    self.send_pwm_pulse(channel, current_pulse)
                elif cmd == 'd':  # Rotate right (CW)
                    current_pulse = stop_pulse - speed_offset
                    self.send_pwm_pulse(channel, current_pulse)
                elif cmd == 'w':  # Increase speed
                    speed_offset = min(speed_offset + 50, 500)
                    print(f"   Speed increased to {speed_offset}")
                elif cmd == 's':  # Decrease speed
                    speed_offset = max(speed_offset - 50, 50)
                    print(f"   Speed decreased to {speed_offset}")
                elif cmd == 'p':  # Position set
                    # Stop the servo
                    self.send_pwm_pulse(channel, stop_pulse)
                    time.sleep(0.5)
                    
                    # Record this position
                    print(f"   ✅ Position '{pos_key}' calibrated")
                    calibration["positions"][pos_key] = {
                        "description": pos_description,
                        "calibrated": True
                    }
                    break
                elif cmd == 'q':  # Skip
                    self.send_pwm_pulse(channel, stop_pulse)
                    print(f"   ⏭️  Skipped position '{pos_key}'")
                    calibration["positions"][pos_key] = {
                        "description": pos_description,
                        "calibrated": False
                    }
                    break
                elif cmd == '':  # Stop on empty input
                    self.send_pwm_pulse(channel, stop_pulse)
        
        # Final stop
        self.stop_servo(channel)
        
        # Save calibration
        self.calibrations[str(part['id'])] = calibration
        self.save_calibrations()
        
        print(f"\n🎉 Calibration complete for {part['name']}!")
        return calibration

    def calibrate_standard_servo(self, part):
        """Calibrate a standard positioning servo"""
        print(f"\n🎯 Calibrating Standard Servo: {part['name']}")
        print(f"   Channel: {part['channel']}, Type: {part.get('servoType', 'Unknown')}")

        channel = part['channel']
        part_id = part['id']

        # Initialize calibration data
        calibration = {
            "part_id": part_id,
            "part_name": part['name'],
            "servo_type": "standard",
            "channel": channel,
            "calibrated_date": datetime.now().isoformat(),
            "min_pulse_us": part.get('minPulse', 500),
            "max_pulse_us": part.get('maxPulse', 2500),
            "positions": {}
        }

        # Define positions to calibrate
        positions_to_calibrate = [
            ("min_position", "Minimum position (0°)", calibration["min_pulse_us"]),
            ("center_position", "Center position (90°)", (calibration["min_pulse_us"] + calibration["max_pulse_us"]) // 2),
            ("max_position", "Maximum position (180°)", calibration["max_pulse_us"])
        ]

        for pos_key, pos_description, default_pulse in positions_to_calibrate:
            print(f"\n📍 Calibrating: {pos_description}")
            print("Use +/- to adjust pulse width, 'p' to set position, 'q' to skip")

            current_pulse = default_pulse

            while True:
                self.send_pwm_pulse(channel, current_pulse)
                print(f"   Pulse: {current_pulse}µs | Commands: +/- (adjust), p (set), q (skip): ", end='')
                cmd = input().strip()

                if cmd == '+':
                    current_pulse = min(current_pulse + 50, 3000)
                elif cmd == '-':
                    current_pulse = max(current_pulse - 50, 300)
                elif cmd == 'p':
                    calibration["positions"][pos_key] = {
                        "description": pos_description,
                        "pulse_us": current_pulse,
                        "calibrated": True
                    }
                    print(f"   ✅ Position '{pos_key}' set to {current_pulse}µs")
                    break
                elif cmd == 'q':
                    calibration["positions"][pos_key] = {
                        "description": pos_description,
                        "pulse_us": default_pulse,
                        "calibrated": False
                    }
                    print(f"   ⏭️  Skipped position '{pos_key}'")
                    break

        # Stop servo
        self.stop_servo(channel)

        # Save calibration
        self.calibrations[str(part['id'])] = calibration
        self.save_calibrations()

        print(f"\n🎉 Calibration complete for {part['name']}!")
        return calibration

    def run_calibration_wizard(self):
        """Main calibration wizard"""
        print("🎯 MonsterBox Servo Calibration System")
        print("=====================================")

        # Get all servo parts
        servo_parts = self.get_servo_parts()
        if not servo_parts:
            print("❌ No servo parts found in parts.json")
            return

        print(f"\nFound {len(servo_parts)} servo parts:")
        for i, part in enumerate(servo_parts):
            status = "✅ Calibrated" if str(part['id']) in self.calibrations else "❌ Not calibrated"
            print(f"  {i+1}. {part['name']} (Channel {part['channel']}) - {status}")

        # Initialize PCA9685
        if not self.initialize_pca9685():
            return

        try:
            while True:
                print(f"\n🔧 Select servo to calibrate (1-{len(servo_parts)}) or 'q' to quit: ", end='')
                choice = input().strip()

                if choice.lower() == 'q':
                    break

                try:
                    index = int(choice) - 1
                    if 0 <= index < len(servo_parts):
                        part = servo_parts[index]

                        # Determine servo type
                        servo_type = part.get('servoType', '').lower()
                        if 'continuous' in servo_type or 'stingray' in servo_type:
                            self.calibrate_continuous_servo(part)
                        else:
                            self.calibrate_standard_servo(part)
                    else:
                        print("❌ Invalid selection")
                except ValueError:
                    print("❌ Please enter a number")

        finally:
            self.cleanup()

    def show_calibrations(self):
        """Display all current calibrations"""
        print("\n📊 Current Servo Calibrations")
        print("=============================")

        if not self.calibrations:
            print("No calibrations found.")
            return

        for part_id, cal in self.calibrations.items():
            print(f"\n🔧 {cal['part_name']} (ID: {part_id})")
            print(f"   Type: {cal['servo_type']}")
            print(f"   Channel: {cal['channel']}")
            print(f"   Calibrated: {cal['calibrated_date']}")

            if cal['servo_type'] == 'continuous':
                print(f"   Stop Pulse: {cal['stop_pulse_us']}µs")
                print("   Positions:")
                for pos_key, pos_data in cal['positions'].items():
                    status = "✅" if pos_data['calibrated'] else "❌"
                    print(f"     {status} {pos_key}: {pos_data['description']}")
            else:
                print(f"   Pulse Range: {cal['min_pulse_us']}-{cal['max_pulse_us']}µs")
                print("   Positions:")
                for pos_key, pos_data in cal['positions'].items():
                    status = "✅" if pos_data['calibrated'] else "❌"
                    pulse = pos_data.get('pulse_us', 'N/A')
                    print(f"     {status} {pos_key}: {pos_data['description']} ({pulse}µs)")


def main():
    """Main entry point"""
    calibrator = ServoCalibrator()

    if len(sys.argv) > 1 and sys.argv[1] == 'show':
        calibrator.show_calibrations()
    else:
        calibrator.run_calibration_wizard()


if __name__ == "__main__":
    main()
