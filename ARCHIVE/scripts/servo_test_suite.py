#!/usr/bin/env python3
"""
ChatterPi Servo Test Suite
Comprehensive servo testing and calibration for jaw animation
"""

import lgpio
import time
import sys
import json
import argparse
from datetime import datetime

class ServoTester:
    def __init__(self, pin=18, servo_type="MG90S"):
        self.pin = pin
        self.servo_type = servo_type
        self.handle = None
        
        # Servo specifications
        self.servo_specs = {
            "MG90S": {"min_pulse": 500, "max_pulse": 2400, "center": 1500},
            "SG90": {"min_pulse": 500, "max_pulse": 2500, "center": 1500},
            "DS3240MG": {"min_pulse": 500, "max_pulse": 2500, "center": 1500},
            "Hooyij 40kg DS3240MG": {"min_pulse": 500, "max_pulse": 2500, "center": 1500},
            "GoBilda Stingray 2 Servo": {"min_pulse": 500, "max_pulse": 2500, "center": 1500},
            "Miuzei MG90S": {"min_pulse": 500, "max_pulse": 2400, "center": 1500},
            "FITEC FS90R": {"min_pulse": 700, "max_pulse": 2300, "center": 1500}
        }
        
        self.spec = self.servo_specs.get(servo_type, self.servo_specs["MG90S"])
        
    def initialize(self):
        """Initialize GPIO connection"""
        try:
            self.handle = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(self.handle, self.pin)
            print(f"✅ GPIO initialized - Pin {self.pin} ready")
            return True
        except Exception as e:
            print(f"❌ GPIO initialization failed: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO resources"""
        if self.handle is not None:
            try:
                lgpio.tx_servo(self.handle, self.pin, 0)  # Stop servo
                lgpio.gpio_free(self.handle, self.pin)
                lgpio.gpiochip_close(self.handle)
                print("✅ GPIO cleaned up")
            except Exception as e:
                print(f"⚠️ Cleanup warning: {e}")
    
    def angle_to_pulse(self, angle):
        """Convert angle (0-180) to pulse width (microseconds)"""
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")
        
        pulse_range = self.spec["max_pulse"] - self.spec["min_pulse"]
        pulse_width = int((angle / 180.0) * pulse_range + self.spec["min_pulse"])
        return pulse_width
    
    def move_to_angle(self, angle, duration=1.0):
        """Move servo to specific angle"""
        try:
            pulse_width = self.angle_to_pulse(angle)
            print(f"🎯 Moving to {angle}° (pulse: {pulse_width}µs)")
            
            result = lgpio.tx_servo(self.handle, self.pin, pulse_width, 50, 0, 1)
            if result < 0:
                print(f"❌ Servo command failed with code: {result}")
                return False
            
            time.sleep(duration)
            return True
            
        except Exception as e:
            print(f"❌ Move failed: {e}")
            return False
    
    def test_basic_movement(self):
        """Test basic servo movement"""
        print("\n🔧 Testing Basic Movement...")
        
        test_angles = [90, 0, 180, 90]  # Center, min, max, center
        
        for angle in test_angles:
            if not self.move_to_angle(angle, 2.0):
                return False
            print(f"✅ Successfully moved to {angle}°")
        
        return True
    
    def test_jaw_range(self):
        """Test jaw-specific movement range"""
        print("\n🦴 Testing Jaw Movement Range...")
        
        # Jaw-specific angles (closed to open)
        jaw_angles = [10, 25, 45, 25, 10]  # Closed, slightly open, wide open, back
        
        for angle in jaw_angles:
            if not self.move_to_angle(angle, 1.5):
                return False
            print(f"✅ Jaw position: {angle}°")
        
        return True
    
    def test_smooth_sweep(self):
        """Test smooth sweeping motion"""
        print("\n🌊 Testing Smooth Sweep...")
        
        start_angle = 10
        end_angle = 45
        steps = 10
        
        for i in range(steps + 1):
            angle = start_angle + (end_angle - start_angle) * (i / steps)
            if not self.move_to_angle(angle, 0.3):
                return False
        
        # Return to start
        self.move_to_angle(start_angle, 1.0)
        print("✅ Smooth sweep completed")
        return True
    
    def calibrate_range(self):
        """Interactive calibration of servo range"""
        print("\n⚙️ Starting Interactive Calibration...")
        print("This will help determine the optimal jaw movement range")
        
        # Find minimum safe position
        print("\nFinding minimum position (jaw closed)...")
        for angle in range(0, 30, 5):
            self.move_to_angle(angle, 1.0)
            response = input(f"Angle {angle}° - Is this safe? (y/n/stop): ").lower()
            if response == 'stop':
                break
            elif response == 'y':
                min_angle = angle
                print(f"✅ Minimum angle set to {min_angle}°")
                break
        
        # Find maximum safe position
        print("\nFinding maximum position (jaw open)...")
        for angle in range(30, 90, 10):
            self.move_to_angle(angle, 1.0)
            response = input(f"Angle {angle}° - Is this safe? (y/n/stop): ").lower()
            if response == 'stop':
                break
            elif response == 'y':
                max_angle = angle
                print(f"✅ Maximum angle set to {max_angle}°")
        
        return {"min_angle": min_angle, "max_angle": max_angle}
    
    def run_full_test_suite(self):
        """Run complete test suite"""
        print(f"🚀 Starting Servo Test Suite for {self.servo_type} on pin {self.pin}")
        print("=" * 60)
        
        if not self.initialize():
            return False
        
        try:
            # Run all tests
            tests = [
                ("Basic Movement", self.test_basic_movement),
                ("Jaw Range", self.test_jaw_range),
                ("Smooth Sweep", self.test_smooth_sweep)
            ]
            
            results = {}
            for test_name, test_func in tests:
                print(f"\n📋 Running {test_name} test...")
                results[test_name] = test_func()
                
                if results[test_name]:
                    print(f"✅ {test_name} test PASSED")
                else:
                    print(f"❌ {test_name} test FAILED")
            
            # Summary
            print("\n" + "=" * 60)
            print("📊 TEST SUMMARY")
            print("=" * 60)
            
            passed = sum(results.values())
            total = len(results)
            
            for test_name, result in results.items():
                status = "✅ PASS" if result else "❌ FAIL"
                print(f"{test_name}: {status}")
            
            print(f"\nOverall: {passed}/{total} tests passed")
            
            if passed == total:
                print("🎉 All tests PASSED! Servo is ready for jaw animation.")
            else:
                print("⚠️ Some tests FAILED. Check hardware connections.")
            
            return passed == total
            
        finally:
            self.cleanup()

def main():
    parser = argparse.ArgumentParser(description="ChatterPi Servo Test Suite")
    parser.add_argument("--pin", type=int, default=18, help="GPIO pin number")
    parser.add_argument("--servo", default="MG90S", help="Servo type")
    parser.add_argument("--angle", type=float, help="Test specific angle")
    parser.add_argument("--calibrate", action="store_true", help="Run calibration")
    
    args = parser.parse_args()
    
    tester = ServoTester(pin=args.pin, servo_type=args.servo)
    
    if args.angle is not None:
        # Test specific angle
        if tester.initialize():
            tester.move_to_angle(args.angle, 2.0)
            tester.cleanup()
    elif args.calibrate:
        # Run calibration
        if tester.initialize():
            results = tester.calibrate_range()
            print(f"\n📋 Calibration Results: {results}")
            tester.cleanup()
    else:
        # Run full test suite
        tester.run_full_test_suite()

if __name__ == "__main__":
    main()
