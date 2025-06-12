#!/usr/bin/env python3
"""
Test script to verify AI response parsing is working correctly
"""

import asyncio
import websockets
import json
import time

async def test_ai_bridge():
    """Test the AI bridge response parsing"""
    uri = "ws://localhost:8766"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to AI bridge")
            
            # Wait for welcome message
            welcome = await websocket.recv()
            print(f"📨 Welcome: {welcome}")
            
            # Send character selection
            character_msg = {
                "type": "character_selection",
                "character": "orlok"
            }
            await websocket.send(json.dumps(character_msg))
            print("📤 Sent character selection")
            
            # Wait for character confirmation
            char_response = await websocket.recv()
            print(f"📨 Character response: {char_response}")
            
            # Send test message
            test_msg = {
                "type": "chat_message",
                "text": "Hello Count Orlok, how are you tonight?"
            }
            await websocket.send(json.dumps(test_msg))
            print("📤 Sent test message")
            
            # Wait for AI response
            print("⏳ Waiting for AI response...")
            response = await websocket.recv()
            print(f"📨 AI Response: {response}")
            
            # Parse the response
            try:
                response_data = json.loads(response)
                if response_data.get("type") == "conversation_result":
                    ai_text = response_data.get("data", {}).get("aiResponse", {}).get("text", "")
                    print(f"🎭 AI Text: {ai_text}")
                    
                    if ai_text and ai_text != "The ancient ways are not easily explained to mortals.":
                        print("✅ SUCCESS: Real AI response received!")
                        return True
                    else:
                        print("❌ FAILURE: Got fallback response instead of real AI")
                        return False
                else:
                    print(f"❌ Unexpected response type: {response_data.get('type')}")
                    return False
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse response: {e}")
                return False
                
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing AI Bridge Response Parsing...")
    result = asyncio.run(test_ai_bridge())
    if result:
        print("🎉 Test PASSED - AI parsing is working!")
    else:
        print("💥 Test FAILED - AI parsing needs more work")
