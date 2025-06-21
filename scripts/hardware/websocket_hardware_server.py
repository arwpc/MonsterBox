#!/usr/bin/env python3
"""
Main WebSocket Hardware Server
Coordinates all hardware services and provides unified interface
Following ChatterPi WebSocket architecture pattern
"""

import asyncio
import json
import logging
import signal
import sys
import os
from typing import Dict, Any, Set
import websockets

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from character_service_manager import CharacterServiceManager
from service_registry import ServiceRegistry

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WebSocketHardwareServer:
    """Main WebSocket server for hardware coordination"""
    
    def __init__(self, port: int = 8780, host: str = "0.0.0.0"):
        self.host = host
        self.port = port
        self.connected_clients: Set[websockets.WebSocketServerProtocol] = set()
        self.server = None
        self.is_running = False
        
        # Initialize managers
        self.character_manager = CharacterServiceManager()
        self.service_registry = ServiceRegistry()
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"⚠️ Received signal {signum}, initiating shutdown...")
        asyncio.create_task(self.shutdown())
        
    async def start_server(self):
        """Start the main WebSocket hardware server"""
        try:
            logger.info("🚀 Starting WebSocket Hardware Server...")
            
            # Initialize character manager
            if not await self.character_manager.initialize():
                logger.error("❌ Failed to initialize character manager")
                return False
                
            logger.info(f"🌐 Starting WebSocket server on {self.host}:{self.port}")
            
            # Add origin validation to accept browser connections
            def check_origin(origin):
                # Allow connections from localhost and any origin for development
                logger.info(f"🌐 WebSocket origin check: {origin}")
                return True

            self.server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10,
                origins=None  # Allow all origins
            )
            
            self.is_running = True
            logger.info(f"✅ WebSocket Hardware Server running on ws://{self.host}:{self.port}")
            
            # Start with default character (Orlok - ID 4)
            await self.character_manager.start_character_services(4)
            
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"❌ Failed to start WebSocket Hardware Server: {e}")
            return False
        finally:
            await self.shutdown()
            
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        client_id = f"hardware_client_{len(self.connected_clients)}_{id(websocket)}"
        self.connected_clients.add(websocket)
        
        logger.info(f"✅ Client connected to hardware server: {client_id}")
        
        try:
            # Send welcome message
            await self.send_welcome_message(websocket)
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    response = await self.handle_message(websocket, data)
                    
                    if response:
                        await websocket.send(json.dumps(response))
                        
                except json.JSONDecodeError:
                    error_response = {
                        "type": "error",
                        "message": "Invalid JSON format"
                    }
                    await websocket.send(json.dumps(error_response))
                    
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    error_response = {
                        "type": "error",
                        "message": str(e)
                    }
                    await websocket.send(json.dumps(error_response))
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {client_id}")
        except Exception as e:
            logger.error(f"Error in client handler: {e}")
        finally:
            self.connected_clients.discard(websocket)
            
    async def send_welcome_message(self, websocket):
        """Send welcome message to newly connected client"""
        active_services = await self.character_manager.get_active_services()
        available_characters = await self.character_manager.get_available_characters()
        
        welcome_message = {
            "type": "welcome",
            "service": "hardware_server",
            "message": "Connected to MonsterBox Hardware Server",
            "current_character": active_services.get("current_character"),
            "active_services": active_services.get("active_services", {}),
            "available_characters": available_characters,
            "capabilities": {
                "character_switching": True,
                "service_management": True,
                "real_time_monitoring": True,
                "supported_hardware": ["motor", "light", "sensor", "webcam", "microphone", "actuator"]
            }
        }
        await websocket.send(json.dumps(welcome_message))
        
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "switch_character":
                return await self.handle_switch_character(data)
            elif message_type == "get_active_services":
                return await self.handle_get_active_services(data)
            elif message_type == "get_available_characters":
                return await self.handle_get_available_characters(data)
            elif message_type == "start_character_services":
                return await self.handle_start_character_services(data)
            elif message_type == "stop_character_services":
                return await self.handle_stop_character_services(data)
            elif message_type == "get_service_status":
                return await self.handle_get_service_status(data)
            elif message_type == "ping":
                return {"type": "pong", "timestamp": asyncio.get_event_loop().time()}
            else:
                return {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                
        except Exception as e:
            logger.error(f"Error handling hardware server message: {e}")
            return {
                "type": "error",
                "message": str(e)
            }
            
    async def handle_switch_character(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle character switching requests"""
        try:
            character_id = data.get("character_id")
            
            if character_id is None:
                raise ValueError("character_id is required")
                
            logger.info(f"🔄 Switching to character {character_id}")
            
            success = await self.character_manager.switch_character(character_id)
            
            if success:
                # Broadcast character switch to all clients
                await self.broadcast_message({
                    "type": "character_switched",
                    "character_id": character_id,
                    "active_services": await self.character_manager.get_active_services()
                })
                
            return {
                "type": "switch_character_response",
                "character_id": character_id,
                "status": "success" if success else "error",
                "message": f"Character switched to {character_id}" if success else f"Failed to switch to character {character_id}"
            }
            
        except Exception as e:
            logger.error(f"Error switching character: {e}")
            return {
                "type": "switch_character_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_get_active_services(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get active services requests"""
        active_services = await self.character_manager.get_active_services()
        return {
            "type": "active_services_response",
            **active_services
        }
        
    async def handle_get_available_characters(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get available characters requests"""
        characters = await self.character_manager.get_available_characters()
        return {
            "type": "available_characters_response",
            "characters": characters
        }
        
    async def handle_start_character_services(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle start character services requests"""
        try:
            character_id = data.get("character_id")
            
            if character_id is None:
                raise ValueError("character_id is required")
                
            success = await self.character_manager.start_character_services(character_id)
            
            return {
                "type": "start_character_services_response",
                "character_id": character_id,
                "status": "success" if success else "error",
                "message": f"Services started for character {character_id}" if success else f"Failed to start services for character {character_id}"
            }
            
        except Exception as e:
            logger.error(f"Error starting character services: {e}")
            return {
                "type": "start_character_services_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_stop_character_services(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle stop character services requests"""
        try:
            character_id = data.get("character_id")
            
            success = await self.character_manager.stop_character_services(character_id)
            
            return {
                "type": "stop_character_services_response",
                "character_id": character_id,
                "status": "success" if success else "error",
                "message": f"Services stopped for character {character_id}" if success else f"Failed to stop services for character {character_id}"
            }
            
        except Exception as e:
            logger.error(f"Error stopping character services: {e}")
            return {
                "type": "stop_character_services_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_get_service_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get service status requests"""
        try:
            service_type = data.get("service_type")
            
            active_services = await self.character_manager.get_active_services()
            
            if service_type and service_type in active_services.get("active_services", {}):
                service_info = active_services["active_services"][service_type]
                return {
                    "type": "service_status_response",
                    "service_type": service_type,
                    "status": service_info
                }
            elif service_type:
                return {
                    "type": "service_status_response",
                    "service_type": service_type,
                    "status": "not_active",
                    "message": f"Service {service_type} is not active"
                }
            else:
                return {
                    "type": "service_status_response",
                    "all_services": active_services
                }
                
        except Exception as e:
            logger.error(f"Error getting service status: {e}")
            return {
                "type": "service_status_response",
                "status": "error",
                "message": str(e)
            }
            
    async def broadcast_message(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        if not self.connected_clients:
            return
            
        message["timestamp"] = asyncio.get_event_loop().time()
        
        # Send to all connected clients
        disconnected_clients = set()
        for client in self.connected_clients:
            try:
                await client.send(json.dumps(message))
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected_clients.add(client)
                
        # Remove disconnected clients
        self.connected_clients -= disconnected_clients
        
    async def shutdown(self):
        """Shutdown the hardware server"""
        if not self.is_running:
            return
            
        logger.info("🛑 Shutting down WebSocket Hardware Server...")
        
        try:
            # Close all client connections
            if self.connected_clients:
                await asyncio.gather(
                    *[client.close() for client in self.connected_clients],
                    return_exceptions=True
                )
                
            # Shutdown character manager
            await self.character_manager.shutdown()
            
            # Close server
            if self.server:
                self.server.close()
                await self.server.wait_closed()
                
            self.is_running = False
            logger.info("✅ WebSocket Hardware Server shutdown complete")
            
        except Exception as e:
            logger.error(f"❌ Error during shutdown: {e}")

async def main():
    """Main function to run the WebSocket hardware server"""
    server = WebSocketHardwareServer()
    
    try:
        await server.start_server()
    except KeyboardInterrupt:
        logger.info("⚠️ Received interrupt signal")
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
    finally:
        await server.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
