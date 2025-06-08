#!/usr/bin/env python3
"""
Jaw Animation Calibration for ChatterPi
Determines optimal jaw movement range and parameters
"""

import lgpio
import time
import json
import sys

class JawCalibrator:
    def __init__(self, pin=18):
        self.pin = pin
        self.handle = None
        self.calibration_data = {
            "pin": pin,
            "servo_type": "MG90S",
            "min_pulse": 500,
            "max_pulse": 2400,
            "jaw_closed_angle": None,
            "jaw_open_angle": None,
            "safe_range": None,
            "optimal_settings": None
        }
    
    def initialize(self):
        """Initialize GPIO"""
        try:
            self.handle = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(self.handle, self.pin)
            print(f"✅ GPIO initialized on pin {self.pin}")
            return True
        except Exception as e:
            print(f"❌ GPIO initialization failed: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO"""
        if self.handle is not None:
            try:
                lgpio.gpio_free(self.handle, self.pin)
                lgpio.gpiochip_close(self.handle)
                print("✅ GPIO cleaned up")
            except Exception as e:
                print(f"⚠️ Cleanup warning: {e}")
    
    def angle_to_pulse(self, angle):
        """Convert angle to pulse width"""
        pulse_range = self.calibration_data["max_pulse"] - self.calibration_data["min_pulse"]
        return int((angle / 180.0) * pulse_range + self.calibration_data["min_pulse"])
    
    def move_to_angle(self, angle, duration=1.0):
        """Move servo to angle"""
        try:
            pulse_width = self.angle_to_pulse(angle)
            result = lgpio.tx_servo(self.handle, self.pin, pulse_width, 50, 0, 1)
            if result < 0:
                print(f"❌ Servo command failed: {result}")
                return False
            time.sleep(duration)
            return True
        except Exception as e:
            print(f"❌ Move failed: {e}")
            return False
    
    def test_jaw_range(self):
        """Test and determine optimal jaw movement range"""
        print("\n🦴 Jaw Range Calibration")
        print("=" * 40)
        
        # Test different jaw positions
        jaw_positions = [
            (0, "Fully closed (0°)"),
            (10, "Slightly open (10°)"),
            (20, "Quarter open (20°)"),
            (30, "Half open (30°)"),
            (45, "Three-quarter open (45°)"),
            (60, "Wide open (60°)"),
            (90, "Maximum open (90°)")
        ]
        
        print("Testing jaw positions...")
        safe_positions = []
        
        for angle, description in jaw_positions:
            print(f"\n📍 Testing: {description}")
            if self.move_to_angle(angle, 2.0):
                print(f"✅ Position {angle}° - SAFE")
                safe_positions.append(angle)
            else:
                print(f"❌ Position {angle}° - FAILED")
                break
        
        if safe_positions:
            self.calibration_data["jaw_closed_angle"] = min(safe_positions)
            self.calibration_data["jaw_open_angle"] = max(safe_positions)
            self.calibration_data["safe_range"] = safe_positions
            
            print(f"\n✅ Safe jaw range: {min(safe_positions)}° to {max(safe_positions)}°")
            return True
        else:
            print("\n❌ No safe positions found!")
            return False
    
    def test_jaw_animation_sequence(self):
        """Test realistic jaw animation sequence"""
        print("\n🎭 Testing Jaw Animation Sequence")
        print("=" * 40)
        
        if not self.calibration_data["safe_range"]:
            print("❌ No safe range defined. Run range calibration first.")
            return False
        
        # Create realistic talking animation
        closed = self.calibration_data["jaw_closed_angle"]
        open_max = min(45, self.calibration_data["jaw_open_angle"])  # Limit to 45° for realism
        
        # Simulate talking pattern: closed -> open -> closed -> open -> closed
        talking_sequence = [
            (closed, 0.3, "Closed"),
            (open_max, 0.2, "Open"),
            (closed, 0.3, "Closed"),
            (open_max * 0.7, 0.2, "Partial open"),
            (closed, 0.3, "Closed"),
            (open_max, 0.2, "Open"),
            (closed, 0.5, "Rest")
        ]
        
        print("Simulating talking animation...")
        for angle, duration, description in talking_sequence:
            print(f"  {description}: {angle}°")
            if not self.move_to_angle(angle, duration):
                return False
        
        print("✅ Jaw animation sequence completed successfully!")
        return True
    
    def optimize_settings(self):
        """Determine optimal settings for jaw animation"""
        print("\n⚙️ Optimizing Settings")
        print("=" * 40)
        
        if not self.calibration_data["safe_range"]:
            print("❌ No safe range defined.")
            return False
        
        # Determine optimal settings based on safe range
        closed = self.calibration_data["jaw_closed_angle"]
        open_max = self.calibration_data["jaw_open_angle"]
        
        # For realistic jaw animation, limit opening to 45° max
        optimal_open = min(45, open_max)
        
        self.calibration_data["optimal_settings"] = {
            "jaw_closed": closed,
            "jaw_open": optimal_open,
            "animation_range": optimal_open - closed,
            "recommended_frequency": 50,  # Hz
            "smooth_transitions": True,
            "volume_sensitivity": 1.0,
            "response_curve": "linear"
        }
        
        print(f"✅ Optimal jaw closed position: {closed}°")
        print(f"✅ Optimal jaw open position: {optimal_open}°")
        print(f"✅ Animation range: {optimal_open - closed}°")
        
        return True
    
    def save_calibration(self, filename="jaw_calibration.json"):
        """Save calibration data to file"""
        try:
            with open(filename, 'w') as f:
                json.dump(self.calibration_data, f, indent=2)
            print(f"✅ Calibration saved to {filename}")
            return True
        except Exception as e:
            print(f"❌ Failed to save calibration: {e}")
            return False
    
    def run_full_calibration(self):
        """Run complete calibration process"""
        print("🚀 Starting Jaw Animation Calibration")
        print("=" * 50)
        
        if not self.initialize():
            return False
        
        try:
            # Step 1: Test range
            if not self.test_jaw_range():
                return False
            
            # Step 2: Test animation sequence
            if not self.test_jaw_animation_sequence():
                return False
            
            # Step 3: Optimize settings
            if not self.optimize_settings():
                return False
            
            # Step 4: Save results
            if not self.save_calibration():
                return False
            
            print("\n" + "=" * 50)
            print("🎉 JAW CALIBRATION COMPLETED SUCCESSFULLY!")
            print("=" * 50)
            print(f"📊 Results:")
            print(f"   Jaw closed: {self.calibration_data['optimal_settings']['jaw_closed']}°")
            print(f"   Jaw open: {self.calibration_data['optimal_settings']['jaw_open']}°")
            print(f"   Range: {self.calibration_data['optimal_settings']['animation_range']}°")
            print(f"   Servo ready for jaw animation! 🦴")
            
            return True
            
        finally:
            self.cleanup()

def main():
    pin = int(sys.argv[1]) if len(sys.argv) > 1 else 18
    calibrator = JawCalibrator(pin)
    success = calibrator.run_full_calibration()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
