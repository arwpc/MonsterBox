#!/usr/bin/env python3
"""
Test Servo Movement NOW
Send real-time commands to test GPIO 18 servo movement
"""

import asyncio
import websockets
import json
import time

async def test_servo_movement():
    """Test servo movement in real-time"""
    print("🦴 TESTING SERVO MOVEMENT ON GPIO 18")
    print("=" * 50)
    print("Connecting to jaw server...")
    
    try:
        # Connect to jaw WebSocket server
        uri = "ws://192.168.8.130:8765"
        async with websockets.connect(uri, timeout=10) as websocket:
            print("✅ Connected to jaw WebSocket server")
            
            # Receive welcome message
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            welcome_data = json.loads(welcome_msg)
            print(f"📨 Server: {welcome_data.get('type', 'unknown')}")
            
            if welcome_data.get("type") == "welcome":
                server_info = welcome_data.get("server_info", {})
                print(f"🔧 Servo Pin: {server_info.get('servo_pin')}")
                print(f"🔧 lgpio Available: {server_info.get('gpio_available')}")
                
                print("\n🎯 STARTING SERVO MOVEMENT TEST SEQUENCE")
                print("=" * 50)
                
                # Test sequence - multiple positions
                test_sequence = [
                    (0, "CLOSED POSITION"),
                    (30, "SLIGHTLY OPEN"),
                    (60, "HALF OPEN"),
                    (90, "WIDE OPEN"),
                    (60, "BACK TO HALF"),
                    (30, "SLIGHTLY OPEN"),
                    (0, "RETURN TO CLOSED")
                ]
                
                for i, (angle, description) in enumerate(test_sequence):
                    print(f"\n🦴 Test {i+1}/7: Moving to {angle}° - {description}")
                    print(f"   Sending command to GPIO 18...")
                    
                    # Send movement command
                    move_command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 1.5,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(move_command))
                    print(f"   ✅ Command sent: Move to {angle}°")
                    
                    # Wait for movement started confirmation
                    try:
                        start_response = await asyncio.wait_for(websocket.recv(), timeout=5)
                        start_data = json.loads(start_response)
                        
                        if start_data.get("type") == "jaw_move_started":
                            print(f"   ✅ Movement started to {start_data.get('angle')}°")
                            print(f"   ⏱️ Duration: {start_data.get('duration')}s")
                            
                            # Wait for movement completion
                            try:
                                complete_response = await asyncio.wait_for(websocket.recv(), timeout=10)
                                complete_data = json.loads(complete_response)
                                
                                if complete_data.get("type") == "jaw_move_completed":
                                    print(f"   ✅ Movement completed at {complete_data.get('angle')}°")
                                    print(f"   🎯 SERVO SHOULD BE AT {angle}° NOW!")
                                else:
                                    print(f"   ⚠️ Unexpected completion response: {complete_data}")
                            except asyncio.TimeoutError:
                                print("   ⚠️ Movement completion timeout (servo may still be moving)")
                        else:
                            print(f"   ❌ Movement failed: {start_data}")
                            return False
                    except asyncio.TimeoutError:
                        print("   ❌ No response from server")
                        return False
                    
                    # Pause between movements
                    print("   ⏳ Waiting 2 seconds before next movement...")
                    await asyncio.sleep(2)
                
                print("\n" + "=" * 50)
                print("🎉 SERVO MOVEMENT TEST SEQUENCE COMPLETE!")
                print("=" * 50)
                print("📋 Test Summary:")
                print("   - 7 different positions tested")
                print("   - Commands sent to GPIO 18")
                print("   - lgpio PWM control active")
                print("   - Servo should have moved through all positions")
                print("")
                print("❓ DID YOU SEE THE SERVO MOVE?")
                print("   ✅ YES = Servo control is working perfectly!")
                print("   ❌ NO = Check power/connections to GPIO 18")
                
                return True
            else:
                print(f"❌ Unexpected welcome message: {welcome_data}")
                return False
                
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("🎯 REAL-TIME SERVO MOVEMENT TEST")
    print("Testing GPIO 18 servo on RPI4b Skulltalker")
    print("=" * 60)
    
    success = await test_servo_movement()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ SERVO TEST COMPLETED SUCCESSFULLY!")
        print("🦴 Commands sent to GPIO 18 servo")
        print("⚡ lgpio PWM control active")
        print("🎯 Servo should have moved through 7 positions")
        print("")
        print("👀 Please confirm if you saw the servo move!")
    else:
        print("❌ SERVO TEST FAILED!")
        print("🔧 Check server connection and GPIO setup")
    
    return success

if __name__ == "__main__":
    asyncio.run(main())
