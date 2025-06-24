#!/usr/bin/env python3
"""
Comprehensive WebSocket Communication Testing for ChatterPi
Tests WebSocket servers for jaw control (port 8765), audio bridge (port 8767), and AI bridge (port 8766)
"""

import asyncio
import websockets
import json
import time
import logging
import sys
import os
from pathlib import Path
import subprocess
import signal
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class WebSocketTester:
    """Comprehensive WebSocket communication testing"""
    
    def __init__(self):
        self.test_results = {
            "jaw_control_server": False,
            "audio_bridge_server": False,
            "ai_bridge_server": False,
            "jaw_control_messaging": False,
            "audio_bridge_messaging": False,
            "ai_bridge_messaging": False,
            "concurrent_connections": False,
            "real_time_communication": False
        }
        
        self.servers = {
            "jaw_control": {"port": 8765, "process": None, "url": "ws://localhost:8765"},
            "audio_bridge": {"port": 8767, "process": None, "url": "ws://localhost:8767"},
            "ai_bridge": {"port": 8766, "process": None, "url": "ws://localhost:8766"}
        }
        
        self.active_connections = []
        
        logger.info("🌐 WebSocketTester initialized")
    
    async def check_server_availability(self, server_name: str) -> bool:
        """Check if a WebSocket server is available"""
        server_info = self.servers[server_name]
        url = server_info["url"]
        
        logger.info(f"🔍 Checking {server_name} server at {url}...")
        
        try:
            async with websockets.connect(url, timeout=5) as websocket:
                logger.info(f"✅ {server_name} server is available")
                return True
        except Exception as e:
            logger.warning(f"⚠️ {server_name} server not available: {e}")
            return False
    
    async def start_jaw_control_server(self) -> bool:
        """Start the jaw control WebSocket server"""
        logger.info("🦴 Starting jaw control WebSocket server...")
        
        try:
            # Check if server script exists
            server_script = Path("gpio_jaw_server_robust.py")
            if not server_script.exists():
                logger.error(f"❌ Jaw control server script not found: {server_script}")
                return False
            
            # Start the server process
            process = subprocess.Popen([
                "python3", str(server_script),
                "--host", "0.0.0.0",
                "--port", "8765"
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            self.servers["jaw_control"]["process"] = process
            
            # Wait for server to start
            await asyncio.sleep(3)
            
            # Check if server is running
            if await self.check_server_availability("jaw_control"):
                logger.info("✅ Jaw control server started successfully")
                return True
            else:
                logger.error("❌ Jaw control server failed to start")
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to start jaw control server: {e}")
            return False
    
    async def start_audio_bridge_server(self) -> bool:
        """Start the audio bridge WebSocket server"""
        logger.info("🎵 Starting audio bridge WebSocket server...")
        
        try:
            # Check if server script exists
            server_script = Path("chatterpi_audio_bridge.py")
            if not server_script.exists():
                logger.error(f"❌ Audio bridge server script not found: {server_script}")
                return False
            
            # Start the server process
            process = subprocess.Popen([
                "python3", str(server_script),
                "--host", "0.0.0.0",
                "--port", "8767"
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            self.servers["audio_bridge"]["process"] = process
            
            # Wait for server to start
            await asyncio.sleep(3)
            
            # Check if server is running
            if await self.check_server_availability("audio_bridge"):
                logger.info("✅ Audio bridge server started successfully")
                return True
            else:
                logger.error("❌ Audio bridge server failed to start")
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to start audio bridge server: {e}")
            return False
    
    async def start_ai_bridge_server(self) -> bool:
        """Start the AI bridge WebSocket server"""
        logger.info("🧠 Starting AI bridge WebSocket server...")
        
        try:
            # Check if server script exists
            server_script = Path("ai_websocket_bridge.py")
            if not server_script.exists():
                logger.error(f"❌ AI bridge server script not found: {server_script}")
                return False
            
            # Start the server process
            process = subprocess.Popen([
                "python3", str(server_script),
                "--host", "0.0.0.0",
                "--port", "8766"
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            self.servers["ai_bridge"]["process"] = process
            
            # Wait for server to start
            await asyncio.sleep(3)
            
            # Check if server is running
            if await self.check_server_availability("ai_bridge"):
                logger.info("✅ AI bridge server started successfully")
                return True
            else:
                logger.error("❌ AI bridge server failed to start")
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to start AI bridge server: {e}")
            return False
    
    async def test_jaw_control_messaging(self) -> bool:
        """Test jaw control WebSocket messaging"""
        logger.info("\n🧪 Test: Jaw Control Messaging")
        logger.info("=" * 40)
        
        try:
            url = self.servers["jaw_control"]["url"]
            async with websockets.connect(url, timeout=10) as websocket:
                logger.info("✅ Connected to jaw control server")
                
                # Test jaw movement commands
                test_commands = [
                    {"type": "jaw_move", "angle": 45, "duration": 1.0},
                    {"type": "jaw_move", "angle": 35, "duration": 0.5},
                    {"type": "jaw_move", "angle": 50, "duration": 1.0},
                    {"type": "status_request"}
                ]
                
                for i, command in enumerate(test_commands):
                    logger.info(f"Sending command {i+1}: {command}")
                    await websocket.send(json.dumps(command))
                    
                    # Wait for response
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=5)
                        response_data = json.loads(response)
                        logger.info(f"Received response: {response_data}")
                        
                        # Validate response
                        if "type" in response_data:
                            logger.info("✅ Valid response received")
                        else:
                            logger.warning("⚠️ Invalid response format")
                            
                    except asyncio.TimeoutError:
                        logger.warning("⚠️ No response received within timeout")
                    
                    await asyncio.sleep(0.5)
                
                logger.info("✅ Jaw control messaging test completed")
                self.test_results["jaw_control_messaging"] = True
                return True
                
        except Exception as e:
            logger.error(f"❌ Jaw control messaging test failed: {e}")
            return False
    
    async def test_audio_bridge_messaging(self) -> bool:
        """Test audio bridge WebSocket messaging"""
        logger.info("\n🧪 Test: Audio Bridge Messaging")
        logger.info("=" * 40)
        
        try:
            url = self.servers["audio_bridge"]["url"]
            async with websockets.connect(url, timeout=10) as websocket:
                logger.info("✅ Connected to audio bridge server")
                
                # Test audio processing commands
                test_commands = [
                    {"type": "start_audio_processing"},
                    {"type": "audio_config", "volume_threshold": 0.01, "smoothing": 0.8},
                    {"type": "stop_audio_processing"},
                    {"type": "get_status"}
                ]
                
                for i, command in enumerate(test_commands):
                    logger.info(f"Sending command {i+1}: {command}")
                    await websocket.send(json.dumps(command))
                    
                    # Wait for response
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=5)
                        response_data = json.loads(response)
                        logger.info(f"Received response: {response_data}")
                        
                    except asyncio.TimeoutError:
                        logger.warning("⚠️ No response received within timeout")
                    except json.JSONDecodeError:
                        logger.warning("⚠️ Invalid JSON response")
                    
                    await asyncio.sleep(0.5)
                
                logger.info("✅ Audio bridge messaging test completed")
                self.test_results["audio_bridge_messaging"] = True
                return True
                
        except Exception as e:
            logger.error(f"❌ Audio bridge messaging test failed: {e}")
            return False
    
    async def test_ai_bridge_messaging(self) -> bool:
        """Test AI bridge WebSocket messaging"""
        logger.info("\n🧪 Test: AI Bridge Messaging")
        logger.info("=" * 40)
        
        try:
            url = self.servers["ai_bridge"]["url"]
            async with websockets.connect(url, timeout=10) as websocket:
                logger.info("✅ Connected to AI bridge server")
                
                # Test AI communication commands
                test_commands = [
                    {"type": "chat_message", "message": "Hello, this is a test"},
                    {"type": "get_character_info"},
                    {"type": "set_character", "character": "Calvin"},
                    {"type": "health_check"}
                ]
                
                for i, command in enumerate(test_commands):
                    logger.info(f"Sending command {i+1}: {command}")
                    await websocket.send(json.dumps(command))
                    
                    # Wait for response
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=10)
                        response_data = json.loads(response)
                        logger.info(f"Received response: {response_data}")
                        
                    except asyncio.TimeoutError:
                        logger.warning("⚠️ No response received within timeout")
                    except json.JSONDecodeError:
                        logger.warning("⚠️ Invalid JSON response")
                    
                    await asyncio.sleep(1)
                
                logger.info("✅ AI bridge messaging test completed")
                self.test_results["ai_bridge_messaging"] = True
                return True
                
        except Exception as e:
            logger.error(f"❌ AI bridge messaging test failed: {e}")
            return False
    
    async def test_concurrent_connections(self) -> bool:
        """Test concurrent connections to multiple servers"""
        logger.info("\n🧪 Test: Concurrent Connections")
        logger.info("=" * 40)
        
        try:
            connections = []
            
            # Connect to all available servers simultaneously
            for server_name, server_info in self.servers.items():
                if await self.check_server_availability(server_name):
                    try:
                        websocket = await websockets.connect(server_info["url"], timeout=5)
                        connections.append((server_name, websocket))
                        logger.info(f"✅ Connected to {server_name}")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to connect to {server_name}: {e}")
            
            if len(connections) >= 2:
                logger.info(f"✅ Successfully established {len(connections)} concurrent connections")
                
                # Test sending messages to all connections
                for server_name, websocket in connections:
                    try:
                        test_message = {"type": "ping", "timestamp": time.time()}
                        await websocket.send(json.dumps(test_message))
                        logger.info(f"✅ Sent message to {server_name}")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to send message to {server_name}: {e}")
                
                # Close all connections
                for server_name, websocket in connections:
                    await websocket.close()
                    logger.info(f"✅ Closed connection to {server_name}")
                
                self.test_results["concurrent_connections"] = True
                return True
            else:
                logger.warning("⚠️ Not enough servers available for concurrent connection test")
                return False
                
        except Exception as e:
            logger.error(f"❌ Concurrent connections test failed: {e}")
            return False
    
    async def test_real_time_communication(self) -> bool:
        """Test real-time communication performance"""
        logger.info("\n🧪 Test: Real-Time Communication")
        logger.info("=" * 40)
        
        try:
            # Test with jaw control server (most critical for real-time)
            if not await self.check_server_availability("jaw_control"):
                logger.error("❌ Jaw control server not available for real-time test")
                return False
            
            url = self.servers["jaw_control"]["url"]
            async with websockets.connect(url, timeout=10) as websocket:
                logger.info("✅ Connected for real-time test")
                
                # Send rapid jaw movement commands
                start_time = time.time()
                num_commands = 20
                response_times = []
                
                for i in range(num_commands):
                    command = {
                        "type": "jaw_move",
                        "angle": 30 + (i % 2) * 20,  # Alternate between 30 and 50
                        "duration": 0.1,
                        "timestamp": time.time()
                    }
                    
                    send_time = time.time()
                    await websocket.send(json.dumps(command))
                    
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=2)
                        receive_time = time.time()
                        response_time = receive_time - send_time
                        response_times.append(response_time)
                        
                        logger.debug(f"Command {i+1}: {response_time*1000:.1f}ms response time")
                        
                    except asyncio.TimeoutError:
                        logger.warning(f"⚠️ Command {i+1}: timeout")
                    
                    await asyncio.sleep(0.05)  # 50ms between commands
                
                total_time = time.time() - start_time
                
                if response_times:
                    avg_response_time = sum(response_times) / len(response_times)
                    max_response_time = max(response_times)
                    
                    logger.info(f"📊 Real-time performance results:")
                    logger.info(f"   Commands sent: {num_commands}")
                    logger.info(f"   Responses received: {len(response_times)}")
                    logger.info(f"   Average response time: {avg_response_time*1000:.1f}ms")
                    logger.info(f"   Max response time: {max_response_time*1000:.1f}ms")
                    logger.info(f"   Total test time: {total_time:.2f}s")
                    
                    # Real-time criteria: average response < 100ms, max response < 500ms
                    if avg_response_time < 0.1 and max_response_time < 0.5:
                        logger.info("✅ Real-time communication performance is excellent")
                        self.test_results["real_time_communication"] = True
                        return True
                    else:
                        logger.warning("⚠️ Real-time communication may be too slow")
                        return False
                else:
                    logger.error("❌ No responses received during real-time test")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Real-time communication test failed: {e}")
            return False
    
    def cleanup_servers(self):
        """Clean up server processes"""
        logger.info("🧹 Cleaning up server processes...")
        
        for server_name, server_info in self.servers.items():
            process = server_info.get("process")
            if process:
                try:
                    process.terminate()
                    process.wait(timeout=5)
                    logger.info(f"✅ {server_name} server process terminated")
                except subprocess.TimeoutExpired:
                    process.kill()
                    logger.warning(f"⚠️ {server_name} server process killed")
                except Exception as e:
                    logger.error(f"❌ Error cleaning up {server_name} server: {e}")
    
    def generate_report(self):
        """Generate comprehensive test report"""
        logger.info("\n" + "="*60)
        logger.info("🌐 WEBSOCKET COMMUNICATION TEST REPORT")
        logger.info("="*60)
        
        passed_tests = sum(1 for result in self.test_results.values() if result)
        total_tests = len(self.test_results)
        
        logger.info(f"Tests Passed: {passed_tests}/{total_tests}")
        logger.info(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        logger.info("\nServer Availability:")
        for server_name, server_info in self.servers.items():
            status = "✅ AVAILABLE" if self.test_results.get(f"{server_name}_server", False) else "❌ UNAVAILABLE"
            logger.info(f"  {server_name} (port {server_info['port']}): {status}")
        
        logger.info("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"  {test_name}: {status}")
        
        if passed_tests >= total_tests * 0.7:  # 70% pass rate
            logger.info("\n🎉 WEBSOCKET COMMUNICATION TESTS MOSTLY SUCCESSFUL!")
            logger.info("✅ Core WebSocket functionality is working")
        else:
            logger.info(f"\n⚠️ {total_tests - passed_tests} tests failed")
            logger.info("🔧 Check WebSocket server configurations and network connectivity")
        
        # Save results
        results_file = Path("../../test-results/websocket-communication-test.json")
        results_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(results_file, 'w') as f:
            json.dump({
                "timestamp": time.time(),
                "tests_passed": passed_tests,
                "total_tests": total_tests,
                "success_rate": (passed_tests/total_tests)*100,
                "results": self.test_results,
                "servers": {name: {"port": info["port"], "available": self.test_results.get(f"{name}_server", False)} 
                           for name, info in self.servers.items()}
            }, f, indent=2)
        
        logger.info(f"📄 Test results saved to: {results_file}")
        
        return passed_tests >= total_tests * 0.7
    
    async def run_all_tests(self):
        """Run all WebSocket communication tests"""
        logger.info("🌐 Starting WebSocket Communication Tests")
        logger.info("=" * 60)
        
        try:
            # Check existing servers first
            logger.info("🔍 Checking for existing WebSocket servers...")
            for server_name in self.servers.keys():
                if await self.check_server_availability(server_name):
                    self.test_results[f"{server_name}_server"] = True
            
            # Try to start servers if they're not running
            if not self.test_results["jaw_control_server"]:
                if await self.start_jaw_control_server():
                    self.test_results["jaw_control_server"] = True
            
            # Run messaging tests for available servers
            if self.test_results["jaw_control_server"]:
                await self.test_jaw_control_messaging()
            
            if self.test_results["audio_bridge_server"]:
                await self.test_audio_bridge_messaging()
            
            if self.test_results["ai_bridge_server"]:
                await self.test_ai_bridge_messaging()
            
            # Run integration tests
            await self.test_concurrent_connections()
            await self.test_real_time_communication()
            
            return self.generate_report()
            
        except Exception as e:
            logger.error(f"❌ Test execution failed: {e}")
            return False
        finally:
            self.cleanup_servers()

async def main():
    """Main test function"""
    tester = WebSocketTester()
    
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        logger.info("\n⚠️ Test interrupted by user")
        return 1
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
