#!/usr/bin/env python3
"""
Direct GPIO 18 Servo Test
Test servo movement directly on GPIO 18 to verify hardware connection
"""

import time
import sys

def test_gpio18_servo():
    """Test servo on GPIO 18 directly"""
    print("🔧 Testing GPIO 18 Servo Control")
    print("=" * 40)
    
    try:
        import RPi.GPIO as GPIO
        print("✅ RPi.GPIO imported successfully")
    except ImportError:
        print("❌ RPi.GPIO not available")
        return False
    
    try:
        # Setup GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(18, GPIO.OUT)
        print("✅ GPIO 18 configured as output")
        
        # Setup PWM (50Hz for servo)
        pwm = GPIO.PWM(18, 50)
        pwm.start(0)
        print("✅ PWM started on GPIO 18 at 50Hz")
        
        # Test servo positions
        print("\n🦴 Testing servo positions...")
        
        # Servo duty cycles for different angles
        # 0° = ~2.5% duty cycle, 90° = ~7.5%, 180° = ~12.5%
        test_positions = [
            (0, 2.5, "0° (Closed)"),
            (45, 5.0, "45° (Half Open)"),
            (90, 7.5, "90° (Open)"),
            (45, 5.0, "45° (Half Open)"),
            (0, 2.5, "0° (Closed)")
        ]
        
        for angle, duty, description in test_positions:
            print(f"   Moving to {description} - Duty: {duty}%")
            pwm.ChangeDutyCycle(duty)
            time.sleep(1.5)  # Hold position
            
            # Brief pause between movements
            pwm.ChangeDutyCycle(0)  # Stop PWM signal
            time.sleep(0.2)
        
        print("\n✅ Servo test sequence completed!")
        print("🔍 Did you see the servo move?")
        
        # Cleanup
        pwm.stop()
        GPIO.cleanup()
        print("✅ GPIO cleaned up")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during servo test: {e}")
        try:
            GPIO.cleanup()
        except:
            pass
        return False

def check_gpio_permissions():
    """Check GPIO permissions"""
    print("\n🔍 Checking GPIO permissions...")
    
    import os
    import grp
    
    try:
        # Check if user is in gpio group
        groups = [g.gr_name for g in grp.getgrall() if os.getenv('USER') in g.gr_mem]
        if 'gpio' in groups:
            print("✅ User is in gpio group")
        else:
            print("⚠️ User not in gpio group - may need: sudo usermod -a -G gpio $USER")
        
        # Check /dev/gpiomem permissions
        if os.path.exists('/dev/gpiomem'):
            stat = os.stat('/dev/gpiomem')
            print(f"✅ /dev/gpiomem exists with permissions: {oct(stat.st_mode)[-3:]}")
        else:
            print("❌ /dev/gpiomem not found")
            
    except Exception as e:
        print(f"⚠️ Permission check error: {e}")

def main():
    """Main test function"""
    print("🎯 GPIO 18 Servo Hardware Test")
    print("=" * 50)
    
    check_gpio_permissions()
    
    print("\n⚠️ IMPORTANT: Make sure servo is connected to:")
    print("   - Red wire (VCC) -> 5V power")
    print("   - Black/Brown wire (GND) -> Ground")
    print("   - Orange/Yellow wire (Signal) -> GPIO 18")
    print("\nPress Enter to start test, or Ctrl+C to cancel...")
    
    try:
        input()
    except KeyboardInterrupt:
        print("\nTest cancelled by user")
        return
    
    success = test_gpio18_servo()
    
    if success:
        print("\n🎉 GPIO 18 servo test completed successfully!")
        print("If servo didn't move, check:")
        print("   1. Physical connections")
        print("   2. Power supply (5V for servo)")
        print("   3. Servo compatibility (standard PWM servo)")
    else:
        print("\n❌ GPIO 18 servo test failed!")
        print("Check error messages above")

if __name__ == "__main__":
    main()
