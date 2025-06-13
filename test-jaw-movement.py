#!/usr/bin/env python3
"""
Test ChatterPi Jaw Movement
Quick test to verify jaw animation is working
"""

import asyncio
import websockets
import json
import time

async def test_jaw_movement():
    """Test jaw movement via WebSocket"""
    print("🦴 Testing ChatterPi Jaw Movement")
    print("=" * 40)
    
    try:
        # Connect to ChatterPi jaw bridge
        uri = "ws://localhost:8765"
        print(f"Connecting to {uri}...")
        
        async with websockets.connect(uri, timeout=10) as websocket:
            # Wait for welcome message
            welcome = await websocket.recv()
            print(f"✅ Connected: {welcome}")
            
            # Test sequence: Open -> Close -> Open -> Close
            test_positions = [
                {"angle": 30, "description": "Open (30°)"},
                {"angle": 50, "description": "Closed (50°)"},
                {"angle": 25, "description": "Wide Open (25°)"},
                {"angle": 55, "description": "Fully Closed (55°)"},
                {"angle": 40, "description": "Neutral (40°)"}
            ]
            
            print("\n🎬 Starting jaw movement test sequence...")
            
            for i, position in enumerate(test_positions, 1):
                print(f"\n{i}. Moving to {position['description']}")
                
                # Send jaw movement command
                command = {
                    "type": "jaw_move",
                    "angle": position["angle"],
                    "duration": 1.0
                }
                
                await websocket.send(json.dumps(command))
                
                # Wait for response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=3)
                    response_data = json.loads(response)
                    
                    if response_data.get("type") == "jaw_move_started":
                        print(f"   ✅ Command sent successfully")
                        print(f"   🎯 Target: {position['angle']}°")
                    else:
                        print(f"   ❌ Unexpected response: {response_data}")
                        
                except asyncio.TimeoutError:
                    print(f"   ⚠️ No response received (timeout)")
                
                # Wait between movements
                print(f"   ⏳ Holding position for 2 seconds...")
                await asyncio.sleep(2)
            
            print("\n🎉 Jaw movement test completed!")
            print("=" * 40)
            print("📋 Test Summary:")
            print(f"   - {len(test_positions)} positions tested")
            print("   - Range: 25° (wide open) to 55° (fully closed)")
            print("   - Each position held for 2 seconds")
            print("   - Commands sent via WebSocket to jaw bridge")
            print("\n❓ Did you observe jaw movement?")
            
            return True
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("🎯 ChatterPi Jaw Animation Test")
    print("=" * 50)
    print("🔌 Connection Info:")
    print("   - WebSocket: ws://localhost:8765")
    print("   - GPIO Pin: 18 (Physical Pin 12)")
    print("   - Servo: MG90S (or compatible)")
    print("   - Expected Range: 25°-55°")
    print("")
    
    success = await test_jaw_movement()
    
    if success:
        print("\n✅ Test commands completed successfully!")
        print("🔍 Check if you saw physical servo movement")
        print("💡 If no movement, check servo connections:")
        print("   - Yellow wire → Pin 12 (GPIO 18)")
        print("   - Red wire → Pin 2 or 4 (5V)")
        print("   - Black wire → Pin 6 (GND)")
    else:
        print("\n❌ Test failed - check jaw bridge connection")

if __name__ == "__main__":
    asyncio.run(main())
