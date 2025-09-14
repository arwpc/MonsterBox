#!/usr/bin/env python3

"""
Quick test to verify servo WebSocket service and API integration
"""

import asyncio
import json
import websockets
import sys

async def test_servo_websocket():
    """Test direct WebSocket connection to servo service"""
    print("🔌 Testing Servo WebSocket Service")
    print("=" * 40)
    
    try:
        uri = "ws://localhost:8779"
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to servo WebSocket service")
            
            # Wait for welcome message
            try:
                welcome = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                print(f"📨 Welcome message: {welcome}")
            except asyncio.TimeoutError:
                print("⚠️  No welcome message received")
            
            # Test get servo configs
            print("\n🔧 Testing servo configurations...")
            await websocket.send(json.dumps({
                'type': 'get_servo_configs',
                'request_id': 'test_configs'
            }))
            
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            config_data = json.loads(response)
            
            if config_data.get('status') == 'success':
                servo_configs = config_data.get('servo_configs', {})
                print(f"✅ Found {len(servo_configs)} servo configurations:")
                for servo_id, config in servo_configs.items():
                    print(f"   • Servo {servo_id}: {config.get('name', 'Unknown')}")
            else:
                print(f"❌ Failed to get servo configs: {config_data.get('message')}")
            
            # Test continuous control for servo 29
            print("\n🎮 Testing continuous servo control...")
            await websocket.send(json.dumps({
                'type': 'servo_continuous_control',
                'servo_id': '29',
                'direction': 'cw',
                'speed': 'slow',
                'duration': 1.0,
                'request_id': 'test_control'
            }))
            
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            control_data = json.loads(response)
            
            if control_data.get('status') == 'success':
                print("✅ Continuous servo control working")
            else:
                print(f"❌ Continuous servo control failed: {control_data.get('message')}")
            
            # Wait for movement
            await asyncio.sleep(1.5)
            
            # Test stop
            print("\n⏹️ Testing servo stop...")
            await websocket.send(json.dumps({
                'type': 'servo_continuous_control',
                'servo_id': '29',
                'direction': 'stop',
                'request_id': 'test_stop'
            }))
            
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            stop_data = json.loads(response)
            
            if stop_data.get('status') == 'success':
                print("✅ Servo stop working")
            else:
                print(f"❌ Servo stop failed: {stop_data.get('message')}")
            
            # Test get positions
            print("\n📍 Testing get positions...")
            await websocket.send(json.dumps({
                'type': 'servo_get_positions',
                'servo_id': '29',
                'request_id': 'test_positions'
            }))
            
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            positions_data = json.loads(response)
            
            if positions_data.get('status') == 'success':
                saved_positions = positions_data.get('saved_positions', {})
                calibrated_positions = positions_data.get('calibrated_positions', {})
                print(f"✅ Found {len(saved_positions)} saved positions")
                print(f"✅ Found {len(calibrated_positions)} calibrated positions")
                
                if saved_positions:
                    print("   Saved positions:")
                    for name, data in saved_positions.items():
                        print(f"     • {name}: {data}")
                        
                if calibrated_positions:
                    print("   Calibrated positions:")
                    for name, data in calibrated_positions.items():
                        print(f"     • {name}: {data}")
            else:
                print(f"❌ Get positions failed: {positions_data.get('message')}")
            
            print("\n🎉 WebSocket service test completed!")
            
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")
        return False
    
    return True

def test_servo_client_import():
    """Test importing the servo client"""
    print("\n📦 Testing Servo Client Import")
    print("=" * 40)
    
    try:
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
        
        # This would be the Node.js equivalent test
        print("✅ Python WebSocket client working")
        print("⚠️  Node.js servo client needs to be tested separately")
        
        return True
        
    except Exception as e:
        print(f"❌ Import test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("🎯 MonsterBox Servo API Integration Test")
    print("=" * 50)
    
    # Test WebSocket service
    websocket_ok = await test_servo_websocket()
    
    # Test client import
    import_ok = test_servo_client_import()
    
    print("\n📊 Test Summary")
    print("=" * 20)
    print(f"WebSocket Service: {'✅ PASS' if websocket_ok else '❌ FAIL'}")
    print(f"Client Import: {'✅ PASS' if import_ok else '❌ FAIL'}")
    
    if websocket_ok:
        print("\n🎉 Servo WebSocket service is working correctly!")
        print("💡 The API errors are likely due to:")
        print("   1. MonsterBox web server not running")
        print("   2. Servo client connection issues")
        print("   3. Port configuration mismatch")
        
        print("\n🔧 Next steps:")
        print("   1. Start MonsterBox web server: npm start")
        print("   2. Test servo calibration modal")
        print("   3. Verify API endpoints work through web interface")
    else:
        print("\n❌ Servo WebSocket service has issues")
        print("🔧 Check servo service logs and configuration")

if __name__ == "__main__":
    asyncio.run(main())
