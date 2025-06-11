#!/usr/bin/env python3
"""
Verify ChatterPi System Status
Quick verification that all components are working
"""

import subprocess
import requests
import asyncio
import websockets
import json
import time

def log(message):
    """Log with timestamp"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")

def ssh_command(command):
    """Run SSH command"""
    try:
        result = subprocess.run(
            f"ssh remote@192.168.8.130 \"{command}\"",
            shell=True,
            capture_output=True,
            text=True,
            timeout=15
        )
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

async def test_websockets():
    """Test WebSocket connections"""
    log("🔌 Testing WebSocket connections...")
    
    # Test jaw WebSocket
    try:
        jaw_uri = "ws://192.168.8.130:8765"
        async with websockets.connect(jaw_uri, timeout=5) as websocket:
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=3)
            welcome_data = json.loads(welcome_msg)
            if welcome_data.get("type") == "welcome":
                log("✅ Jaw WebSocket: Connected")
                
                # Test movement
                move_command = {"type": "jaw_move", "angle": 20, "duration": 0.3}
                await websocket.send(json.dumps(move_command))
                response = await asyncio.wait_for(websocket.recv(), timeout=3)
                response_data = json.loads(response)
                if response_data.get("type") == "jaw_move_started":
                    log("✅ Jaw movement: Working")
                else:
                    log(f"❌ Jaw movement failed: {response_data}")
            else:
                log(f"❌ Jaw WebSocket unexpected response: {welcome_data}")
    except Exception as e:
        log(f"❌ Jaw WebSocket failed: {e}")
    
    # Test AI WebSocket
    try:
        ai_uri = "ws://192.168.8.130:8766"
        async with websockets.connect(ai_uri, timeout=5) as websocket:
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=3)
            welcome_data = json.loads(welcome_msg)
            if welcome_data.get("type") == "welcome":
                log("✅ AI WebSocket: Connected")
                log(f"   Character: {welcome_data.get('character', 'Unknown')}")
                
                # Test conversation
                chat_command = {"type": "chat_message", "text": "Hello test", "timestamp": time.time()}
                await websocket.send(json.dumps(chat_command))
                
                # Wait for processing
                processing_msg = await asyncio.wait_for(websocket.recv(), timeout=5)
                processing_data = json.loads(processing_msg)
                if processing_data.get("type") == "processing_started":
                    log("✅ AI processing: Started")
                    
                    # Wait for response
                    response_msg = await asyncio.wait_for(websocket.recv(), timeout=8)
                    response_data = json.loads(response_msg)
                    if response_data.get("type") == "conversation_result":
                        ai_response = response_data.get("data", {}).get("aiResponse", {})
                        response_text = ai_response.get("text", "No response")
                        log(f"✅ AI conversation: {response_text[:30]}...")
                    else:
                        log(f"❌ AI conversation failed: {response_data}")
                else:
                    log(f"❌ AI processing failed: {processing_data}")
            else:
                log(f"❌ AI WebSocket unexpected response: {welcome_data}")
    except Exception as e:
        log(f"❌ AI WebSocket failed: {e}")

def test_web_interfaces():
    """Test web interface accessibility"""
    log("🌐 Testing web interfaces...")
    
    interfaces = [
        ("Main MonsterBox", "http://192.168.8.130:3000"),
        ("ChatterPi Basic", "http://192.168.8.130:3000/chatterpi-chat.html"),
        ("ChatterPi AI", "http://192.168.8.130:3000/chatterpi-ai-chat.html")
    ]
    
    for name, url in interfaces:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                log(f"✅ {name}: Accessible")
            else:
                log(f"❌ {name}: HTTP {response.status_code}")
        except Exception as e:
            log(f"❌ {name}: {e}")

def check_services():
    """Check if services are running"""
    log("🔍 Checking services...")
    
    # Check ports
    success, stdout, stderr = ssh_command("netstat -tln | grep -E ':(3000|8765|8766)'")
    if success:
        ports = []
        if ":3000" in stdout:
            ports.append("3000 (MonsterBox)")
        if ":8765" in stdout:
            ports.append("8765 (Jaw WebSocket)")
        if ":8766" in stdout:
            ports.append("8766 (AI Bridge)")
        
        if len(ports) == 3:
            log("✅ All services running:")
            for port in ports:
                log(f"   - Port {port}")
        else:
            log(f"⚠️ Some services missing. Running ports: {', '.join(ports)}")
    else:
        log(f"❌ Could not check ports: {stderr}")
    
    # Check processes
    success, stdout, stderr = ssh_command("ps aux | grep -E '(node.*app|jaw.*server|ai.*bridge)' | grep -v grep")
    if success and stdout.strip():
        log("✅ Running processes:")
        for line in stdout.strip().split('\n'):
            if 'node' in line:
                log("   - MonsterBox app")
            elif 'jaw' in line:
                log("   - Jaw server")
            elif 'ai' in line:
                log("   - AI bridge")
    else:
        log("❌ No ChatterPi processes found")

async def main():
    """Main verification function"""
    log("🎯 ChatterPi System Verification")
    log("=" * 50)
    
    check_services()
    test_web_interfaces()
    await test_websockets()
    
    log("=" * 50)
    log("🎉 Verification complete!")
    log("")
    log("🌐 Access ChatterPi:")
    log("   Basic: http://192.168.8.130:3000/chatterpi-chat.html")
    log("   AI: http://192.168.8.130:3000/chatterpi-ai-chat.html")

if __name__ == "__main__":
    asyncio.run(main())
