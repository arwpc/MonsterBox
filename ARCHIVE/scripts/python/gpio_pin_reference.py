#!/usr/bin/env python3
"""
GPIO Pin Reference and Test
Show correct pin connections and test GPIO 18
"""

def show_gpio_pinout():
    """Show RPI4b GPIO pinout for servo connection"""
    print("🔌 RPI4b GPIO Pinout for Servo Connection")
    print("=" * 50)
    print("                    RPI4b GPIO Header")
    print("                   (Looking at board)")
    print("")
    print("    3V3  [ 1] [ 2]  5V     ← Red wire (VCC)")
    print("  GPIO2  [ 3] [ 4]  5V")
    print("  GPIO3  [ 5] [ 6]  GND    ← Black wire (GND)")
    print("  GPIO4  [ 7] [ 8]  GPIO14")
    print("    GND  [ 9] [10]  GPIO15")
    print(" GPIO17  [11] [12]  GPIO18  ← Yellow wire (SIGNAL)")
    print(" GPIO27  [13] [14]  GND")
    print(" GPIO22  [15] [16]  GPIO23")
    print("    3V3  [17] [18]  GPIO24")
    print(" GPIO10  [19] [20]  GND")
    print("  GPIO9  [21] [22]  GPIO25")
    print(" GPIO11  [23] [24]  GPIO8")
    print("    GND  [25] [26]  GPIO7")
    print("  GPIO0  [27] [28]  GPIO1")
    print("  GPIO5  [29] [30]  GND")
    print("  GPIO6  [31] [32]  GPIO12")
    print(" GPIO13  [33] [34]  GND")
    print(" GPIO19  [35] [36]  GPIO16")
    print(" GPIO26  [37] [38]  GPIO20")
    print("    GND  [39] [40]  GPIO21")
    print("")
    print("🎯 SERVO CONNECTION:")
    print("   Red wire (VCC)    → Pin 2 or 4 (5V)")
    print("   Black wire (GND)  → Pin 6, 9, 14, 20, 25, 30, 34, or 39")
    print("   Yellow wire (SIG) → Pin 12 (GPIO 18)")
    print("")

def test_gpio_pins():
    """Test multiple GPIO pins to find working servo connection"""
    print("🧪 Testing GPIO Pins for Servo Response")
    print("=" * 50)
    
    # Test pins that might be used for servo
    test_pins = [
        (18, 12, "GPIO 18 (Pin 12) - Primary"),
        (19, 35, "GPIO 19 (Pin 35) - Alt 1"),
        (20, 38, "GPIO 20 (Pin 38) - Alt 2"),
        (21, 40, "GPIO 21 (Pin 40) - Alt 3"),
        (12, 32, "GPIO 12 (Pin 32) - PWM"),
        (13, 33, "GPIO 13 (Pin 33) - PWM")
    ]
    
    return test_pins

async def test_all_servo_pins():
    """Test servo on multiple GPIO pins"""
    import asyncio
    import websockets
    import json
    
    print("🔍 Testing Servo on Multiple GPIO Pins")
    print("=" * 50)
    
    test_pins = [18, 19, 20, 21, 12, 13]
    
    for pin in test_pins:
        print(f"\n🦴 Testing GPIO {pin}...")
        
        try:
            # Connect to jaw server
            uri = "ws://192.168.8.130:8765"
            async with websockets.connect(uri, timeout=5) as websocket:
                # Skip welcome
                await websocket.recv()
                
                # Configure servo pin
                config_command = {
                    "type": "configure_servo",
                    "pin": pin
                }
                await websocket.send(json.dumps(config_command))
                
                # Test movement
                move_command = {
                    "type": "jaw_move", 
                    "angle": 45,
                    "duration": 1.0
                }
                await websocket.send(json.dumps(move_command))
                
                # Wait for response
                response = await asyncio.wait_for(websocket.recv(), timeout=3)
                response_data = json.loads(response)
                
                if response_data.get("type") == "jaw_move_started":
                    print(f"   ✅ GPIO {pin}: Command sent successfully")
                    print(f"   🔍 Check if servo moves on physical pin {get_physical_pin(pin)}")
                else:
                    print(f"   ❌ GPIO {pin}: Command failed")
                
                await asyncio.sleep(2)
                
        except Exception as e:
            print(f"   ❌ GPIO {pin}: Error - {e}")

def get_physical_pin(gpio_num):
    """Get physical pin number for GPIO"""
    gpio_to_physical = {
        18: 12, 19: 35, 20: 38, 21: 40,
        12: 32, 13: 33, 16: 36, 26: 37
    }
    return gpio_to_physical.get(gpio_num, "Unknown")

def main():
    """Main function"""
    print("🎯 GPIO Pin Reference and Servo Test")
    print("=" * 60)
    
    show_gpio_pinout()
    
    print("\n🔧 TROUBLESHOOTING STEPS:")
    print("1. Verify yellow wire is on Pin 12 (GPIO 18)")
    print("2. Check 5V power connection (red wire)")
    print("3. Ensure ground connection (black wire)")
    print("4. Test servo with external power supply")
    print("5. Try different GPIO pins if needed")
    print("")
    print("⚡ POWER REQUIREMENTS:")
    print("   - Servo needs 5V external power (not from Pi)")
    print("   - Pi GPIO provides 3.3V signal (compatible)")
    print("   - Common ground between Pi and servo power")
    print("")
    
    # Run async test
    import asyncio
    print("🧪 Running multi-pin servo test...")
    asyncio.run(test_all_servo_pins())

if __name__ == "__main__":
    main()
