#!/usr/bin/env python3

import asyncio
import websockets
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_ai_chat():
    """Test AI chat functionality"""
    try:
        uri = "ws://localhost:8766"
        logger.info(f"Connecting to AI WebSocket: {uri}")
        
        async with websockets.connect(uri, timeout=10) as websocket:
            logger.info("✅ Connected to AI WebSocket")
            
            # Wait for welcome message
            welcome = await websocket.recv()
            logger.info(f"Welcome: {welcome}")
            
            # Set character to Count Orlok
            await websocket.send(json.dumps({
                "type": "set_character",
                "character": "orlok"
            }))
            
            # Wait for character confirmation
            response = await websocket.recv()
            logger.info(f"Character set: {response}")
            
            # Send a test message
            test_message = "Hello Count Orlok, how are you tonight?"
            logger.info(f"Sending test message: {test_message}")
            
            await websocket.send(json.dumps({
                "type": "chat_message",
                "message": test_message,
                "timestamp": "2025-06-12T18:00:00.000Z"
            }))
            
            # Wait for AI response
            ai_response = await websocket.recv()
            logger.info(f"AI Response: {ai_response}")
            
            # Parse and display the response
            response_data = json.loads(ai_response)
            if response_data.get("type") == "conversation_result":
                ai_text = response_data.get("data", {}).get("aiResponse", {}).get("text", "No response")
                logger.info(f"🧛‍♂️ Count Orlok says: {ai_text}")
            
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_ai_chat())
