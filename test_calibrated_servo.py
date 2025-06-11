#!/usr/bin/env python3
"""
Test Calibrated Servo System
Use the working jaw control system with calibrated pulse widths
"""

import asyncio
import websockets
import json
import time

async def test_calibrated_servo():
    """Test the calibrated servo system"""
    print("🦴 TESTING CALIBRATED SERVO SYSTEM")
    print("=" * 50)
    print("Using: jaw_websocket_server.py")
    print("Pulse range: 500-2500 microseconds (calibrated)")
    print("GPIO: 18 (Physical Pin 12)")
    print("")
    
    try:
        # Connect to the working jaw server
        uri = "ws://192.168.8.130:8765"
        print("Connecting to calibrated jaw server...")
        
        async with websockets.connect(uri, timeout=10) as websocket:
            print("✅ Connected to jaw WebSocket")
            
            # Receive welcome
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            welcome_data = json.loads(welcome_msg)
            print(f"Server: {welcome_data.get('type')}")
            
            if welcome_data.get("type") == "welcome":
                server_info = welcome_data.get("server_info", {})
                print(f"Servo pin: {server_info.get('servo_pin')}")
                print(f"Capabilities: {server_info.get('capabilities')}")
                
                print("\n🎯 TESTING CALIBRATED SERVO MOVEMENTS")
                print("These should work with your calibrated settings!")
                print("")
                
                # Test with the calibrated angles
                test_sequence = [
                    (0, "Closed position (500µs pulse)"),
                    (25, "Slightly open (625µs pulse)"),
                    (50, "Quarter open (750µs pulse)"),
                    (75, "Half open (875µs pulse)"),
                    (100, "Three-quarter open (1000µs pulse)"),
                    (50, "Return to quarter"),
                    (0, "Return to closed")
                ]
                
                for i, (angle, description) in enumerate(test_sequence):
                    print(f"🦴 Test {i+1}/7: {description}")
                    
                    # Send jaw movement command
                    move_command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 1.5,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(move_command))
                    print(f"   ✅ Command sent: Move to {angle}°")
                    
                    # Wait for movement started
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=5)
                        response_data = json.loads(response)
                        
                        if response_data.get("type") == "jaw_move_started":
                            print(f"   ✅ Movement started to {response_data.get('angle')}°")
                            print(f"   🔍 WATCH PIN 12 FOR MOVEMENT!")
                            
                            # Wait for completion
                            try:
                                complete_msg = await asyncio.wait_for(websocket.recv(), timeout=8)
                                complete_data = json.loads(complete_msg)
                                if complete_data.get("type") == "jaw_move_completed":
                                    print(f"   ✅ Movement completed")
                                else:
                                    print(f"   ⚠️ Unexpected: {complete_data}")
                            except asyncio.TimeoutError:
                                print("   ⚠️ Completion timeout")
                        else:
                            print(f"   ❌ Movement failed: {response_data}")
                            
                    except asyncio.TimeoutError:
                        print("   ❌ No response from server")
                    
                    print("   ⏳ Waiting 2 seconds...")
                    await asyncio.sleep(2)
                    print("")
                
                print("🎉 CALIBRATED SERVO TEST COMPLETE!")
                print("=" * 50)
                print("This uses your previously calibrated settings:")
                print("   - Pulse range: 500-2500 microseconds")
                print("   - Smooth movement curves")
                print("   - Proper lgpio integration")
                print("")
                print("❓ DID YOU SEE SERVO MOVEMENT THIS TIME?")
                
                return True
            else:
                print(f"❌ Unexpected welcome: {welcome_data}")
                return False
                
    except Exception as e:
        print(f"❌ Test failed: {e}")
        print("The calibrated jaw server may not be running")
        return False

async def main():
    """Main test"""
    print("🎯 CALIBRATED SERVO SYSTEM TEST")
    print("=" * 60)
    print("Switching back to the working jaw control system")
    print("that we previously calibrated together.")
    print("")
    
    success = await test_calibrated_servo()
    
    if success:
        print("\n✅ Calibrated servo test completed!")
        print("This should work since we calibrated it before.")
    else:
        print("\n❌ Test failed - may need to restart calibrated server")

if __name__ == "__main__":
    asyncio.run(main())
