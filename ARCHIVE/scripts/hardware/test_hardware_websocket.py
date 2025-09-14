#!/usr/bin/env python3
"""
Test Script for Hardware WebSocket Services
Tests all hardware services and functionality
"""

import asyncio
import json
import logging
import websockets
import sys
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HardwareWebSocketTester:
    """Test class for hardware WebSocket services"""
    
    def __init__(self):
        self.main_server_url = "ws://localhost:8780"
        self.motor_service_url = "ws://localhost:8771"
        self.light_service_url = "ws://localhost:8772"
        self.registry_url = "ws://localhost:8770"
        
    async def test_main_server(self):
        """Test main hardware server"""
        logger.info("🧪 Testing Main Hardware Server...")
        
        try:
            async with websockets.connect(self.main_server_url) as websocket:
                # Test welcome message
                welcome = await websocket.recv()
                welcome_data = json.loads(welcome)
                logger.info(f"✅ Received welcome: {welcome_data.get('message')}")
                
                # Test get active services
                await websocket.send(json.dumps({"type": "get_active_services"}))
                response = await websocket.recv()
                services_data = json.loads(response)
                logger.info(f"✅ Active services: {services_data.get('active_services', {}).keys()}")
                
                # Test get available characters
                await websocket.send(json.dumps({"type": "get_available_characters"}))
                response = await websocket.recv()
                chars_data = json.loads(response)
                logger.info(f"✅ Available characters: {len(chars_data.get('characters', []))}")
                
                # Test ping
                await websocket.send(json.dumps({"type": "ping"}))
                response = await websocket.recv()
                ping_data = json.loads(response)
                logger.info(f"✅ Ping response: {ping_data.get('type')}")
                
                return True
                
        except Exception as e:
            logger.error(f"❌ Main server test failed: {e}")
            return False
            
    async def test_motor_service(self):
        """Test motor WebSocket service"""
        logger.info("🧪 Testing Motor Service...")
        
        try:
            async with websockets.connect(self.motor_service_url) as websocket:
                # Test welcome message
                welcome = await websocket.recv()
                welcome_data = json.loads(welcome)
                logger.info(f"✅ Motor service welcome: {welcome_data.get('service')}")
                
                # Test motor control
                motor_command = {
                    "type": "motor_control",
                    "motor_id": "test_motor",
                    "direction": "forward",
                    "speed": 50,
                    "duration": 1000,
                    "pin": 20
                }
                await websocket.send(json.dumps(motor_command))
                response = await websocket.recv()
                motor_data = json.loads(response)
                logger.info(f"✅ Motor control response: {motor_data.get('status')}")
                
                # Test motor status
                await websocket.send(json.dumps({"type": "motor_status"}))
                response = await websocket.recv()
                status_data = json.loads(response)
                logger.info(f"✅ Motor status: {status_data.get('active_count', 0)} active motors")
                
                return True
                
        except Exception as e:
            logger.error(f"❌ Motor service test failed: {e}")
            return False
            
    async def test_light_service(self):
        """Test light WebSocket service"""
        logger.info("🧪 Testing Light Service...")
        
        try:
            async with websockets.connect(self.light_service_url) as websocket:
                # Test welcome message
                welcome = await websocket.recv()
                welcome_data = json.loads(welcome)
                logger.info(f"✅ Light service welcome: {welcome_data.get('service')}")
                
                # Test light control
                light_command = {
                    "type": "light_control",
                    "light_id": "test_light",
                    "pin": 21,
                    "state": "on",
                    "duration": 2000
                }
                await websocket.send(json.dumps(light_command))
                response = await websocket.recv()
                light_data = json.loads(response)
                logger.info(f"✅ Light control response: {light_data.get('status')}")
                
                # Wait a moment
                await asyncio.sleep(1)
                
                # Test light toggle
                await websocket.send(json.dumps({
                    "type": "light_toggle",
                    "light_id": "test_light",
                    "pin": 21
                }))
                response = await websocket.recv()
                toggle_data = json.loads(response)
                logger.info(f"✅ Light toggle: {toggle_data.get('previous_state')} -> {toggle_data.get('new_state')}")
                
                # Test light status
                await websocket.send(json.dumps({"type": "light_status"}))
                response = await websocket.recv()
                status_data = json.loads(response)
                logger.info(f"✅ Light status: {status_data.get('light_count', 0)} tracked lights")
                
                return True
                
        except Exception as e:
            logger.error(f"❌ Light service test failed: {e}")
            return False
            
    async def test_service_registry(self):
        """Test service registry"""
        logger.info("🧪 Testing Service Registry...")
        
        try:
            async with websockets.connect(self.registry_url) as websocket:
                # Test get services
                await websocket.send(json.dumps({"type": "get_services"}))
                response = await websocket.recv()
                services_data = json.loads(response)
                logger.info(f"✅ Registry services: {services_data.get('count', 0)} registered")
                
                return True
                
        except Exception as e:
            logger.error(f"❌ Service registry test failed: {e}")
            return False
            
    async def test_character_switching(self):
        """Test character switching functionality"""
        logger.info("🧪 Testing Character Switching...")
        
        try:
            async with websockets.connect(self.main_server_url) as websocket:
                # Skip welcome message
                await websocket.recv()
                
                # Test character switch
                switch_command = {
                    "type": "switch_character",
                    "character_id": 4
                }
                await websocket.send(json.dumps(switch_command))
                response = await websocket.recv()
                switch_data = json.loads(response)
                logger.info(f"✅ Character switch response: {switch_data.get('status')}")
                
                # Wait for services to start
                await asyncio.sleep(2)
                
                # Check active services
                await websocket.send(json.dumps({"type": "get_active_services"}))
                response = await websocket.recv()
                services_data = json.loads(response)
                active_services = services_data.get('active_services', {})
                logger.info(f"✅ Active services after switch: {list(active_services.keys())}")
                
                return True
                
        except Exception as e:
            logger.error(f"❌ Character switching test failed: {e}")
            return False
            
    async def test_light_sequence(self):
        """Test light sequence functionality"""
        logger.info("🧪 Testing Light Sequence...")
        
        try:
            async with websockets.connect(self.light_service_url) as websocket:
                # Skip welcome message
                await websocket.recv()
                
                # Test light sequence
                sequence_command = {
                    "type": "light_sequence",
                    "sequence": [
                        {"light_id": "seq1", "pin": 21, "state": "on", "duration": 500, "delay": 200},
                        {"light_id": "seq2", "pin": 22, "state": "on", "duration": 500, "delay": 200},
                        {"light_id": "seq1", "pin": 21, "state": "off", "duration": 0, "delay": 200},
                        {"light_id": "seq2", "pin": 22, "state": "off", "duration": 0, "delay": 0}
                    ],
                    "repeat": 2
                }
                await websocket.send(json.dumps(sequence_command))
                response = await websocket.recv()
                seq_data = json.loads(response)
                logger.info(f"✅ Light sequence started: {seq_data.get('status')}")
                
                # Listen for sequence updates
                for i in range(5):  # Listen for a few updates
                    try:
                        update = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                        update_data = json.loads(update)
                        if update_data.get('type') == 'light_sequence_step':
                            logger.info(f"✅ Sequence step: cycle {update_data.get('cycle')}, step {update_data.get('step')}")
                        elif update_data.get('type') == 'light_sequence_complete':
                            logger.info(f"✅ Sequence completed: {update_data.get('cycles_completed')} cycles")
                            break
                    except asyncio.TimeoutError:
                        break
                        
                return True
                
        except Exception as e:
            logger.error(f"❌ Light sequence test failed: {e}")
            return False
            
    async def run_all_tests(self):
        """Run all tests"""
        logger.info("🚀 Starting Hardware WebSocket Service Tests...")
        
        tests = [
            ("Main Server", self.test_main_server),
            ("Motor Service", self.test_motor_service),
            ("Light Service", self.test_light_service),
            ("Service Registry", self.test_service_registry),
            ("Character Switching", self.test_character_switching),
            ("Light Sequence", self.test_light_sequence)
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            logger.info(f"\n{'='*50}")
            logger.info(f"Running test: {test_name}")
            logger.info(f"{'='*50}")
            
            try:
                result = await test_func()
                if result:
                    logger.info(f"✅ {test_name} test PASSED")
                    passed += 1
                else:
                    logger.error(f"❌ {test_name} test FAILED")
                    failed += 1
            except Exception as e:
                logger.error(f"❌ {test_name} test ERROR: {e}")
                failed += 1
                
            # Wait between tests
            await asyncio.sleep(1)
            
        # Print summary
        logger.info(f"\n{'='*50}")
        logger.info(f"TEST SUMMARY")
        logger.info(f"{'='*50}")
        logger.info(f"✅ Passed: {passed}")
        logger.info(f"❌ Failed: {failed}")
        logger.info(f"📊 Total:  {passed + failed}")
        
        if failed == 0:
            logger.info("🎉 All tests passed!")
            return True
        else:
            logger.error(f"💥 {failed} tests failed!")
            return False

async def main():
    """Main function"""
    tester = HardwareWebSocketTester()
    
    try:
        success = await tester.run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("⚠️ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Test runner error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
