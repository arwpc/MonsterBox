#!/usr/bin/env python3
"""
Simple WebSocket connection test for MonsterBox hardware services
"""

import asyncio
import websockets
import json
import sys

async def test_service(name, url, test_message=None):
    """Test connection to a single service"""
    try:
        print(f"🔌 Testing {name} at {url}...")
        
        # Connect with timeout
        websocket = await websockets.connect(url, timeout=5)
        print(f"✅ {name} connected successfully!")
        
        # Wait for welcome message
        try:
            welcome_msg = await asyncio.wait_for(websocket.recv(), timeout=3)
            welcome_data = json.loads(welcome_msg)
            print(f"📨 {name} welcome: {welcome_data.get('type', 'unknown')}")
        except asyncio.TimeoutError:
            print(f"⏰ {name} no welcome message received")
        except Exception as e:
            print(f"❌ {name} welcome message error: {e}")
        
        # Send test message if provided
        if test_message:
            await websocket.send(json.dumps(test_message))
            print(f"📤 {name} sent test message")
            
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=3)
                response_data = json.loads(response)
                print(f"📨 {name} response: {response_data.get('type', 'unknown')}")
            except asyncio.TimeoutError:
                print(f"⏰ {name} no response to test message")
            except Exception as e:
                print(f"❌ {name} response error: {e}")
        
        # Keep connection open for a moment
        await asyncio.sleep(1)
        
        # Close connection
        await websocket.close()
        print(f"✅ {name} connection closed cleanly")
        return True
        
    except Exception as e:
        print(f"❌ {name} failed: {e}")
        return False

async def main():
    """Test all hardware services"""
    print("🚀 Testing MonsterBox Hardware WebSocket Services")
    print("=" * 50)
    
    services = [
        ("Service Registry", "ws://localhost:8770", {"type": "get_services"}),
        ("Main Hardware Server", "ws://localhost:8780", {"type": "ping"}),
        ("Motor Service", "ws://localhost:8771", None),
        ("Light Service", "ws://localhost:8772", None),
        ("Jaw Animation", "ws://localhost:8765", None)
    ]
    
    results = []
    for name, url, test_msg in services:
        result = await test_service(name, url, test_msg)
        results.append((name, result))
        print("-" * 30)
        await asyncio.sleep(1)  # Brief pause between tests
    
    print("\n📊 Test Results:")
    print("=" * 50)
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{name}: {status}")
    
    total_passed = sum(1 for _, success in results if success)
    print(f"\nTotal: {total_passed}/{len(results)} services working")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Test interrupted by user")
    except Exception as e:
        print(f"❌ Test failed: {e}")
        sys.exit(1)
