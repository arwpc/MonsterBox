#!/usr/bin/env python3
"""
Hardware Services Startup Script
Starts all hardware WebSocket services for MonsterBox
"""

import asyncio
import argparse
import logging
import sys
import os

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from websocket_hardware_server import WebSocketHardwareServer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def print_banner():
    """Print startup banner"""
    banner = """
╭─────────────────────────────────────────────────────────────╮
│                                                             │
│  🦾 MonsterBox Hardware WebSocket Services                  │
│                                                             │
│  Following ChatterPi WebSocket Architecture Pattern        │
│                                                             │
╰─────────────────────────────────────────────────────────────╯
    """
    print(banner)

def print_service_info():
    """Print service information"""
    info = """
🌐 Hardware Services Starting:

📡 Service Registry:     ws://0.0.0.0:8770
🦾 Main Hardware Server: ws://0.0.0.0:8780
🔄 Motor Service:        ws://0.0.0.0:8771
💡 Light Service:        ws://0.0.0.0:8772
📡 Sensor Service:       ws://0.0.0.0:8773
📹 Webcam Service:       ws://0.0.0.0:8774
🔍 Motion Sensor:        ws://0.0.0.0:8777
🎯 Head Tracking:        ws://0.0.0.0:8778

🎭 Character-based service loading enabled
📋 Using configuration from: data/characters.json
🔧 Hardware scripts wrapped with WebSocket interface

Press Ctrl+C to stop all services...
    """
    print(info)

async def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Start MonsterBox Hardware WebSocket Services')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=8780, help='Main server port (default: 8780)')
    parser.add_argument('--character', type=int, default=1, help='Initial character ID (default: 1 - Orlok)')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        
    print_banner()
    
    try:
        logger.info("🚀 Starting MonsterBox Hardware Services...")
        
        # Create and start the main hardware server
        server = WebSocketHardwareServer(port=args.port, host=args.host)
        
        print_service_info()
        
        # Start the server
        await server.start_server()
        
    except KeyboardInterrupt:
        logger.info("⚠️ Received interrupt signal, shutting down...")
    except Exception as e:
        logger.error(f"❌ Error starting hardware services: {e}")
        sys.exit(1)
    finally:
        logger.info("✅ Hardware services shutdown complete")

if __name__ == "__main__":
    asyncio.run(main())
