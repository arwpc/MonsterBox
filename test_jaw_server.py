#!/usr/bin/env python3
"""
Test script to verify jaw server is working correctly
"""

import asyncio
import websockets
import json
import time

async def test_jaw_server():
    """Test the jaw server"""
    uri = "ws://localhost:8765"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to jaw server")
            
            # Wait for welcome message
            welcome = await websocket.recv()
            print(f"📨 Welcome: {welcome}")
            
            # Test jaw movement
            test_command = {
                "type": "jaw_move",
                "angle": 45,
                "duration": 1.0,
                "curve_type": "ease_in_out"
            }
            await websocket.send(json.dumps(test_command))
            print("📤 Sent jaw move command")
            
            # Wait for response
            response = await websocket.recv()
            print(f"📨 Jaw response: {response}")
            
            # Test jaw stop
            stop_command = {
                "type": "stop_servo"
            }
            await websocket.send(json.dumps(stop_command))
            print("📤 Sent stop servo command")
            
            # Wait for response
            response = await websocket.recv()
            print(f"📨 Stop response: {response}")
            
            print("✅ SUCCESS: Jaw server is responding correctly!")
            return True
                
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    print("🦴 Testing Jaw Server...")
    result = asyncio.run(test_jaw_server())
    if result:
        print("🎉 Test PASSED - Jaw server is working!")
    else:
        print("💥 Test FAILED - Jaw server needs attention")
