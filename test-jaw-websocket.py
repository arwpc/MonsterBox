#!/usr/bin/env python3
"""
Test the jaw WebSocket server
"""

import asyncio
import websockets
import json

async def test_jaw_movement():
    try:
        uri = "ws://127.0.0.1:8765"
        print(f"Connecting to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to jaw server")
            
            # Test jaw movement
            command = {
                "type": "jaw_move",
                "angle": 40,
                "duration": 1.0
            }
            
            print(f"Sending command: {command}")
            await websocket.send(json.dumps(command))
            
            # Wait for response
            response = await websocket.recv()
            print(f"Response: {response}")
            
            # Test status
            status_command = {"type": "get_status"}
            print(f"Sending status command: {status_command}")
            await websocket.send(json.dumps(status_command))
            
            status_response = await websocket.recv()
            print(f"Status response: {status_response}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_jaw_movement())
