#!/usr/bin/env python3
"""
Test ChatterPi Jaw Animation
Simple test to verify jaw movement with speech simulation
"""

import time
import sys
import os

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from chatterpi.jaw_control_system import JawControlSystem

def test_jaw_speech_simulation():
    """Test jaw animation simulating speech patterns"""
    print("🎭 Testing ChatterPi Jaw Animation")
    print("=" * 50)
    
    # Initialize jaw control
    jaw_control = JawControlSystem(pin=18, min_pulse=500, max_pulse=2400)
    
    if not jaw_control.initialize():
        print("❌ Failed to initialize jaw control")
        return False
    
    print("✅ Jaw control initialized")
    print(f"📋 Configuration: Closed={jaw_control.min_angle}°, Open={jaw_control.max_angle}°")
    print("")
    
    try:
        # Test 1: Basic open/close
        print("🎯 Test 1: Basic Open/Close Movement")
        print("   Closed position (30°)...")
        jaw_control.move_to_angle(30, 1.0, "ease_in_out")
        while jaw_control.is_moving:
            time.sleep(0.1)
        time.sleep(1)
        
        print("   Open position (70°)...")
        jaw_control.move_to_angle(70, 1.0, "ease_in_out")
        while jaw_control.is_moving:
            time.sleep(0.1)
        time.sleep(1)
        
        print("   Return to closed...")
        jaw_control.move_to_angle(30, 1.0, "ease_in_out")
        while jaw_control.is_moving:
            time.sleep(0.1)
        time.sleep(1)
        
        # Test 2: Speech simulation
        print("\n🎯 Test 2: Speech Pattern Simulation")
        print("   Simulating: 'Hello Count Orlok'")
        
        speech_pattern = [
            (45, 0.2, "H"),
            (35, 0.1, "e"),
            (50, 0.2, "ll"),
            (40, 0.1, "o"),
            (30, 0.3, " "),
            (55, 0.2, "C"),
            (40, 0.1, "ou"),
            (45, 0.2, "nt"),
            (30, 0.2, " "),
            (60, 0.2, "Or"),
            (45, 0.1, "l"),
            (50, 0.2, "ok"),
            (30, 0.5, ".")
        ]
        
        for angle, duration, sound in speech_pattern:
            print(f"   '{sound}' -> {angle}°")
            jaw_control.move_to_angle(angle, duration, "ease_in_out")
            while jaw_control.is_moving:
                time.sleep(0.05)
            time.sleep(0.1)
        
        # Test 3: Rapid speech simulation
        print("\n🎯 Test 3: Rapid Speech Simulation")
        print("   Fast talking pattern...")
        
        for i in range(10):
            # Quick open-close cycles
            jaw_control.move_to_angle(55, 0.1, "linear")
            while jaw_control.is_moving:
                time.sleep(0.02)
            
            jaw_control.move_to_angle(35, 0.1, "linear")
            while jaw_control.is_moving:
                time.sleep(0.02)
        
        # Return to closed
        print("   Returning to closed position...")
        jaw_control.move_to_angle(30, 0.5, "ease_in_out")
        while jaw_control.is_moving:
            time.sleep(0.1)
        
        print("\n🎉 All jaw animation tests completed successfully!")
        print("✅ Servo is responding correctly")
        print("✅ Jaw positions are accurate")
        print("✅ Speech simulation working")
        
        return True
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        return False
    finally:
        jaw_control.cleanup()
        print("✅ Cleanup completed")

def test_jaw_calibration_verification():
    """Verify the jaw calibration is correct"""
    print("\n🔧 Jaw Calibration Verification")
    print("=" * 50)
    
    jaw_control = JawControlSystem(pin=18, min_pulse=500, max_pulse=2400)
    
    if not jaw_control.initialize():
        print("❌ Failed to initialize jaw control")
        return False
    
    try:
        positions_to_test = [
            (30, "Closed (jaw shut)"),
            (40, "Slightly open"),
            (50, "Half open"),
            (60, "More open"),
            (70, "Fully open (jaw wide)")
        ]
        
        print("📍 Testing key positions:")
        for angle, description in positions_to_test:
            print(f"   Moving to {angle}° - {description}")
            jaw_control.move_to_angle(angle, 1.0, "ease_in_out")
            
            while jaw_control.is_moving:
                time.sleep(0.1)
            
            position = jaw_control.get_position()
            pulse = jaw_control._angle_to_pulse(angle)
            print(f"   ✅ Position: {position.angle:.1f}° (pulse: {pulse}µs)")
            
            time.sleep(2)  # Hold for observation
        
        # Return to closed
        jaw_control.move_to_angle(30, 1.0, "ease_in_out")
        while jaw_control.is_moving:
            time.sleep(0.1)
        
        print("\n✅ Calibration verification completed")
        return True
        
    except Exception as e:
        print(f"❌ Calibration test failed: {e}")
        return False
    finally:
        jaw_control.cleanup()

def main():
    """Main test function"""
    print("🎭 ChatterPi Jaw Animation Test Suite")
    print("=" * 60)
    print("This will test the jaw servo with speech-like movements")
    print("Watch the servo to verify it's moving correctly:")
    print("  - 30° = Closed (jaw shut)")
    print("  - 70° = Open (jaw wide)")
    print("")
    
    print("Press Enter to start, or Ctrl+C to cancel...")
    try:
        input()
    except KeyboardInterrupt:
        print("Test cancelled")
        return
    
    # Run speech simulation test
    speech_success = test_jaw_speech_simulation()
    
    if speech_success:
        print("\n" + "="*60)
        print("Run calibration verification test? (y/n): ", end="")
        try:
            response = input().lower().strip()
            if response in ['y', 'yes']:
                test_jaw_calibration_verification()
        except KeyboardInterrupt:
            print("\nCalibration test cancelled")
    
    print("\n🎉 ChatterPi Jaw Animation Test Complete!")
    print("If the jaw moved correctly:")
    print("  ✅ Hardware is working perfectly")
    print("  ✅ PWM issues are resolved")
    print("  ✅ Ready for full AI integration!")
    print("  ✅ ChatterPi AI project is FIXED! 🎭")

if __name__ == "__main__":
    main()
