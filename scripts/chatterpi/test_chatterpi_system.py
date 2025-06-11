#!/usr/bin/env python3
"""
Comprehensive ChatterPi System Test
Tests jaw control, WebSocket server, and browser integration
"""

import asyncio
import websockets
import json
import time
import logging
import subprocess
import sys
from typing import Dict, Any, List
import threading

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ChatterPiTester:
    """Comprehensive tester for ChatterPi system"""
    
    def __init__(self, host="localhost", jaw_port=8765, ai_port=8766):
        self.host = host
        self.jaw_port = jaw_port
        self.ai_port = ai_port
        self.test_results = []
        self.jaw_websocket = None
        self.ai_websocket = None
        
    async def test_jaw_websocket_connection(self) -> bool:
        """Test jaw WebSocket server connection"""
        try:
            logger.info("🔍 Testing jaw WebSocket connection...")
            uri = f"ws://{self.host}:{self.jaw_port}"
            
            async with websockets.connect(uri, timeout=5) as websocket:
                self.jaw_websocket = websocket
                
                # Wait for welcome message
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                welcome_data = json.loads(welcome_msg)
                
                if welcome_data.get("type") == "welcome":
                    logger.info("✅ Jaw WebSocket connection successful")
                    logger.info(f"   Server info: {welcome_data.get('server_info', {})}")
                    return True
                else:
                    logger.error(f"❌ Unexpected welcome message: {welcome_data}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Jaw WebSocket connection failed: {e}")
            return False
    
    async def test_jaw_movement_commands(self) -> bool:
        """Test jaw movement commands"""
        try:
            logger.info("🔍 Testing jaw movement commands...")
            uri = f"ws://{self.host}:{self.jaw_port}"
            
            async with websockets.connect(uri, timeout=5) as websocket:
                # Skip welcome message
                await websocket.recv()
                
                # Test different jaw positions
                test_angles = [0, 45, 90, 45, 0]
                
                for angle in test_angles:
                    logger.info(f"   Testing angle: {angle}°")
                    
                    # Send jaw move command
                    command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 0.5,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(command))
                    
                    # Wait for response
                    response = await asyncio.wait_for(websocket.recv(), timeout=3)
                    response_data = json.loads(response)
                    
                    if response_data.get("type") == "jaw_move_started":
                        logger.info(f"   ✅ Jaw moved to {angle}° successfully")
                        await asyncio.sleep(0.6)  # Wait for movement to complete
                    else:
                        logger.error(f"   ❌ Jaw movement failed: {response_data}")
                        return False
                
                logger.info("✅ All jaw movement commands successful")
                return True
                
        except Exception as e:
            logger.error(f"❌ Jaw movement test failed: {e}")
            return False
    
    async def test_jaw_status_commands(self) -> bool:
        """Test jaw status and position commands"""
        try:
            logger.info("🔍 Testing jaw status commands...")
            uri = f"ws://{self.host}:{self.jaw_port}"
            
            async with websockets.connect(uri, timeout=5) as websocket:
                # Skip welcome message
                await websocket.recv()
                
                # Test get_status command
                status_command = {"type": "get_status"}
                await websocket.send(json.dumps(status_command))
                
                status_response = await asyncio.wait_for(websocket.recv(), timeout=3)
                status_data = json.loads(status_response)
                
                if status_data.get("type") == "status_response":
                    logger.info("✅ Status command successful")
                    logger.info(f"   Jaw status: {status_data.get('jaw_status', {})}")
                    logger.info(f"   Server status: {status_data.get('server_status', {})}")
                else:
                    logger.error(f"❌ Status command failed: {status_data}")
                    return False
                
                # Test get_position command
                position_command = {"type": "get_position"}
                await websocket.send(json.dumps(position_command))
                
                position_response = await asyncio.wait_for(websocket.recv(), timeout=3)
                position_data = json.loads(position_response)
                
                if position_data.get("type") == "position_response":
                    logger.info("✅ Position command successful")
                    logger.info(f"   Current position: {position_data.get('position', {})}")
                    return True
                else:
                    logger.error(f"❌ Position command failed: {position_data}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Status commands test failed: {e}")
            return False
    
    async def test_browser_simulation(self) -> bool:
        """Simulate browser interactions"""
        try:
            logger.info("🔍 Testing browser simulation...")
            uri = f"ws://{self.host}:{self.jaw_port}"
            
            # Simulate 10 browser interactions
            for i in range(10):
                logger.info(f"   Browser interaction {i+1}/10")
                
                async with websockets.connect(uri, timeout=5) as websocket:
                    # Skip welcome message
                    await websocket.recv()
                    
                    # Subscribe to events (like browser would)
                    subscribe_command = {
                        "type": "subscribe",
                        "events": ["jaw_movement", "jaw_stopped"]
                    }
                    await websocket.send(json.dumps(subscribe_command))
                    await websocket.recv()  # subscription confirmation
                    
                    # Simulate user typing and jaw movement
                    test_angle = 30 + (i * 15) % 90  # Vary angles
                    
                    jaw_command = {
                        "type": "jaw_move",
                        "angle": test_angle,
                        "duration": 0.3,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(jaw_command))
                    response = await asyncio.wait_for(websocket.recv(), timeout=3)
                    response_data = json.loads(response)
                    
                    if response_data.get("type") == "jaw_move_started":
                        logger.info(f"   ✅ Interaction {i+1} successful (angle: {test_angle}°)")
                    else:
                        logger.error(f"   ❌ Interaction {i+1} failed: {response_data}")
                        return False
                    
                    await asyncio.sleep(0.5)  # Simulate user pause
            
            logger.info("✅ All 10 browser interactions successful")
            return True
            
        except Exception as e:
            logger.error(f"❌ Browser simulation failed: {e}")
            return False
    
    def start_jaw_server(self) -> bool:
        """Start the jaw WebSocket server"""
        try:
            logger.info("🚀 Starting jaw WebSocket server...")
            
            # Kill any existing server
            subprocess.run(["pkill", "-f", "jaw_websocket_server"], capture_output=True)
            time.sleep(1)
            
            # Start new server
            cmd = [
                "python3", "-u", "jaw_websocket_server.py",
                "--host", "0.0.0.0",
                "--port", str(self.jaw_port),
                "--servo-pin", "18"
            ]
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )
            
            # Wait for server to start
            time.sleep(3)
            
            if process.poll() is None:
                logger.info("✅ Jaw WebSocket server started successfully")
                return True
            else:
                logger.error("❌ Jaw WebSocket server failed to start")
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to start jaw server: {e}")
            return False
    
    async def run_all_tests(self) -> Dict[str, bool]:
        """Run all tests and return results"""
        logger.info("🎯 Starting comprehensive ChatterPi system test...")
        
        results = {}
        
        # Test 1: WebSocket Connection
        results["websocket_connection"] = await self.test_jaw_websocket_connection()
        
        # Test 2: Jaw Movement Commands
        if results["websocket_connection"]:
            results["jaw_movement"] = await self.test_jaw_movement_commands()
        else:
            results["jaw_movement"] = False
        
        # Test 3: Status Commands
        if results["websocket_connection"]:
            results["status_commands"] = await self.test_jaw_status_commands()
        else:
            results["status_commands"] = False
        
        # Test 4: Browser Simulation (10 interactions)
        if results["websocket_connection"]:
            results["browser_simulation"] = await self.test_browser_simulation()
        else:
            results["browser_simulation"] = False
        
        return results
    
    def print_test_summary(self, results: Dict[str, bool]):
        """Print test summary"""
        logger.info("\n" + "="*60)
        logger.info("🎯 CHATTERPI SYSTEM TEST SUMMARY")
        logger.info("="*60)
        
        total_tests = len(results)
        passed_tests = sum(results.values())
        
        for test_name, passed in results.items():
            status = "✅ PASS" if passed else "❌ FAIL"
            logger.info(f"{test_name.replace('_', ' ').title()}: {status}")
        
        logger.info("-"*60)
        logger.info(f"Total Tests: {total_tests}")
        logger.info(f"Passed: {passed_tests}")
        logger.info(f"Failed: {total_tests - passed_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if passed_tests == total_tests:
            logger.info("🎉 ALL TESTS PASSED! ChatterPi system is working perfectly!")
        else:
            logger.info("⚠️  Some tests failed. Check the logs above for details.")
        
        logger.info("="*60)

async def main():
    """Main test function"""
    tester = ChatterPiTester(host="localhost")
    
    # Start the jaw server
    if not tester.start_jaw_server():
        logger.error("❌ Failed to start jaw server. Exiting.")
        sys.exit(1)
    
    # Run all tests
    results = await tester.run_all_tests()
    
    # Print summary
    tester.print_test_summary(results)
    
    # Exit with appropriate code
    if all(results.values()):
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
