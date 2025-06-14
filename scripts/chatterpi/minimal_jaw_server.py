#!/usr/bin/env python3
"""
Minimal Jaw WebSocket Server for ChatterPi Testing
Simulates jaw control without requiring actual GPIO hardware
"""

import asyncio
import websockets
import json
import logging
import time
from typing import Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MinimalJawServer:
    """Minimal jaw server for testing"""
    
    def __init__(self, host="0.0.0.0", port=8765):
        self.host = host
        self.port = port
        self.clients = {}
        self.client_counter = 0
        self.current_angle = 0.0
        
    async def register_client(self, websocket, path):
        """Register new client"""
        client_id = f"client_{self.client_counter}_{int(time.time())}"
        self.client_counter += 1
        
        self.clients[client_id] = websocket
        logger.info(f"✅ Client connected: {client_id}")
        
        # Send welcome message
        welcome = {
            "type": "welcome",
            "client_id": client_id,
            "server_info": {
                "version": "1.0.0",
                "servo_pin": 18,
                "capabilities": ["jaw_control", "position_feedback", "status_monitoring"]
            },
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(welcome))
        return client_id
    
    async def handle_message(self, client_id, message_data):
        """Handle incoming message"""
        try:
            message = json.loads(message_data)
            message_type = message.get("type", "unknown")
            
            logger.info(f"Received {message_type} from {client_id}")
            
            websocket = self.clients[client_id]
            
            if message_type == "jaw_move":
                await self.handle_jaw_move(websocket, message)
            elif message_type == "jaw_stop":
                await self.handle_jaw_stop(websocket, message)
            elif message_type == "get_position":
                await self.handle_get_position(websocket, message)
            elif message_type == "get_status":
                await self.handle_get_status(websocket, message)
            elif message_type == "subscribe":
                await self.handle_subscribe(websocket, message)
            elif message_type == "ping":
                await self.handle_ping(websocket, message)
            else:
                await self.send_error(websocket, f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            await self.send_error(websocket, "Invalid JSON format")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self.send_error(websocket, f"Internal server error: {str(e)}")
    
    async def handle_jaw_move(self, websocket, message):
        """Handle jaw movement command"""
        angle = message.get("angle", 0)
        duration = message.get("duration", 0.5)
        curve_type = message.get("curve_type", "linear")
        
        if not isinstance(angle, (int, float)) or not (0 <= angle <= 180):
            await self.send_error(websocket, "Angle must be a number between 0 and 180")
            return
        
        # Simulate jaw movement
        self.current_angle = angle
        logger.info(f"🦴 Simulating jaw movement to {angle}° (duration: {duration}s, curve: {curve_type})")
        
        # Send confirmation
        response = {
            "type": "jaw_move_started",
            "angle": angle,
            "duration": duration,
            "curve_type": curve_type,
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(response))
        
        # Simulate movement completion after duration
        await asyncio.sleep(duration)
        
        completion = {
            "type": "jaw_move_completed",
            "angle": angle,
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(completion))
    
    async def handle_jaw_stop(self, websocket, message):
        """Handle jaw stop command"""
        response = {
            "type": "jaw_stopped",
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_get_position(self, websocket, message):
        """Handle position request"""
        response = {
            "type": "position_response",
            "position": {
                "angle": self.current_angle,
                "timestamp": time.time(),
                "pulse_width": int(500 + (self.current_angle / 180.0) * (2400 - 500))
            },
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_get_status(self, websocket, message):
        """Handle status request"""
        jaw_status = {
            "initialized": True,
            "is_moving": False,
            "emergency_stop": False,
            "current_position": self.current_angle,
            "pin": 18
        }
        
        server_status = {
            "connected_clients": len(self.clients),
            "commands_processed": 0,
            "errors": 0,
            "uptime": time.time()
        }
        
        response = {
            "type": "status_response",
            "jaw_status": jaw_status,
            "server_status": server_status,
            "timestamp": time.time()
        }
        
        await websocket.send(json.dumps(response))
    
    async def handle_subscribe(self, websocket, message):
        """Handle event subscription"""
        events = message.get("events", [])
        response = {
            "type": "subscribed",
            "events": events,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_ping(self, websocket, message):
        """Handle ping request"""
        response = {
            "type": "pong",
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def send_error(self, websocket, error_message):
        """Send error message"""
        response = {
            "type": "error",
            "message": error_message,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(response))
    
    async def handle_client(self, websocket, path):
        """Handle client connection"""
        client_id = await self.register_client(websocket, path)
        
        try:
            async for message in websocket:
                await self.handle_message(client_id, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} disconnected")
        except Exception as e:
            logger.error(f"Error with client {client_id}: {e}")
        finally:
            if client_id in self.clients:
                del self.clients[client_id]
    
    async def start_server(self):
        """Start the WebSocket server"""
        logger.info(f"🚀 Starting Minimal Jaw WebSocket Server on {self.host}:{self.port}")
        
        server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=30,
            ping_timeout=10
        )
        
        logger.info(f"✅ Minimal Jaw WebSocket Server running on ws://{self.host}:{self.port}")
        logger.info("🦴 Simulating jaw control (no actual GPIO required)")
        
        await server.wait_closed()

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Minimal Jaw WebSocket Server")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    parser.add_argument("--port", type=int, default=8765, help="Server port")
    
    args = parser.parse_args()
    
    server = MinimalJawServer(host=args.host, port=args.port)
    
    try:
        asyncio.run(server.start_server())
    except KeyboardInterrupt:
        logger.info("Server interrupted by user")
    except Exception as e:
        logger.error(f"Server error: {e}")

if __name__ == "__main__":
    main()
