#!/usr/bin/env python3
"""
Test lgpio Servo Control
Direct test of servo on GPIO 18 using lgpio
"""

import time
import sys

def test_lgpio_servo():
    """Test servo using lgpio"""
    print("🔧 Testing lgpio Servo Control on GPIO 18")
    print("=" * 50)
    
    try:
        import lgpio
        print("✅ lgpio imported successfully")
        print(f"   lgpio version: {lgpio.get_version()}")
    except ImportError:
        print("❌ lgpio not available")
        return False
    
    gpio_handle = None
    
    try:
        # Open GPIO chip
        gpio_handle = lgpio.gpiochip_open(0)
        print("✅ GPIO chip opened")
        
        # Try to free the pin first
        try:
            lgpio.gpio_free(gpio_handle, 18)
        except:
            pass  # Pin wasn't claimed
        
        # Set pin as output
        lgpio.gpio_claim_output(gpio_handle, 18)
        print("✅ GPIO 18 claimed as output")
        
        # Test servo positions
        print("\n🦴 Testing servo positions...")
        
        test_positions = [
            (0, 1000, "0° (Closed)"),
            (45, 1250, "45° (Quarter Open)"),
            (90, 1500, "90° (Half Open)"),
            (135, 1750, "135° (Three Quarter Open)"),
            (180, 2000, "180° (Full Open)"),
            (90, 1500, "90° (Return to Center)"),
            (0, 1000, "0° (Return to Closed)")
        ]
        
        for angle, pulse_width, description in test_positions:
            print(f"   Moving to {description}")
            print(f"   Pulse width: {pulse_width}µs")
            
            # Set PWM (50Hz, pulse width in microseconds)
            # Convert pulse width to duty cycle percentage
            duty_cycle = (pulse_width / 20000.0) * 100
            
            lgpio.tx_pwm(gpio_handle, 18, 50, duty_cycle)
            print(f"   PWM set: 50Hz, {duty_cycle:.2f}% duty cycle")
            
            time.sleep(2)  # Hold position for 2 seconds
            print("   ✅ Position held")
        
        # Stop PWM
        lgpio.tx_pwm(gpio_handle, 18, 0, 0)
        print("\n✅ PWM stopped")
        
        print("\n🎉 lgpio servo test completed!")
        print("Did you see the servo move through the positions?")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during servo test: {e}")
        return False
        
    finally:
        if gpio_handle is not None:
            try:
                lgpio.gpiochip_close(gpio_handle)
                print("✅ GPIO chip closed")
            except Exception as e:
                print(f"⚠️ Error closing GPIO: {e}")

def check_lgpio_status():
    """Check lgpio status and permissions"""
    print("🔍 Checking lgpio status...")
    
    try:
        import lgpio
        print(f"✅ lgpio version: {lgpio.get_version()}")
        
        # Try to open GPIO chip
        try:
            handle = lgpio.gpiochip_open(0)
            print("✅ GPIO chip 0 accessible")
            lgpio.gpiochip_close(handle)
        except Exception as e:
            print(f"❌ Cannot access GPIO chip: {e}")
            
    except ImportError:
        print("❌ lgpio not installed")
        print("Install with: sudo apt install python3-lgpio")

def main():
    """Main test function"""
    print("🎯 lgpio Servo Test for GPIO 18")
    print("=" * 60)
    
    check_lgpio_status()
    
    print("\n⚠️ IMPORTANT: Ensure servo is connected to GPIO 18")
    print("   - Red wire (VCC) -> 5V power")
    print("   - Black/Brown wire (GND) -> Ground") 
    print("   - Orange/Yellow wire (Signal) -> GPIO 18")
    print("\nThis test will move the servo through several positions.")
    print("Press Enter to start, or Ctrl+C to cancel...")
    
    try:
        input()
    except KeyboardInterrupt:
        print("\nTest cancelled")
        return
    
    success = test_lgpio_servo()
    
    if success:
        print("\n🎉 lgpio servo test completed!")
        print("If servo moved: ✅ Hardware is working")
        print("If servo didn't move: Check connections and power")
    else:
        print("\n❌ lgpio servo test failed!")

if __name__ == "__main__":
    main()
