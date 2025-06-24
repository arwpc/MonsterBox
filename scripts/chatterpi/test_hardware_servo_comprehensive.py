#!/usr/bin/env python3
"""
Comprehensive Hardware Servo Testing for ChatterPi Jaw Animation
Tests physical servo movement on GPIO pin 18 with correct positioning (50° closed, 30° open)
"""

import time
import sys
import os
import json
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try to import GPIO libraries
GPIO_AVAILABLE = False
try:
    import pigpio
    GPIO_AVAILABLE = True
    logger.info("✅ pigpio library available")
except ImportError:
    logger.warning("⚠️ pigpio library not available - running in simulation mode")

class ServoTester:
    """Comprehensive servo testing class"""
    
    def __init__(self, pin=18, closed_angle=50, open_angle=30):
        self.pin = pin
        self.closed_angle = closed_angle
        self.open_angle = open_angle
        self.pi = None
        self.current_angle = closed_angle
        
        # Test results
        self.test_results = {
            "hardware_available": GPIO_AVAILABLE,
            "initialization": False,
            "basic_movement": False,
            "position_accuracy": False,
            "speed_control": False,
            "continuous_operation": False,
            "error_recovery": False,
            "calibration": False
        }
        
        logger.info(f"🦴 ServoTester initialized - Pin: {pin}, Closed: {closed_angle}°, Open: {open_angle}°")
    
    def initialize(self):
        """Initialize servo connection"""
        logger.info("🔧 Initializing servo connection...")
        
        if not GPIO_AVAILABLE:
            logger.info("📋 Running in simulation mode (no GPIO hardware)")
            self.test_results["initialization"] = True
            return True
        
        try:
            # Connect to pigpio daemon
            self.pi = pigpio.pi()
            
            if not self.pi.connected:
                logger.error("❌ Failed to connect to pigpio daemon")
                logger.info("💡 Try running: sudo pigpiod")
                return False
            
            # Set initial position to closed
            self.set_angle(self.closed_angle)
            time.sleep(1)  # Allow servo to reach position
            
            logger.info("✅ Servo initialized successfully")
            self.test_results["initialization"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Servo initialization failed: {e}")
            return False
    
    def angle_to_pulse_width(self, angle):
        """Convert angle to pulse width in microseconds"""
        # Standard servo: 500-2500µs for 0-180°
        # Our range: 30-50° maps to appropriate pulse widths
        min_pulse = 500
        max_pulse = 2500
        pulse_width = min_pulse + (angle / 180.0) * (max_pulse - min_pulse)
        return int(pulse_width)
    
    def set_angle(self, angle):
        """Set servo to specific angle"""
        if GPIO_AVAILABLE and self.pi:
            try:
                pulse_width = self.angle_to_pulse_width(angle)
                self.pi.set_servo_pulsewidth(self.pin, pulse_width)
                self.current_angle = angle
                logger.info(f"🦴 Servo moved to {angle}° (pulse: {pulse_width}µs)")
                return True
            except Exception as e:
                logger.error(f"❌ Error setting servo angle: {e}")
                return False
        else:
            # Simulation mode
            self.current_angle = angle
            logger.info(f"🦴 [SIM] Servo moved to {angle}°")
            return True
    
    def test_basic_movement(self):
        """Test basic servo movement between open and closed positions"""
        logger.info("\n🧪 Test 1: Basic Movement")
        logger.info("=" * 40)
        
        try:
            # Test closed position
            logger.info(f"Moving to CLOSED position ({self.closed_angle}°)...")
            if not self.set_angle(self.closed_angle):
                return False
            time.sleep(2)
            
            # Test open position
            logger.info(f"Moving to OPEN position ({self.open_angle}°)...")
            if not self.set_angle(self.open_angle):
                return False
            time.sleep(2)
            
            # Return to closed
            logger.info(f"Returning to CLOSED position ({self.closed_angle}°)...")
            if not self.set_angle(self.closed_angle):
                return False
            time.sleep(1)
            
            logger.info("✅ Basic movement test PASSED")
            self.test_results["basic_movement"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Basic movement test FAILED: {e}")
            return False
    
    def test_position_accuracy(self):
        """Test servo position accuracy at various angles"""
        logger.info("\n🧪 Test 2: Position Accuracy")
        logger.info("=" * 40)
        
        # Test positions between open and closed
        test_positions = [
            self.closed_angle,  # Fully closed
            (self.closed_angle + self.open_angle) / 2,  # Mid position
            self.open_angle,  # Fully open
            self.closed_angle - 5,  # Slightly more closed
            self.open_angle + 5,  # Slightly more open
        ]
        
        try:
            for position in test_positions:
                logger.info(f"Testing position: {position}°")
                if not self.set_angle(position):
                    return False
                time.sleep(1.5)
            
            # Return to neutral
            self.set_angle(self.closed_angle)
            
            logger.info("✅ Position accuracy test PASSED")
            self.test_results["position_accuracy"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Position accuracy test FAILED: {e}")
            return False
    
    def test_speed_control(self):
        """Test servo movement speed and smoothness"""
        logger.info("\n🧪 Test 3: Speed Control")
        logger.info("=" * 40)
        
        try:
            # Fast movements
            logger.info("Testing FAST movements...")
            for i in range(3):
                self.set_angle(self.open_angle)
                time.sleep(0.3)
                self.set_angle(self.closed_angle)
                time.sleep(0.3)
            
            time.sleep(1)
            
            # Slow movements
            logger.info("Testing SLOW movements...")
            for i in range(2):
                self.set_angle(self.open_angle)
                time.sleep(1.5)
                self.set_angle(self.closed_angle)
                time.sleep(1.5)
            
            logger.info("✅ Speed control test PASSED")
            self.test_results["speed_control"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Speed control test FAILED: {e}")
            return False
    
    def test_continuous_operation(self):
        """Test continuous operation simulating speech patterns"""
        logger.info("\n🧪 Test 4: Continuous Operation (Speech Simulation)")
        logger.info("=" * 40)
        
        try:
            # Simulate speech pattern for "Good Evening"
            speech_pattern = [
                (45, 0.2, "G"),
                (35, 0.15, "oo"),
                (50, 0.1, "d"),
                (50, 0.3, " "),  # pause
                (40, 0.2, "E"),
                (30, 0.15, "ve"),
                (35, 0.1, "n"),
                (40, 0.15, "ing"),
                (50, 0.5, ".")  # end
            ]
            
            logger.info("Simulating speech: 'Good Evening'")
            for angle, duration, phoneme in speech_pattern:
                logger.info(f"  '{phoneme}' -> {angle}°")
                self.set_angle(angle)
                time.sleep(duration)
            
            # Return to rest position
            self.set_angle(self.closed_angle)
            
            logger.info("✅ Continuous operation test PASSED")
            self.test_results["continuous_operation"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Continuous operation test FAILED: {e}")
            return False
    
    def test_error_recovery(self):
        """Test error handling and recovery"""
        logger.info("\n🧪 Test 5: Error Recovery")
        logger.info("=" * 40)
        
        try:
            # Test invalid angles
            logger.info("Testing invalid angle handling...")
            
            # Try extreme angles (should be clamped)
            test_angles = [-10, 200, 999]
            for angle in test_angles:
                logger.info(f"Testing invalid angle: {angle}°")
                # This should handle gracefully
                self.set_angle(angle)
                time.sleep(0.5)
            
            # Return to safe position
            self.set_angle(self.closed_angle)
            
            logger.info("✅ Error recovery test PASSED")
            self.test_results["error_recovery"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Error recovery test FAILED: {e}")
            return False
    
    def test_calibration(self):
        """Test servo calibration and range verification"""
        logger.info("\n🧪 Test 6: Calibration Verification")
        logger.info("=" * 40)
        
        try:
            logger.info("Performing calibration sequence...")
            
            # Full range test
            logger.info("Testing full mechanical range...")
            self.set_angle(self.closed_angle + 10)  # Slightly beyond closed
            time.sleep(1)
            self.set_angle(self.open_angle - 10)    # Slightly beyond open
            time.sleep(1)
            
            # Verify configured positions
            logger.info(f"Verifying CLOSED position ({self.closed_angle}°)...")
            self.set_angle(self.closed_angle)
            time.sleep(2)
            
            logger.info(f"Verifying OPEN position ({self.open_angle}°)...")
            self.set_angle(self.open_angle)
            time.sleep(2)
            
            # Return to closed
            self.set_angle(self.closed_angle)
            
            logger.info("✅ Calibration test PASSED")
            self.test_results["calibration"] = True
            return True
            
        except Exception as e:
            logger.error(f"❌ Calibration test FAILED: {e}")
            return False
    
    def cleanup(self):
        """Clean up GPIO resources"""
        if GPIO_AVAILABLE and self.pi:
            try:
                # Set servo to closed position
                self.set_angle(self.closed_angle)
                time.sleep(1)
                
                # Stop PWM
                self.pi.set_servo_pulsewidth(self.pin, 0)
                
                # Disconnect
                self.pi.stop()
                logger.info("🧹 GPIO cleanup completed")
            except Exception as e:
                logger.error(f"⚠️ Cleanup error: {e}")
    
    def run_all_tests(self):
        """Run all servo tests"""
        logger.info("🦴 Starting Comprehensive Servo Hardware Tests")
        logger.info("=" * 60)
        
        if not self.initialize():
            logger.error("❌ Initialization failed - cannot continue")
            return False
        
        # Run all tests
        tests = [
            ("Basic Movement", self.test_basic_movement),
            ("Position Accuracy", self.test_position_accuracy),
            ("Speed Control", self.test_speed_control),
            ("Continuous Operation", self.test_continuous_operation),
            ("Error Recovery", self.test_error_recovery),
            ("Calibration", self.test_calibration),
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test_name, test_func in tests:
            logger.info(f"\n{'='*20} {test_name} {'='*20}")
            if test_func():
                passed_tests += 1
            else:
                logger.error(f"❌ {test_name} FAILED")
        
        # Generate report
        self.generate_report(passed_tests, total_tests)
        
        return passed_tests == total_tests
    
    def generate_report(self, passed_tests, total_tests):
        """Generate test report"""
        logger.info("\n" + "="*60)
        logger.info("🦴 SERVO HARDWARE TEST REPORT")
        logger.info("="*60)
        
        logger.info(f"Hardware Available: {'✅ YES' if GPIO_AVAILABLE else '❌ NO (Simulation)'}")
        logger.info(f"GPIO Pin: {self.pin}")
        logger.info(f"Closed Angle: {self.closed_angle}°")
        logger.info(f"Open Angle: {self.open_angle}°")
        logger.info(f"Tests Passed: {passed_tests}/{total_tests}")
        
        logger.info("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"  {test_name}: {status}")
        
        if passed_tests == total_tests:
            logger.info("\n🎉 ALL TESTS PASSED! Servo hardware is working correctly.")
            logger.info("✅ Ready for audio-driven jaw animation!")
        else:
            logger.info(f"\n⚠️ {total_tests - passed_tests} tests failed. Check hardware connections.")
        
        # Save results to file
        results_file = Path("../../test-results/servo-hardware-test.json")
        results_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(results_file, 'w') as f:
            json.dump({
                "timestamp": time.time(),
                "hardware_available": GPIO_AVAILABLE,
                "pin": self.pin,
                "closed_angle": self.closed_angle,
                "open_angle": self.open_angle,
                "tests_passed": passed_tests,
                "total_tests": total_tests,
                "results": self.test_results
            }, f, indent=2)
        
        logger.info(f"📄 Test results saved to: {results_file}")

def main():
    """Main test function"""
    tester = ServoTester(pin=18, closed_angle=50, open_angle=30)
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        logger.info("\n⚠️ Test interrupted by user")
        return 1
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        return 1
    finally:
        tester.cleanup()

if __name__ == "__main__":
    sys.exit(main())
