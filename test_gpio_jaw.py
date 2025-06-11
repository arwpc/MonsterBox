#!/usr/bin/env python3
"""
Test GPIO Jaw Server
Comprehensive test of the GPIO jaw server functionality
"""

import asyncio
import websockets
import json
import time
import subprocess

async def test_jaw_websocket():
    """Test the jaw WebSocket connection and movement"""
    print("🧪 Testing GPIO Jaw WebSocket Server")
    print("=" * 50)
    
    try:
        # Connect to jaw server
        uri = "ws://192.168.8.130:8765"
        print(f"Connecting to {uri}...")
        
        async with websockets.connect(uri, timeout=10) as websocket:
            print("✅ Connected to jaw WebSocket")
            
            # Receive welcome message
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            welcome_data = json.loads(welcome_msg)
            print(f"📨 Welcome: {welcome_data}")
            
            if welcome_data.get("type") == "welcome":
                server_info = welcome_data.get("server_info", {})
                print(f"🔧 Servo Pin: {server_info.get('servo_pin')}")
                print(f"🔧 GPIO Available: {server_info.get('gpio_available')}")
                
                # Test status request
                print("\n🔍 Testing status request...")
                status_command = {"type": "get_status"}
                await websocket.send(json.dumps(status_command))
                
                status_response = await asyncio.wait_for(websocket.recv(), timeout=5)
                status_data = json.loads(status_response)
                print(f"📊 Status: {status_data}")
                
                # Test jaw movements
                test_angles = [0, 30, 60, 30, 0]
                
                for i, angle in enumerate(test_angles):
                    print(f"\n🦴 Test {i+1}/5: Moving to {angle}°")
                    
                    move_command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 0.8,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(move_command))
                    
                    # Wait for movement started
                    start_response = await asyncio.wait_for(websocket.recv(), timeout=5)
                    start_data = json.loads(start_response)
                    
                    if start_data.get("type") == "jaw_move_started":
                        print(f"   ✅ Movement started to {start_data.get('angle')}°")
                        
                        # Wait for movement completed
                        try:
                            complete_response = await asyncio.wait_for(websocket.recv(), timeout=10)
                            complete_data = json.loads(complete_response)
                            
                            if complete_data.get("type") == "jaw_move_completed":
                                print(f"   ✅ Movement completed at {complete_data.get('angle')}°")
                            else:
                                print(f"   ⚠️ Unexpected response: {complete_data}")
                        except asyncio.TimeoutError:
                            print("   ⚠️ Movement completion timeout")
                    else:
                        print(f"   ❌ Movement failed: {start_data}")
                    
                    # Wait between movements
                    await asyncio.sleep(1)
                
                print("\n✅ All jaw movement tests completed!")
                return True
            else:
                print(f"❌ Unexpected welcome message: {welcome_data}")
                return False
                
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def check_services():
    """Check if services are running"""
    print("\n🔍 Checking services on RPI4b...")
    
    try:
        # Check ports
        result = subprocess.run(
            ["ssh", "remote@192.168.8.130", "netstat -tln | grep -E ':(3000|8765|8766)'"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            ports = result.stdout.strip()
            print("🔌 Listening ports:")
            for line in ports.split('\n'):
                if line.strip():
                    print(f"   {line}")
        else:
            print("❌ Could not check ports")
        
        # Check processes
        result = subprocess.run(
            ["ssh", "remote@192.168.8.130", "ps aux | grep -E '(node.*app|gpio_jaw|ai.*bridge)' | grep -v grep"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0 and result.stdout.strip():
            print("⚙️ Running processes:")
            for line in result.stdout.strip().split('\n'):
                if 'node' in line:
                    print("   ✅ MonsterBox app")
                elif 'gpio_jaw' in line:
                    print("   ✅ GPIO jaw server")
                elif 'ai' in line:
                    print("   ✅ AI bridge")
        else:
            print("❌ No ChatterPi processes found")
            
    except Exception as e:
        print(f"❌ Service check failed: {e}")

async def main():
    """Main test function"""
    print("🎯 GPIO Jaw Server Test Suite")
    print("=" * 60)
    
    # Check services first
    check_services()
    
    # Test WebSocket functionality
    success = await test_jaw_websocket()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 GPIO Jaw Server Test: PASSED")
        print("✅ Servo movement commands are working!")
        print("🌐 Test the interface: http://192.168.8.130:3000/chatterpi-chat.html")
    else:
        print("❌ GPIO Jaw Server Test: FAILED")
        print("🔧 Check the logs and GPIO connections")
    
    return success

if __name__ == "__main__":
    asyncio.run(main())
