#!/usr/bin/env python3

import asyncio
import websockets
import json
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

async def test_jaw_websocket():
    """Test connection to jaw WebSocket"""
    try:
        uri = "ws://localhost:3000/jaw-animation"
        logger.info(f"Attempting to connect to {uri}")
        
        async with websockets.connect(uri, timeout=10) as websocket:
            logger.info("✅ Connected successfully!")
            
            # Send a test command
            test_command = {
                "type": "jaw_move",
                "angle": 45,
                "duration": 0.5
            }
            
            await websocket.send(json.dumps(test_command))
            logger.info(f"Sent test command: {test_command}")
            
            # Wait a moment
            await asyncio.sleep(1)
            
            logger.info("✅ Test completed successfully!")
            
    except Exception as e:
        logger.error(f"❌ Connection failed: {e}")
        logger.error(f"Error type: {type(e).__name__}")

if __name__ == "__main__":
    asyncio.run(test_jaw_websocket())
