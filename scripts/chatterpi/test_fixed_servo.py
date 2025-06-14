#!/usr/bin/env python3
"""
Test Fixed Servo Control for ChatterPi
Tests the updated jaw control system with proper PWM implementation
"""

import time
import sys
import os

# Add the parent directory to the path to import jaw_control_system
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from chatterpi.jaw_control_system import JawControlSystem

def test_servo_basic():
    """Test basic servo functionality"""
    print("🔧 Testing Fixed Servo Control")
    print("=" * 50)
    
    # Initialize jaw control system with ChatterPi settings
    jaw_control = JawControlSystem(
        pin=18,
        min_pulse=500,   # MG90S minimum
        max_pulse=2400   # MG90S maximum
    )
    
    print(f"📋 Configuration:")
    print(f"   GPIO Pin: {jaw_control.pin}")
    print(f"   Pulse Range: {jaw_control.min_pulse}-{jaw_control.max_pulse}µs")
    print(f"   Angle Range: {jaw_control.min_angle}°-{jaw_control.max_angle}°")
    print(f"   Closed Position: 70°")
    print(f"   Open Position: 30°")
    print("")
    
    # Initialize
    if not jaw_control.initialize():
        print("❌ Failed to initialize jaw control")
        return False
    
    print("✅ Jaw control initialized successfully")
    print("")
    
    try:
        # Test sequence with ChatterPi positions
        test_positions = [
            (70, "Closed (jaw shut)"),
            (50, "Slightly open"),
            (30, "Fully open (jaw wide)"),
            (50, "Half open"),
            (70, "Return to closed")
        ]
        
        print("🦴 Testing jaw positions...")
        print("Watch the servo for movement!")
        print("")
        
        for angle, description in test_positions:
            print(f"   Moving to {angle}° - {description}")
            
            success = jaw_control.move_to_angle(angle, duration=1.0, curve_type="ease_in_out")
            if not success:
                print(f"   ❌ Failed to move to {angle}°")
                continue
            
            # Wait for movement to complete
            while jaw_control.is_moving:
                time.sleep(0.1)
            
            # Get current position
            position = jaw_control.get_position()
            print(f"   ✅ Position: {position.angle:.1f}° (pulse: {position.pulse_width}µs)")
            
            time.sleep(1)  # Hold position
            print("")
        
        print("🎉 Basic servo test completed!")
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

def test_servo_calibration():
    """Test servo calibration sequence"""
    print("\n🔧 Testing Servo Calibration")
    print("=" * 50)
    
    jaw_control = JawControlSystem(pin=18, min_pulse=500, max_pulse=2400)
    
    if not jaw_control.initialize():
        print("❌ Failed to initialize jaw control")
        return False
    
    try:
        print("🎯 Starting calibration sequence...")
        print("This will slowly move through the range for visual inspection")
        print("")
        
        # Calibrate with smaller steps for better observation
        calibration_data = jaw_control.calibrate_jaw_range(step_size=10.0, step_delay=2.0)
        
        if calibration_data.get("status") == "completed":
            print("✅ Calibration completed successfully!")
            print(f"   Duration: {calibration_data['duration']:.1f} seconds")
            print(f"   Steps tested: {len(calibration_data['steps'])}")
            
            # Show some key positions
            print("\n📍 Key positions tested:")
            for step in calibration_data["steps"]:
                angle = step["angle"]
                pulse = step["pulse_width"]
                if angle in [30, 40, 50, 60, 70]:
                    print(f"   {angle}°: {pulse}µs")
        else:
            print(f"❌ Calibration failed: {calibration_data.get('error', 'Unknown error')}")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Calibration test failed: {e}")
        return False
    finally:
        jaw_control.cleanup()

def main():
    """Main test function"""
    print("🎯 ChatterPi Fixed Servo Test")
    print("=" * 60)
    print("Testing the updated jaw control system with:")
    print("  - Proper lgpio.tx_servo() implementation")
    print("  - ChatterPi angle configuration (closed=70°, open=30°)")
    print("  - MG90S servo pulse range (500-2400µs)")
    print("  - Improved error handling")
    print("")
    
    print("⚠️ IMPORTANT: Ensure servo is connected to GPIO 18")
    print("   - Red wire (VCC) -> 5V power")
    print("   - Black/Brown wire (GND) -> Ground") 
    print("   - Orange/Yellow wire (Signal) -> GPIO 18 (Physical Pin 12)")
    print("")
    
    print("Press Enter to start basic test, or Ctrl+C to cancel...")
    try:
        input()
    except KeyboardInterrupt:
        print("Test cancelled")
        return
    
    # Run basic test
    basic_success = test_servo_basic()
    
    if basic_success:
        print("\n" + "="*60)
        print("Basic test passed! Run calibration test? (y/n): ", end="")
        try:
            response = input().lower().strip()
            if response in ['y', 'yes']:
                test_servo_calibration()
        except KeyboardInterrupt:
            print("\nCalibration test cancelled")
    
    print("\n🎉 All tests completed!")
    print("If servo moved correctly:")
    print("  ✅ Hardware connections are good")
    print("  ✅ PWM implementation is fixed")
    print("  ✅ Ready for AI integration!")

if __name__ == "__main__":
    main()
