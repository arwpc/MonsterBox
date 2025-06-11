#!/usr/bin/env python3
"""
Deploy and Test lgpio ChatterPi System
Final deployment with lgpio servo control
"""

import subprocess
import time
import asyncio
import websockets
import json

class LGPIOChatterPiDeployer:
    def __init__(self):
        self.remote_host = "192.168.8.130"
        self.remote_user = "remote"
        
    def log(self, message):
        """Log with timestamp"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {message}")
        
    def ssh_command(self, command, timeout=30):
        """Run SSH command"""
        try:
            result = subprocess.run(
                f"ssh {self.remote_user}@{self.remote_host} \"{command}\"",
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return result.returncode == 0, result.stdout, result.stderr
        except Exception as e:
            return False, "", str(e)
    
    def deploy_files(self):
        """Deploy all necessary files"""
        self.log("📁 Deploying lgpio ChatterPi files...")
        
        files_to_deploy = [
            "scripts/chatterpi/gpio_jaw_server.py",
            "scripts/chatterpi/ai_websocket_bridge.py", 
            "scripts/chatterpi/test_lgpio_servo.py",
            "public/chatterpi-chat.html",
            "public/chatterpi-ai-chat.html"
        ]
        
        for file_path in files_to_deploy:
            success, stdout, stderr = subprocess.run(
                f"scp {file_path} {self.remote_user}@{self.remote_host}:~/MonsterBox/{file_path}",
                shell=True,
                capture_output=True,
                text=True
            ).returncode == 0, "", ""
            
            if not success:
                self.log(f"❌ Failed to deploy {file_path}")
                return False
        
        self.log("✅ All files deployed")
        return True
    
    def setup_lgpio(self):
        """Setup lgpio dependencies"""
        self.log("🔧 Setting up lgpio...")
        
        # Install lgpio if needed
        success, stdout, stderr = self.ssh_command(
            "python3 -c 'import lgpio; print(\"lgpio available\")' 2>/dev/null || (sudo apt update && sudo apt install -y python3-lgpio lgpio-tools)"
        )
        
        if not success:
            self.log(f"❌ Failed to setup lgpio: {stderr}")
            return False
        
        # Test lgpio access
        success, stdout, stderr = self.ssh_command(
            "python3 -c 'import lgpio; h=lgpio.gpiochip_open(0); lgpio.gpiochip_close(h); print(\"lgpio working\")'"
        )
        
        if success:
            self.log("✅ lgpio is working")
            return True
        else:
            self.log(f"⚠️ lgpio test failed: {stderr}")
            return False
    
    def start_services(self):
        """Start all ChatterPi services"""
        self.log("🚀 Starting ChatterPi services...")
        
        # Stop existing services
        self.ssh_command("pkill -f 'node.*app' && pkill -f 'jaw.*server' && pkill -f 'gpio_jaw' && pkill -f 'ai.*bridge'")
        time.sleep(3)
        
        # Start MonsterBox app
        success, stdout, stderr = self.ssh_command(
            "cd ~/MonsterBox && nohup node --no-deprecation app.js > app.log 2>&1 &"
        )
        if not success:
            self.log(f"❌ Failed to start MonsterBox app: {stderr}")
            return False
        
        time.sleep(5)
        
        # Start lgpio jaw server
        success, stdout, stderr = self.ssh_command(
            "cd ~/MonsterBox/scripts/chatterpi && nohup python3 gpio_jaw_server.py --host 0.0.0.0 --port 8765 --servo-pin 18 > lgpio_jaw.log 2>&1 &"
        )
        if not success:
            self.log(f"❌ Failed to start jaw server: {stderr}")
            return False
        
        time.sleep(3)
        
        # Start AI bridge
        success, stdout, stderr = self.ssh_command(
            "cd ~/MonsterBox/scripts/chatterpi && nohup python3 ai_websocket_bridge.py --host 0.0.0.0 --port 8766 > ai_bridge.log 2>&1 &"
        )
        if not success:
            self.log(f"❌ Failed to start AI bridge: {stderr}")
            return False
        
        time.sleep(3)
        
        # Verify services
        success, stdout, stderr = self.ssh_command("netstat -tln | grep -E ':(3000|8765|8766)'")
        if success and "3000" in stdout and "8765" in stdout and "8766" in stdout:
            self.log("✅ All services started successfully")
            return True
        else:
            self.log(f"❌ Service verification failed: {stdout}")
            return False
    
    async def test_jaw_movement(self):
        """Test jaw movement via WebSocket"""
        self.log("🦴 Testing jaw movement...")
        
        try:
            uri = f"ws://{self.remote_host}:8765"
            async with websockets.connect(uri, timeout=10) as websocket:
                # Receive welcome
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                welcome_data = json.loads(welcome_msg)
                
                if welcome_data.get("type") == "welcome":
                    self.log("✅ Connected to jaw WebSocket")
                    
                    # Test movement sequence
                    test_angles = [0, 30, 60, 30, 0]
                    
                    for angle in test_angles:
                        self.log(f"   Testing movement to {angle}°")
                        
                        move_command = {
                            "type": "jaw_move",
                            "angle": angle,
                            "duration": 1.0
                        }
                        
                        await websocket.send(json.dumps(move_command))
                        
                        # Wait for response
                        response = await asyncio.wait_for(websocket.recv(), timeout=5)
                        response_data = json.loads(response)
                        
                        if response_data.get("type") == "jaw_move_started":
                            self.log(f"   ✅ Movement to {angle}° started")
                            
                            # Wait for completion
                            try:
                                complete_response = await asyncio.wait_for(websocket.recv(), timeout=10)
                                complete_data = json.loads(complete_response)
                                if complete_data.get("type") == "jaw_move_completed":
                                    self.log(f"   ✅ Movement to {angle}° completed")
                                else:
                                    self.log(f"   ⚠️ Unexpected completion: {complete_data}")
                            except asyncio.TimeoutError:
                                self.log("   ⚠️ Movement completion timeout")
                        else:
                            self.log(f"   ❌ Movement failed: {response_data}")
                            return False
                        
                        await asyncio.sleep(0.5)
                    
                    self.log("✅ All jaw movement tests passed!")
                    return True
                else:
                    self.log(f"❌ Unexpected welcome: {welcome_data}")
                    return False
                    
        except Exception as e:
            self.log(f"❌ Jaw movement test failed: {e}")
            return False
    
    def show_completion_info(self):
        """Show completion information"""
        self.log("=" * 60)
        self.log("🎉 LGPIO CHATTERPI DEPLOYMENT COMPLETE!")
        self.log("=" * 60)
        self.log("🌐 Access URLs:")
        self.log(f"   Basic ChatterPi: http://{self.remote_host}:3000/chatterpi-chat.html")
        self.log(f"   AI ChatterPi: http://{self.remote_host}:3000/chatterpi-ai-chat.html")
        self.log("")
        self.log("🔧 Hardware Configuration:")
        self.log("   ✅ lgpio servo control on GPIO 18")
        self.log("   ✅ WebSocket jaw control on port 8765")
        self.log("   ✅ AI conversation on port 8766")
        self.log("")
        self.log("🧪 Testing Instructions:")
        self.log("   1. Open ChatterPi interface in browser")
        self.log("   2. Ensure 'GPIO 18 (ChatterPi Jaw)' is selected")
        self.log("   3. Click 'Test Movement' button")
        self.log("   4. Servo should move through positions!")
        self.log("   5. Type messages - jaw moves with speech")
        self.log("=" * 60)
    
    async def deploy_and_test(self):
        """Complete deployment and testing"""
        self.log("🎯 Starting lgpio ChatterPi Deployment")
        self.log("=" * 60)
        
        # Deploy files
        if not self.deploy_files():
            return False
        
        # Setup lgpio
        if not self.setup_lgpio():
            return False
        
        # Start services
        if not self.start_services():
            return False
        
        # Test jaw movement
        if not await self.test_jaw_movement():
            self.log("⚠️ Jaw movement test failed - check hardware connections")
            return False
        
        self.show_completion_info()
        return True

async def main():
    """Main function"""
    deployer = LGPIOChatterPiDeployer()
    success = await deployer.deploy_and_test()
    
    if success:
        print("\n🎉 lgpio ChatterPi deployment successful!")
        print("🦴 Servo should now move when using the interface!")
    else:
        print("\n❌ Deployment failed - check logs above")
    
    return success

if __name__ == "__main__":
    asyncio.run(main())
