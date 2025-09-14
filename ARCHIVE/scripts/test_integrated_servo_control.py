#!/usr/bin/env python3

"""
Test script for integrated servo control system
Tests the enhanced servo WebSocket service with calibrated control
"""

import asyncio
import json
import websockets
import time

class ServoControlTester:
    def __init__(self, host='localhost', port=8779):
        self.host = host
        self.port = port
        self.websocket = None
        
    async def connect(self):
        """Connect to servo WebSocket service"""
        try:
            uri = f"ws://{self.host}:{self.port}"
            print(f"🔌 Connecting to servo service at {uri}")
            self.websocket = await websockets.connect(uri)

            # Wait for welcome message
            welcome = await self.websocket.recv()
            welcome_data = json.loads(welcome)
            print(f"✅ Connected to servo service: {welcome_data.get('message', 'Connected')}")
            return True
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from servo service"""
        if self.websocket:
            await self.websocket.close()
            print("🔌 Disconnected from servo service")
    
    async def send_message(self, message):
        """Send message and wait for response"""
        try:
            await self.websocket.send(json.dumps(message))
            response = await self.websocket.recv()
            return json.loads(response)
        except Exception as e:
            print(f"❌ Error sending message: {e}")
            return None
    
    async def test_get_capabilities(self):
        """Test getting service capabilities"""
        print("\n🔧 Testing service capabilities...")
        message = {"type": "get_capabilities"}
        response = await self.send_message(message)
        
        if response:
            print("✅ Service capabilities:")
            for key, value in response.items():
                print(f"   {key}: {value}")
        else:
            print("❌ Failed to get capabilities")
    
    async def test_get_servo_configs(self):
        """Test getting servo configurations"""
        print("\n🔧 Testing servo configurations...")
        message = {"type": "get_servo_configs"}
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print("✅ Servo configurations:")
            configs = response.get('servo_configs', {})
            for servo_id, config in configs.items():
                print(f"   Servo {servo_id}: {config.get('name')} ({config.get('servo_type')})")
        else:
            print("❌ Failed to get servo configurations")
        
        return response
    
    async def test_get_positions(self, servo_id=None):
        """Test getting saved positions"""
        print(f"\n📍 Testing saved positions for servo {servo_id or 'all'}...")
        message = {"type": "servo_get_positions"}
        if servo_id:
            message["servo_id"] = servo_id
            
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print("✅ Saved positions:")
            if servo_id:
                saved = response.get('saved_positions', {})
                calibrated = response.get('calibrated_positions', {})
                print(f"   Saved positions: {list(saved.keys())}")
                print(f"   Calibrated positions: {list(calibrated.keys())}")
            else:
                all_saved = response.get('all_saved_positions', {})
                all_calibrated = response.get('all_calibrations', {})
                print(f"   Total servos with saved positions: {len(all_saved)}")
                print(f"   Total servos with calibrations: {len(all_calibrated)}")
        else:
            print("❌ Failed to get positions")
        
        return response
    
    async def test_continuous_control(self, servo_id):
        """Test continuous servo control"""
        print(f"\n🎮 Testing continuous control for servo {servo_id}...")
        
        # Test clockwise rotation
        print("   Testing clockwise rotation...")
        message = {
            "type": "servo_continuous_control",
            "servo_id": servo_id,
            "direction": "cw",
            "speed": "slow",
            "duration": 2.0
        }
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print(f"   ✅ CW rotation: {response.get('message')}")
            await asyncio.sleep(2.5)  # Wait for movement to complete
        else:
            print(f"   ❌ CW rotation failed: {response}")
        
        # Test counter-clockwise rotation
        print("   Testing counter-clockwise rotation...")
        message = {
            "type": "servo_continuous_control",
            "servo_id": servo_id,
            "direction": "ccw",
            "speed": "slow",
            "duration": 2.0
        }
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print(f"   ✅ CCW rotation: {response.get('message')}")
            await asyncio.sleep(2.5)  # Wait for movement to complete
        else:
            print(f"   ❌ CCW rotation failed: {response}")
        
        # Test stop
        print("   Testing stop...")
        message = {
            "type": "servo_continuous_control",
            "servo_id": servo_id,
            "direction": "stop"
        }
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print(f"   ✅ Stop: {response.get('message')}")
        else:
            print(f"   ❌ Stop failed: {response}")
    
    async def test_extension_control(self, servo_id):
        """Test servo extension control"""
        print(f"\n🔧 Testing extension control for servo {servo_id}...")
        
        # Test extend
        print("   Testing extend...")
        message = {
            "type": "servo_extension_control",
            "servo_id": servo_id,
            "action": "extend",
            "speed": "slow"
        }
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print(f"   ✅ Extend: {response.get('message')}")
            await asyncio.sleep(3.5)  # Wait for movement to complete
        else:
            print(f"   ❌ Extend failed: {response}")
        
        # Test retract
        print("   Testing retract...")
        message = {
            "type": "servo_extension_control",
            "servo_id": servo_id,
            "action": "retract",
            "speed": "slow"
        }
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print(f"   ✅ Retract: {response.get('message')}")
            await asyncio.sleep(3.5)  # Wait for movement to complete
        else:
            print(f"   ❌ Retract failed: {response}")
    
    async def test_save_position(self, servo_id, position_name):
        """Test saving a position"""
        print(f"\n💾 Testing save position '{position_name}' for servo {servo_id}...")
        
        message = {
            "type": "servo_save_position",
            "servo_id": servo_id,
            "position_name": position_name,
            "description": f"Test position: {position_name}"
        }
        response = await self.send_message(message)
        
        if response and response.get('status') == 'success':
            print(f"   ✅ Position saved: {response.get('message')}")
        else:
            print(f"   ❌ Save position failed: {response}")
        
        return response
    
    async def run_tests(self):
        """Run all tests"""
        print("🎯 Starting Integrated Servo Control Tests")
        print("==========================================")
        
        if not await self.connect():
            return
        
        try:
            # Test basic functionality
            await self.test_get_capabilities()
            servo_configs = await self.test_get_servo_configs()
            await self.test_get_positions()
            
            # Find a servo to test with
            test_servo_id = None
            if servo_configs and servo_configs.get('status') == 'success':
                configs = servo_configs.get('servo_configs', {})
                if configs:
                    test_servo_id = list(configs.keys())[0]
                    print(f"\n🎯 Using servo {test_servo_id} for testing")
            
            if test_servo_id:
                # Test position management
                await self.test_get_positions(test_servo_id)
                await self.test_save_position(test_servo_id, "test_position")
                
                # Test control methods based on servo type
                configs = servo_configs.get('servo_configs', {})
                servo_config = configs.get(test_servo_id, {})
                servo_type = servo_config.get('servo_type', '').lower()
                
                if 'continuous' in servo_type or 'stingray' in servo_type:
                    print(f"   Detected continuous rotation servo")
                    await self.test_continuous_control(test_servo_id)
                else:
                    print(f"   Detected standard servo")
                    await self.test_extension_control(test_servo_id)
            else:
                print("⚠️  No servos found for testing")
            
            print("\n🎉 All tests completed!")
            
        except Exception as e:
            print(f"❌ Test error: {e}")
        finally:
            await self.disconnect()


async def main():
    """Main test function"""
    tester = ServoControlTester()
    await tester.run_tests()


if __name__ == "__main__":
    asyncio.run(main())
