#!/usr/bin/env python3
"""
Test GPIO 18 Again
Direct test of servo movement on GPIO 18 (Physical Pin 12)
"""

import asyncio
import websockets
import json
import time

async def test_gpio18_servo():
    """Test GPIO 18 servo movement"""
    print("🦴 TESTING GPIO 18 SERVO AGAIN")
    print("=" * 40)
    print("Physical Pin: 12")
    print("GPIO Number: 18")
    print("Expected Connection: Yellow wire to Pin 12")
    print("")
    
    try:
        # Connect to jaw server
        uri = "ws://192.168.8.130:8765"
        print("Connecting to jaw server...")
        
        async with websockets.connect(uri, timeout=10) as websocket:
            print("✅ Connected to jaw WebSocket")
            
            # Receive welcome
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            welcome_data = json.loads(welcome_msg)
            print(f"Server response: {welcome_data.get('type')}")
            
            # Test sequence with clear movements
            print("\n🎯 STARTING GPIO 18 TEST SEQUENCE")
            print("Watch physical pin 12 for servo movement...")
            print("")
            
            test_moves = [
                (0, "POSITION 1: Fully Closed (0°)"),
                (45, "POSITION 2: Quarter Open (45°)"),
                (90, "POSITION 3: Half Open (90°)"),
                (135, "POSITION 4: Three-Quarter Open (135°)"),
                (180, "POSITION 5: Fully Open (180°)"),
                (90, "POSITION 6: Return to Center (90°)"),
                (0, "POSITION 7: Return to Closed (0°)")
            ]
            
            for i, (angle, description) in enumerate(test_moves):
                print(f"🦴 {description}")
                print(f"   Sending command: Move to {angle}°")
                
                # Send movement command
                move_command = {
                    "type": "jaw_move",
                    "angle": angle,
                    "duration": 2.0,  # Longer duration for visibility
                    "curve_type": "linear"
                }
                
                await websocket.send(json.dumps(move_command))
                print(f"   ✅ Command sent to GPIO 18")
                
                # Wait for confirmation
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5)
                    response_data = json.loads(response)
                    
                    if response_data.get("type") == "jaw_move_started":
                        print(f"   ✅ Movement started to {response_data.get('angle')}°")
                        print(f"   ⏱️ Duration: {response_data.get('duration')}s")
                        print(f"   🔍 WATCH PIN 12 NOW!")
                        
                        # Wait for completion
                        try:
                            complete_msg = await asyncio.wait_for(websocket.recv(), timeout=8)
                            complete_data = json.loads(complete_msg)
                            if complete_data.get("type") == "jaw_move_completed":
                                print(f"   ✅ Movement completed at {complete_data.get('angle')}°")
                            else:
                                print(f"   ⚠️ Unexpected: {complete_data}")
                        except asyncio.TimeoutError:
                            print("   ⚠️ Completion timeout (movement may still be happening)")
                    else:
                        print(f"   ❌ Command failed: {response_data}")
                        
                except asyncio.TimeoutError:
                    print("   ❌ No response from server")
                
                print(f"   ⏳ Waiting 3 seconds before next position...")
                await asyncio.sleep(3)
                print("")
            
            print("🎉 GPIO 18 TEST SEQUENCE COMPLETE!")
            print("=" * 40)
            print("📋 Summary:")
            print("   - 7 positions tested on GPIO 18")
            print("   - Physical pin 12 should have shown movement")
            print("   - Each position held for 2 seconds")
            print("   - Commands sent via lgpio PWM control")
            print("")
            print("❓ DID YOU SEE MOVEMENT ON PIN 12?")
            
            return True
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

async def main():
    """Main test"""
    print("🎯 GPIO 18 SERVO TEST - ATTEMPT 2")
    print("=" * 50)
    print("🔌 Connection Check:")
    print("   Yellow wire should be on Physical Pin 12")
    print("   This corresponds to GPIO 18")
    print("   Red wire on Pin 2 or 4 (5V)")
    print("   Black wire on Pin 6 (GND)")
    print("")
    
    success = await test_gpio18_servo()
    
    if success:
        print("\n✅ Test commands sent successfully!")
        print("🔍 Please confirm if you saw servo movement")
    else:
        print("\n❌ Test failed - check connections")

if __name__ == "__main__":
    asyncio.run(main())
