#!/usr/bin/env python3

"""
Test GoBilda servo continuous control via WebSocket service
"""

import asyncio
import json
import websockets

async def test_gobilda_servo():
    try:
        uri = 'ws://localhost:8779'
        print('🔌 Connecting to servo service...')
        
        async with websockets.connect(uri) as websocket:
            # Wait for welcome message
            welcome = await websocket.recv()
            print('✅ Connected!')
            
            # Test continuous control with GoBilda servo (ID 29)
            print('\n🎮 Testing GoBilda continuous control...')
            
            # Test clockwise rotation
            print('Testing CW rotation...')
            message = {
                'type': 'servo_continuous_control',
                'servo_id': '29',
                'direction': 'cw',
                'speed': 'slow',
                'duration': 2.0
            }
            await websocket.send(json.dumps(message))
            response = await websocket.recv()
            data = json.loads(response)
            print(f'CW rotation: {data.get("message")}')
            
            await asyncio.sleep(2.5)  # Wait for movement
            
            # Test counter-clockwise rotation
            print('Testing CCW rotation...')
            message = {
                'type': 'servo_continuous_control',
                'servo_id': '29',
                'direction': 'ccw',
                'speed': 'slow',
                'duration': 2.0
            }
            await websocket.send(json.dumps(message))
            response = await websocket.recv()
            data = json.loads(response)
            print(f'CCW rotation: {data.get("message")}')
            
            await asyncio.sleep(2.5)  # Wait for movement
            
            # Test stop
            print('Testing stop...')
            message = {
                'type': 'servo_continuous_control',
                'servo_id': '29',
                'direction': 'stop'
            }
            await websocket.send(json.dumps(message))
            response = await websocket.recv()
            data = json.loads(response)
            print(f'Stop: {data.get("message")}')
            
            print('\n✅ GoBilda servo test completed!')
            
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_gobilda_servo())
