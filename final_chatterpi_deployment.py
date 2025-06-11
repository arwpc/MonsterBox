#!/usr/bin/env python3
"""
Final ChatterPi Deployment and Test
Comprehensive deployment with all fixes: servo selection, audio synthesis, AI bridge
"""

import subprocess
import time
import sys
import asyncio
import websockets
import json
import requests

class FinalChatterPiDeployment:
    def __init__(self):
        self.remote_host = "192.168.8.130"
        self.remote_user = "remote"
        self.remote_path = "~/MonsterBox"
        
    def log(self, message):
        """Log with timestamp"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {message}")
        
    def run_command(self, command, timeout=30):
        """Run command and return success, stdout, stderr"""
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout)
            return result.returncode == 0, result.stdout, result.stderr
        except Exception as e:
            return False, "", str(e)
    
    def ssh_command(self, command, timeout=30):
        """Run SSH command"""
        full_command = f"ssh {self.remote_user}@{self.remote_host} \"{command}\""
        return self.run_command(full_command, timeout)
    
    def deploy_and_start(self):
        """Deploy all files and start system"""
        self.log("🚀 Starting Final ChatterPi Deployment")
        self.log("=" * 60)
        
        # Deploy files
        self.log("📁 Deploying files...")
        success, stdout, stderr = self.run_command(f"scp -r scripts/chatterpi {self.remote_user}@{self.remote_host}:{self.remote_path}/scripts/")
        if not success:
            self.log(f"❌ Script deployment failed: {stderr}")
            return False
        
        success, stdout, stderr = self.run_command(f"scp public/chatterpi-*.html {self.remote_user}@{self.remote_host}:{self.remote_path}/public/")
        if not success:
            self.log(f"❌ HTML deployment failed: {stderr}")
            return False
        
        self.log("✅ Files deployed successfully")
        
        # Kill existing processes
        self.log("🔄 Stopping existing processes...")
        self.ssh_command("pkill -f 'jaw.*server'")
        self.ssh_command("pkill -f 'ai.*bridge'")
        self.ssh_command("pkill -f 'node.*app'")
        time.sleep(3)
        
        # Start services
        self.log("🚀 Starting services...")
        
        # Start main app
        success, stdout, stderr = self.ssh_command(f"cd {self.remote_path} && nohup node --no-deprecation app.js > app.log 2>&1 &")
        if not success:
            self.log(f"❌ Main app start failed: {stderr}")
            return False
        time.sleep(5)
        
        # Start jaw server
        success, stdout, stderr = self.ssh_command(f"cd {self.remote_path}/scripts/chatterpi && nohup python3 minimal_jaw_server.py --host 0.0.0.0 --port 8765 > jaw.log 2>&1 &")
        if not success:
            self.log(f"❌ Jaw server start failed: {stderr}")
            return False
        time.sleep(3)
        
        # Start AI bridge
        success, stdout, stderr = self.ssh_command(f"cd {self.remote_path}/scripts/chatterpi && nohup python3 ai_websocket_bridge.py --host 0.0.0.0 --port 8766 > ai.log 2>&1 &")
        if not success:
            self.log(f"❌ AI bridge start failed: {stderr}")
            return False
        time.sleep(5)
        
        # Verify services
        success, stdout, stderr = self.ssh_command("netstat -tln | grep -E ':(3000|8765|8766)'")
        if success and "3000" in stdout and "8765" in stdout and "8766" in stdout:
            self.log("✅ All services started successfully")
            return True
        else:
            self.log(f"❌ Service verification failed: {stdout}")
            return False
    
    async def test_system(self):
        """Test the complete system"""
        self.log("🧪 Testing ChatterPi system...")
        
        # Test web interfaces
        try:
            response = requests.get(f"http://{self.remote_host}:3000/chatterpi-chat.html", timeout=10)
            if response.status_code == 200:
                self.log("✅ Basic ChatterPi interface accessible")
            else:
                self.log(f"❌ Basic interface failed: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Basic interface error: {e}")
            return False
        
        try:
            response = requests.get(f"http://{self.remote_host}:3000/chatterpi-ai-chat.html", timeout=10)
            if response.status_code == 200:
                self.log("✅ AI ChatterPi interface accessible")
            else:
                self.log(f"❌ AI interface failed: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ AI interface error: {e}")
            return False
        
        # Test jaw WebSocket
        try:
            jaw_uri = f"ws://{self.remote_host}:8765"
            async with websockets.connect(jaw_uri, timeout=10) as websocket:
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                welcome_data = json.loads(welcome_msg)
                if welcome_data.get("type") == "welcome":
                    self.log("✅ Jaw WebSocket connection successful")
                    
                    # Test jaw movement
                    move_command = {"type": "jaw_move", "angle": 30, "duration": 0.5}
                    await websocket.send(json.dumps(move_command))
                    response = await asyncio.wait_for(websocket.recv(), timeout=3)
                    response_data = json.loads(response)
                    if response_data.get("type") == "jaw_move_started":
                        self.log("✅ Jaw movement test successful")
                    else:
                        self.log(f"❌ Jaw movement failed: {response_data}")
                        return False
                else:
                    self.log(f"❌ Jaw WebSocket unexpected welcome: {welcome_data}")
                    return False
        except Exception as e:
            self.log(f"❌ Jaw WebSocket test failed: {e}")
            return False
        
        # Test AI WebSocket
        try:
            ai_uri = f"ws://{self.remote_host}:8766"
            async with websockets.connect(ai_uri, timeout=10) as websocket:
                welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                welcome_data = json.loads(welcome_msg)
                if welcome_data.get("type") == "welcome":
                    self.log("✅ AI WebSocket connection successful")
                    self.log(f"   Character: {welcome_data.get('character', 'Unknown')}")
                    
                    # Test AI conversation
                    chat_command = {"type": "chat_message", "text": "Hello, test message", "timestamp": time.time()}
                    await websocket.send(json.dumps(chat_command))
                    
                    # Wait for processing
                    processing_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                    processing_data = json.loads(processing_msg)
                    if processing_data.get("type") == "processing_started":
                        self.log("✅ AI processing started")
                        
                        # Wait for response
                        response_msg = await asyncio.wait_for(websocket.recv(), timeout=10)
                        response_data = json.loads(response_msg)
                        if response_data.get("type") == "conversation_result":
                            ai_response = response_data.get("data", {}).get("aiResponse", {})
                            response_text = ai_response.get("text", "No response")
                            self.log(f"✅ AI conversation successful: {response_text[:50]}...")
                        else:
                            self.log(f"❌ AI conversation failed: {response_data}")
                            return False
                    else:
                        self.log(f"❌ AI processing failed: {processing_data}")
                        return False
                else:
                    self.log(f"❌ AI WebSocket unexpected welcome: {welcome_data}")
                    return False
        except Exception as e:
            self.log(f"❌ AI WebSocket test failed: {e}")
            return False
        
        self.log("✅ All system tests passed!")
        return True
    
    def show_completion_info(self):
        """Show completion information"""
        self.log("=" * 60)
        self.log("🎉 CHATTERPI DEPLOYMENT COMPLETE!")
        self.log("=" * 60)
        self.log("🌐 Access URLs:")
        self.log(f"   Basic ChatterPi: http://{self.remote_host}:3000/chatterpi-chat.html")
        self.log(f"   AI ChatterPi: http://{self.remote_host}:3000/chatterpi-ai-chat.html")
        self.log("")
        self.log("🎯 Features Available:")
        self.log("   ✅ Servo selection dropdown (GPIO 18, 19, 20, 21)")
        self.log("   ✅ Character voice selection (Count Orlok, RoboChat, Captain Blackbeard)")
        self.log("   ✅ Audio synthesis with jaw synchronization")
        self.log("   ✅ Real-time jaw animation")
        self.log("   ✅ AI conversation with character responses")
        self.log("   ✅ Test buttons for audio and jaw movement")
        self.log("")
        self.log("🔧 How to Use:")
        self.log("   1. Select servo pin from dropdown")
        self.log("   2. Choose character voice")
        self.log("   3. Adjust volume slider")
        self.log("   4. Test audio and jaw movement")
        self.log("   5. Start chatting - jaw moves with speech!")
        self.log("=" * 60)
    
    async def run_complete_deployment(self):
        """Run complete deployment and testing"""
        if self.deploy_and_start():
            if await self.test_system():
                self.show_completion_info()
                return True
            else:
                self.log("❌ System tests failed")
                return False
        else:
            self.log("❌ Deployment failed")
            return False

async def main():
    """Main function"""
    deployer = FinalChatterPiDeployment()
    success = await deployer.run_complete_deployment()
    
    if success:
        print("\n🎉 ChatterPi system is now fully operational!")
        print("🌐 Open your browser and test the interfaces!")
    else:
        print("\n❌ Deployment failed. Check the logs above.")
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())
