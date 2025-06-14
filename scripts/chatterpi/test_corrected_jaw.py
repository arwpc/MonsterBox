#!/usr/bin/env python3
"""
Test Corrected ChatterPi Jaw Configuration
Quick test to verify 70°=closed, 30°=open is working correctly
"""

import time
import sys
import os

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from chatterpi.jaw_control_system import JawControlSystem

def test_corrected_jaw():
    """Test the corrected jaw configuration"""
    print("🎭 Testing CORRECTED ChatterPi Jaw Configuration")
    print("=" * 60)
    print("Expected behavior:")
    print("  70° = CLOSED (jaw shut)")
    print("  30° = OPEN (jaw wide)")
    print("")
    
    # Initialize jaw control
    jaw_control = JawControlSystem(pin=18, min_pulse=500, max_pulse=2400)
    
    if not jaw_control.initialize():
        print("❌ Failed to initialize jaw control")
        return False
    
    print("✅ Jaw control initialized")
    print(f"📋 Range: {jaw_control.min_angle}° (open) to {jaw_control.max_angle}° (closed)")
    print("")
    
    try:
        # Test sequence with clear descriptions
        test_sequence = [
            (70, "CLOSED - Jaw should be SHUT", 3),
            (50, "HALF OPEN - Jaw should be partially open", 2),
            (30, "FULLY OPEN - Jaw should be WIDE OPEN", 3),
            (50, "HALF OPEN - Jaw should be partially open", 2),
            (70, "CLOSED - Jaw should be SHUT again", 2)
        ]
        
        print("🎯 Testing jaw positions...")
        print("Watch the servo carefully!")
        print("")
        
        for angle, description, hold_time in test_sequence:
            print(f"Moving to {angle}° - {description}")
            
            jaw_control.move_to_angle(angle, 1.0, "ease_in_out")
            
            # Wait for movement to complete
            while jaw_control.is_moving:
                time.sleep(0.1)
            
            # Get actual position
            position = jaw_control.get_position()
            pulse = jaw_control._angle_to_pulse(angle)
            print(f"   ✅ Position: {position.angle:.1f}° (pulse: {pulse}µs)")
            print(f"   Holding for {hold_time} seconds...")
            
            time.sleep(hold_time)
            print("")
        
        print("🎉 Corrected jaw test completed!")
        print("")
        print("VERIFICATION:")
        print("  ✅ Did 70° show jaw CLOSED (shut)?")
        print("  ✅ Did 30° show jaw OPEN (wide)?")
        print("  ✅ Was the movement smooth between positions?")
        
        return True
        
    except KeyboardInterrupt:
        print("\n⚠️ Test interrupted by user")
        return False
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        return False
    finally:
        # Return to closed position
        print("Returning to closed position...")
        jaw_control.move_to_angle(70, 1.0, "ease_in_out")
        while jaw_control.is_moving:
            time.sleep(0.1)
        
        jaw_control.cleanup()
        print("✅ Cleanup completed")

def main():
    """Main test function"""
    print("🔧 ChatterPi Jaw Configuration Verification")
    print("=" * 70)
    print("This test verifies the corrected jaw angle configuration.")
    print("Make sure you can see the servo to verify the movement!")
    print("")
    
    print("Press Enter to start test, or Ctrl+C to cancel...")
    try:
        input()
    except KeyboardInterrupt:
        print("Test cancelled")
        return
    
    success = test_corrected_jaw()
    
    if success:
        print("\n" + "="*70)
        print("🎉 CHATTERPI JAW CONFIGURATION TEST COMPLETE!")
        print("")
        print("If the jaw moved correctly:")
        print("  ✅ 70° = Closed (jaw shut) ✓")
        print("  ✅ 30° = Open (jaw wide) ✓")
        print("  ✅ Configuration is now CORRECT! 🎭")
        print("  ✅ Ready for audio-driven animation!")
        print("  ✅ ChatterPi AI project is FIXED! 🚀")
    else:
        print("\n❌ Test failed - check servo connections")

if __name__ == "__main__":
    main()
