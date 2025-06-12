#!/usr/bin/env python3
"""
Jaw Control WebSocket Server for ChatterPi
Provides WebSocket API for remote jaw control integration
"""

import asyncio
import websockets
import json
import logging
import time
from typing import Dict, Any, Optional, Set
from dataclasses import dataclass
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from jaw_control_system import JawControlSystem

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ClientInfo:
    """Information about connected WebSocket client"""
    id: str
    websocket: websockets.WebSocketServerProtocol
    ip: str
    connected_at: float
    subscriptions: Optional[Set[str]] = None
    
    def __post_init__(self):
        if self.subscriptions is None:
            self.subscriptions = set()

class JawWebSocketServer:
    """WebSocket server for jaw control API"""
    
    def __init__(self, host: str = "localhost", port: int = 8765, servo_pin: int = 18):
        self.host = host
        self.port = port
        self.servo_pin = servo_pin
        
        # Components
        self.jaw_control = None
        self.server = None
        
        # Client management
        self.clients: Dict[str, ClientInfo] = {}
        self.client_counter = 0
        
        # Server state
        self.is_running = False
        self.stats = {
            "connections": 0,
            "commands_processed": 0,
            "errors": 0,
            "start_time": None
        }
        
        logger.info(f"Jaw WebSocket Server initialized on {host}:{port}")
    
    async def initialize(self) -> bool:
        """Initialize the jaw control system"""
        try:
            self.jaw_control = JawControlSystem(pin=self.servo_pin)
            if not self.jaw_control.initialize():
                logger.error("Failed to initialize jaw control system")
                return False
            
            logger.info("✅ Jaw control system initialized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Initialization failed: {e}")
            return False
    
    def cleanup(self):
        """Clean up resources"""
        if self.jaw_control:
            self.jaw_control.cleanup()
    
    def generate_client_id(self) -> str:
        """Generate unique client ID"""
        self.client_counter += 1
        return f"jaw_client_{self.client_counter}_{int(time.time())}"
    
    async def register_client(self, websocket: websockets.WebSocketServerProtocol, path: str) -> str:
        """Register new client connection"""
        client_id = self.generate_client_id()
        
        # Get client info
        remote_address = websocket.remote_address
        ip = remote_address[0] if remote_address else "unknown"
        
        # Create client info
        client_info = ClientInfo(
            id=client_id,
            websocket=websocket,
            ip=ip,
            connected_at=time.time()
        )
        
        self.clients[client_id] = client_info
        self.stats["connections"] += 1
        
        logger.info(f"✅ Client connected: {client_id} from {ip}")
        
        # Send welcome message
        await self.send_to_client(client_id, {
            "type": "welcome",
            "client_id": client_id,
            "server_info": {
                "version": "1.0.0",
                "servo_pin": self.servo_pin,
                "capabilities": ["jaw_control", "position_feedback", "status_monitoring"]
            },
            "timestamp": time.time()
        })
        
        return client_id
    
    async def unregister_client(self, client_id: str):
        """Unregister client connection"""
        if client_id in self.clients:
            client_info = self.clients[client_id]
            del self.clients[client_id]
            logger.info(f"❌ Client disconnected: {client_id} from {client_info.ip}")
    
    async def send_to_client(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client"""
        if client_id not in self.clients:
            logger.warning(f"Attempted to send message to unknown client: {client_id}")
            return
        
        client_info = self.clients[client_id]
        try:
            await client_info.websocket.send(json.dumps(message))
        except websockets.exceptions.ConnectionClosed:
            logger.warning(f"Connection closed while sending to {client_id}")
            await self.unregister_client(client_id)
        except Exception as e:
            logger.error(f"Error sending message to {client_id}: {e}")
    
    async def handle_message(self, client_id: str, message_data: str):
        """Handle incoming WebSocket message"""
        try:
            message = json.loads(message_data)
            message_type = message.get("type", "unknown")
            
            logger.debug(f"Received {message_type} from {client_id}")
            
            # Route message to appropriate handler
            if message_type == "jaw_move":
                await self.handle_jaw_move(client_id, message)
            elif message_type == "set_position":
                await self.handle_set_position(client_id, message)
            elif message_type == "jaw_stop":
                await self.handle_jaw_stop(client_id, message)
            elif message_type == "stop_servo":
                await self.handle_stop_servo(client_id, message)
            elif message_type == "get_position":
                await self.handle_get_position(client_id, message)
            elif message_type == "get_status":
                await self.handle_get_status(client_id, message)
            elif message_type == "calibrate":
                await self.handle_calibrate(client_id, message)
            elif message_type == "subscribe":
                await self.handle_subscribe(client_id, message)
            elif message_type == "ping":
                await self.handle_ping(client_id, message)
            else:
                await self.send_error(client_id, f"Unknown message type: {message_type}")
            
            self.stats["commands_processed"] += 1
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from {client_id}: {e}")
            await self.send_error(client_id, "Invalid JSON format")
            self.stats["errors"] += 1
        except Exception as e:
            logger.error(f"Error handling message from {client_id}: {e}")
            await self.send_error(client_id, f"Internal server error: {str(e)}")
            self.stats["errors"] += 1
    
    async def handle_jaw_move(self, client_id: str, message: Dict[str, Any]):
        """Handle jaw movement command"""
        try:
            angle = message.get("angle")
            duration = message.get("duration", 0.5)
            curve_type = message.get("curve_type", "linear")
            
            if angle is None:
                await self.send_error(client_id, "Missing 'angle' parameter")
                return
            
            if not isinstance(angle, (int, float)) or not (0 <= angle <= 180):
                await self.send_error(client_id, "Angle must be a number between 0 and 180")
                return
            
            # Move jaw
            success = self.jaw_control.move_to_angle(angle, duration, curve_type)
            
            if success:
                # Send confirmation
                await self.send_to_client(client_id, {
                    "type": "jaw_move_started",
                    "angle": angle,
                    "duration": duration,
                    "curve_type": curve_type,
                    "timestamp": time.time()
                })
            else:
                await self.send_error(client_id, "Failed to start jaw movement")
                
        except Exception as e:
            logger.error(f"Error in jaw_move: {e}")
            await self.send_error(client_id, f"Jaw movement error: {str(e)}")

    async def handle_set_position(self, client_id: str, message: Dict[str, Any]):
        """Handle direct position setting for calibration"""
        try:
            angle = message.get("angle")

            if angle is None:
                await self.send_error(client_id, "Missing 'angle' parameter")
                return

            if not isinstance(angle, (int, float)) or not (0 <= angle <= 180):
                await self.send_error(client_id, "Angle must be a number between 0 and 180")
                return

            # Set position immediately
            success = self.jaw_control.move_to_angle(angle, 0.3, "linear")

            if success:
                await self.send_to_client(client_id, {
                    "type": "position_set",
                    "angle": angle,
                    "timestamp": time.time()
                })
            else:
                await self.send_error(client_id, "Failed to set jaw position")

        except Exception as e:
            logger.error(f"Error in set_position: {e}")
            await self.send_error(client_id, f"Position setting error: {str(e)}")

    async def handle_jaw_stop(self, client_id: str, message: Dict[str, Any]):
        """Handle jaw stop command"""
        try:
            self.jaw_control.stop_movement()
            await self.send_to_client(client_id, {
                "type": "jaw_stopped",
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error in jaw_stop: {e}")
            await self.send_error(client_id, f"Jaw stop error: {str(e)}")

    async def handle_stop_servo(self, client_id: str, message: Dict[str, Any]):
        """Handle servo PWM stop command to reduce jitter"""
        try:
            self.jaw_control.stop_servo()
            await self.send_to_client(client_id, {
                "type": "servo_stopped",
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error stopping servo: {e}")
            await self.send_error(client_id, f"Servo stop error: {str(e)}")

    async def handle_get_position(self, client_id: str, message: Dict[str, Any]):
        """Handle position request"""
        try:
            position = self.jaw_control.get_position()
            await self.send_to_client(client_id, {
                "type": "position_response",
                "position": {
                    "angle": position.angle,
                    "timestamp": position.timestamp,
                    "pulse_width": position.pulse_width
                },
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error getting position: {e}")
            await self.send_error(client_id, f"Position error: {str(e)}")
    
    async def handle_get_status(self, client_id: str, message: Dict[str, Any]):
        """Handle status request"""
        try:
            jaw_status = self.jaw_control.get_status()
            server_status = {
                "connected_clients": len(self.clients),
                "commands_processed": self.stats["commands_processed"],
                "errors": self.stats["errors"],
                "uptime": time.time() - self.stats["start_time"] if self.stats["start_time"] else 0
            }

            await self.send_to_client(client_id, {
                "type": "status_response",
                "jaw_status": jaw_status,
                "server_status": server_status,
                "timestamp": time.time()
            })
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            await self.send_error(client_id, f"Status error: {str(e)}")

    async def handle_calibrate(self, client_id: str, message: Dict[str, Any]):
        """Handle calibration request"""
        try:
            step_size = message.get("step_size", 5.0)
            step_delay = message.get("step_delay", 1.0)

            logger.info(f"Starting calibration for client {client_id}")

            # Send calibration started message
            await self.send_to_client(client_id, {
                "type": "calibration_started",
                "step_size": step_size,
                "step_delay": step_delay,
                "timestamp": time.time()
            })

            # Run calibration in background
            calibration_data = self.jaw_control.calibrate_jaw_range(step_size, step_delay)

            # Send calibration results
            await self.send_to_client(client_id, {
                "type": "calibration_completed",
                "data": calibration_data,
                "timestamp": time.time()
            })

        except Exception as e:
            logger.error(f"Error in calibration: {e}")
            await self.send_error(client_id, f"Calibration error: {str(e)}")
    
    async def handle_subscribe(self, client_id: str, message: Dict[str, Any]):
        """Handle event subscription"""
        events = message.get("events", [])
        if not isinstance(events, list):
            await self.send_error(client_id, "Events must be a list")
            return
        
        client_info = self.clients.get(client_id)
        if client_info:
            for event in events:
                client_info.subscriptions.add(event)
            
            await self.send_to_client(client_id, {
                "type": "subscribed",
                "events": events,
                "timestamp": time.time()
            })
    
    async def handle_ping(self, client_id: str, message: Dict[str, Any]):
        """Handle ping request"""
        await self.send_to_client(client_id, {
            "type": "pong",
            "timestamp": time.time()
        })
    
    async def send_error(self, client_id: str, error_message: str):
        """Send error message to client"""
        await self.send_to_client(client_id, {
            "type": "error",
            "message": error_message,
            "timestamp": time.time()
        })
    
    async def handle_client(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Handle individual client connection"""
        client_id = await self.register_client(websocket, path)
        
        try:
            async for message in websocket:
                await self.handle_message(client_id, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} connection closed")
        except Exception as e:
            logger.error(f"Error handling client {client_id}: {e}")
        finally:
            await self.unregister_client(client_id)
    
    async def start_server(self):
        """Start the WebSocket server"""
        if not await self.initialize():
            logger.error("Failed to initialize server")
            return False
        
        try:
            self.stats["start_time"] = time.time()
            self.is_running = True
            
            logger.info(f"🚀 Starting Jaw WebSocket Server on {self.host}:{self.port}")
            
            self.server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10
            )
            
            logger.info(f"✅ Jaw WebSocket Server running on ws://{self.host}:{self.port}")
            
            # Keep server running
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"❌ Server error: {e}")
            return False
        finally:
            self.cleanup()

def main():
    """Main function to run the server"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Jaw Control WebSocket Server")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--port", type=int, default=8765, help="Server port")
    parser.add_argument("--servo-pin", type=int, default=18, help="GPIO pin for servo")
    
    args = parser.parse_args()
    
    # Create and start server
    server = JawWebSocketServer(
        host=args.host,
        port=args.port,
        servo_pin=args.servo_pin
    )
    
    try:
        asyncio.run(server.start_server())
    except KeyboardInterrupt:
        logger.info("Server interrupted by user")
    except Exception as e:
        logger.error(f"Server error: {e}")

if __name__ == "__main__":
    main()
