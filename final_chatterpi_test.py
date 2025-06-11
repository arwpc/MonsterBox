#!/usr/bin/env python3
"""
Final ChatterPi System Test
Comprehensive test that deploys and tests the entire ChatterPi system
"""

import subprocess
import time
import sys
import asyncio
import websockets
import json
import requests
from pathlib import Path

class FinalChatterPiTest:
    def __init__(self):
        self.remote_host = "192.168.8.130"
        self.remote_user = "remote"
        self.remote_path = "~/MonsterBox"
        self.test_results = {}
        
    def log(self, message):
        """Log with timestamp"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {message}")
        
    def run_command(self, command, timeout=30):
        """Run command and return success, stdout, stderr"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return result.returncode == 0, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return False, "", "Command timed out"
        except Exception as e:
            return False, "", str(e)
    
    def ssh_command(self, command, timeout=30):
        """Run SSH command"""
        full_command = f"ssh {self.remote_user}@{self.remote_host} \"{command}\""
        return self.run_command(full_command, timeout)
    
    def test_connectivity(self):
        """Test basic connectivity"""
        self.log("🔍 Testing connectivity to RPI4b...")
        
        # Test ping
        success, stdout, stderr = self.run_command(f"ping -n 1 {self.remote_host}")
        if not success:
            self.log(f"❌ Ping failed: {stderr}")
            return False
        
        # Test SSH
        success, stdout, stderr = self.ssh_command("echo 'SSH OK'")
        if success and "SSH OK" in stdout:
            self.log("✅ Connectivity test passed")
            return True
        else:
            self.log(f"❌ SSH failed: {stderr}")
            return False
    
    def deploy_files(self):
        """Deploy ChatterPi files"""
        self.log("📁 Deploying ChatterPi files...")
        
        # Copy ChatterPi scripts
        success, stdout, stderr = self.run_command(f"scp -r scripts/chatterpi {self.remote_user}@{self.remote_host}:{self.remote_path}/scripts/")
        if not success:
            self.log(f"❌ Failed to copy scripts: {stderr}")
            return False
        
        # Copy HTML files
        success, stdout, stderr = self.run_command(f"scp public/chatterpi-*.html {self.remote_user}@{self.remote_host}:{self.remote_path}/public/")
        if not success:
            self.log(f"❌ Failed to copy HTML files: {stderr}")
            return False
        
        self.log("✅ Files deployed successfully")
        return True
    
    def start_services(self):
        """Start MonsterBox and ChatterPi services"""
        self.log("🚀 Starting services...")
        
        # Kill existing processes
        self.ssh_command("pkill -f 'node.*app.js'")
        self.ssh_command("pkill -f 'jaw.*server'")
        time.sleep(2)
        
        # Start MonsterBox main app
        success, stdout, stderr = self.ssh_command(f"cd {self.remote_path} && nohup node --no-deprecation app.js > app.log 2>&1 &")
        if not success:
            self.log(f"❌ Failed to start main app: {stderr}")
            return False
        
        time.sleep(5)
        
        # Start minimal jaw server
        success, stdout, stderr = self.ssh_command(f"cd {self.remote_path}/scripts/chatterpi && nohup python3 minimal_jaw_server.py --host 0.0.0.0 --port 8765 > jaw.log 2>&1 &")
        if not success:
            self.log(f"❌ Failed to start jaw server: {stderr}")
            return False
        
        time.sleep(3)
        
        # Check if services are running
        success, stdout, stderr = self.ssh_command("ps aux | grep -E '(node.*app|minimal_jaw)' | grep -v grep")
        if success and "node" in stdout and "minimal_jaw" in stdout:
            self.log("✅ Services started successfully")
            return True
        else:
            self.log(f"❌ Services not running properly: {stdout}")
            return False
    
    def test_web_access(self):
        """Test web interface access"""
        self.log("🌐 Testing web interface...")
        
        try:
            # Test main page
            response = requests.get(f"http://{self.remote_host}:3000", timeout=10)
            if response.status_code == 200:
                self.log("✅ Main web interface accessible")
            else:
                self.log(f"❌ Main web interface returned {response.status_code}")
                return False
            
            # Test ChatterPi page
            response = requests.get(f"http://{self.remote_host}:3000/chatterpi-chat.html", timeout=10)
            if response.status_code == 200:
                self.log("✅ ChatterPi web interface accessible")
                return True
            else:
                self.log(f"❌ ChatterPi web interface returned {response.status_code}")
                return False
                
        except Exception as e:
            self.log(f"❌ Web access test failed: {e}")
            return False
    
    async def test_websocket_connection(self):
        """Test WebSocket connection"""
        self.log("🔌 Testing WebSocket connection...")
        
        try:
            uri = f"ws://{self.remote_host}:8765"
            async with websockets.connect(uri, timeout=10) as websocket:
                # Wait for welcome message
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                welcome_data = json.loads(welcome_msg)
                
                if welcome_data.get("type") == "welcome":
                    self.log("✅ WebSocket connection successful")
                    self.log(f"   Server info: {welcome_data.get('server_info', {})}")
                    return True
                else:
                    self.log(f"❌ Unexpected welcome message: {welcome_data}")
                    return False
                    
        except Exception as e:
            self.log(f"❌ WebSocket connection failed: {e}")
            return False
    
    async def test_jaw_commands(self):
        """Test jaw movement commands"""
        self.log("🦴 Testing jaw movement commands...")
        
        try:
            uri = f"ws://{self.remote_host}:8765"
            async with websockets.connect(uri, timeout=10) as websocket:
                # Skip welcome message
                await websocket.recv()
                
                # Test different jaw positions
                test_angles = [0, 30, 60, 90, 45, 0]
                
                for i, angle in enumerate(test_angles):
                    self.log(f"   Testing angle {angle}° ({i+1}/{len(test_angles)})")
                    
                    # Send jaw move command
                    command = {
                        "type": "jaw_move",
                        "angle": angle,
                        "duration": 0.3,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(command))
                    
                    # Wait for response
                    response = await asyncio.wait_for(websocket.recv(), timeout=3)
                    response_data = json.loads(response)
                    
                    if response_data.get("type") == "jaw_move_started":
                        self.log(f"   ✅ Jaw moved to {angle}° successfully")
                        await asyncio.sleep(0.4)  # Wait for movement
                    else:
                        self.log(f"   ❌ Jaw movement failed: {response_data}")
                        return False
                
                self.log("✅ All jaw movement commands successful")
                return True
                
        except Exception as e:
            self.log(f"❌ Jaw commands test failed: {e}")
            return False
    
    async def run_browser_simulation(self):
        """Simulate 10 browser interactions"""
        self.log("🖥️ Running browser simulation (10 interactions)...")
        
        success_count = 0
        
        for i in range(10):
            try:
                self.log(f"   Browser interaction {i+1}/10")
                
                uri = f"ws://{self.remote_host}:8765"
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
                    test_angle = 20 + (i * 15) % 70  # Vary angles
                    
                    jaw_command = {
                        "type": "jaw_move",
                        "angle": test_angle,
                        "duration": 0.2,
                        "curve_type": "ease_in_out"
                    }
                    
                    await websocket.send(json.dumps(jaw_command))
                    response = await asyncio.wait_for(websocket.recv(), timeout=3)
                    response_data = json.loads(response)
                    
                    if response_data.get("type") == "jaw_move_started":
                        self.log(f"   ✅ Interaction {i+1} successful (angle: {test_angle}°)")
                        success_count += 1
                    else:
                        self.log(f"   ❌ Interaction {i+1} failed: {response_data}")
                    
                    await asyncio.sleep(0.3)  # Simulate user pause
                    
            except Exception as e:
                self.log(f"   ❌ Interaction {i+1} error: {e}")
        
        if success_count == 10:
            self.log("✅ All 10 browser interactions successful")
            return True
        else:
            self.log(f"❌ Browser simulation: {success_count}/10 successful")
            return False
    
    def show_system_status(self):
        """Show final system status"""
        self.log("📊 System Status:")
        
        # Show running processes
        success, stdout, stderr = self.ssh_command("ps aux | grep -E '(node.*app|minimal_jaw)' | grep -v grep")
        if success:
            self.log(f"   Running processes: {stdout.strip()}")
        
        # Show listening ports
        success, stdout, stderr = self.ssh_command("netstat -tln | grep -E ':(3000|8765)'")
        if success:
            self.log(f"   Listening ports: {stdout.strip()}")
        
        # Show access URLs
        self.log("🌐 Access URLs:")
        self.log(f"   Main MonsterBox: http://{self.remote_host}:3000")
        self.log(f"   ChatterPi Chat: http://{self.remote_host}:3000/chatterpi-chat.html")
        self.log(f"   ChatterPi AI Chat: http://{self.remote_host}:3000/chatterpi-ai-chat.html")
    
    async def run_all_tests(self):
        """Run all tests"""
        self.log("🎯 Starting Final ChatterPi System Test")
        self.log("=" * 60)
        
        # Test 1: Connectivity
        self.test_results["connectivity"] = self.test_connectivity()
        
        # Test 2: Deploy files
        if self.test_results["connectivity"]:
            self.test_results["deployment"] = self.deploy_files()
        else:
            self.test_results["deployment"] = False
        
        # Test 3: Start services
        if self.test_results["deployment"]:
            self.test_results["services"] = self.start_services()
        else:
            self.test_results["services"] = False
        
        # Test 4: Web access
        if self.test_results["services"]:
            self.test_results["web_access"] = self.test_web_access()
        else:
            self.test_results["web_access"] = False
        
        # Test 5: WebSocket connection
        if self.test_results["services"]:
            self.test_results["websocket"] = await self.test_websocket_connection()
        else:
            self.test_results["websocket"] = False
        
        # Test 6: Jaw commands
        if self.test_results["websocket"]:
            self.test_results["jaw_commands"] = await self.test_jaw_commands()
        else:
            self.test_results["jaw_commands"] = False
        
        # Test 7: Browser simulation
        if self.test_results["jaw_commands"]:
            self.test_results["browser_simulation"] = await self.run_browser_simulation()
        else:
            self.test_results["browser_simulation"] = False
        
        # Show system status
        self.show_system_status()
        
        # Summary
        self.print_summary()
        
        return all(self.test_results.values())
    
    def print_summary(self):
        """Print test summary"""
        self.log("=" * 60)
        self.log("🎯 FINAL CHATTERPI TEST SUMMARY")
        self.log("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(self.test_results.values())
        
        for test_name, passed in self.test_results.items():
            status = "✅ PASS" if passed else "❌ FAIL"
            self.log(f"{test_name.replace('_', ' ').title()}: {status}")
        
        self.log("-" * 60)
        self.log(f"Total Tests: {total_tests}")
        self.log(f"Passed: {passed_tests}")
        self.log(f"Failed: {total_tests - passed_tests}")
        self.log(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if passed_tests == total_tests:
            self.log("🎉 ALL TESTS PASSED! ChatterPi system is fully operational!")
            self.log(f"🌐 Access ChatterPi at: http://{self.remote_host}:3000/chatterpi-chat.html")
        else:
            self.log("⚠️ Some tests failed. Check the logs above for details.")
        
        self.log("=" * 60)

async def main():
    """Main function"""
    tester = FinalChatterPiTest()
    success = await tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())
