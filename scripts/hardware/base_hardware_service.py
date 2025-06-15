#!/usr/bin/env python3
"""
Base Hardware Service Class
Provides common functionality for all hardware WebSocket services
Following ChatterPi WebSocket architecture pattern
"""

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Set
import websockets

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BaseHardwareService(ABC):
    """Base class for all hardware WebSocket services"""
    
    def __init__(self, service_name: str, service_type: str, port: int, host: str = "0.0.0.0"):
        self.service_name = service_name
        self.service_type = service_type
        self.host = host
        self.port = port
        self.connected_clients: Set[websockets.WebSocketServerProtocol] = set()
        self.is_running = False
        self.server = None
        self.status = {
            "service_name": service_name,
            "service_type": service_type,
            "status": "stopped",
            "connected_clients": 0,
            "start_time": None,
            "last_activity": None,
            "error_count": 0
        }
        
    async def start_server(self):
        """Start the WebSocket server"""
        if self.is_running:
            logger.warning(f"Service {self.service_name} is already running")
            return
            
        try:
            # Initialize hardware before starting server
            if not await self.initialize_hardware():
                logger.error(f"Failed to initialize hardware for {self.service_name}")
                return False
                
            logger.info(f"🚀 Starting {self.service_name} WebSocket Server on {self.host}:{self.port}")
            
            self.server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10
            )
            
            self.is_running = True
            self.status["status"] = "running"
            self.status["start_time"] = time.time()
            
            logger.info(f"✅ {self.service_name} WebSocket Server running on ws://{self.host}:{self.port}")
            
            # Register service with service registry
            await self.register_service()
            
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"❌ Failed to start {self.service_name} server: {e}")
            self.status["status"] = "error"
            self.status["error_count"] += 1
            return False
        finally:
            await self.cleanup()
            
    async def stop_server(self):
        """Stop the WebSocket server"""
        if not self.is_running:
            return
            
        logger.info(f"🛑 Stopping {self.service_name} WebSocket Server")
        
        # Close all client connections
        if self.connected_clients:
            await asyncio.gather(
                *[client.close() for client in self.connected_clients],
                return_exceptions=True
            )
            
        # Close server
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            
        self.is_running = False
        self.status["status"] = "stopped"
        
        # Unregister service
        await self.unregister_service()
        
        await self.cleanup()
        
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        client_id = f"{self.service_name}_client_{len(self.connected_clients)}_{id(websocket)}"
        self.connected_clients.add(websocket)
        self.status["connected_clients"] = len(self.connected_clients)
        
        logger.info(f"✅ Client connected to {self.service_name}: {client_id}")
        
        try:
            # Send welcome message
            await self.send_welcome_message(websocket)
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    self.status["last_activity"] = time.time()
                    
                    # Handle the message
                    response = await self.handle_message(websocket, data)
                    
                    if response:
                        await websocket.send(json.dumps(response))
                        
                except json.JSONDecodeError:
                    error_response = {
                        "type": "error",
                        "service": self.service_name,
                        "message": "Invalid JSON format"
                    }
                    await websocket.send(json.dumps(error_response))
                    
                except Exception as e:
                    logger.error(f"Error handling message in {self.service_name}: {e}")
                    self.status["error_count"] += 1
                    error_response = {
                        "type": "error",
                        "service": self.service_name,
                        "message": str(e)
                    }
                    await websocket.send(json.dumps(error_response))
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected from {self.service_name}: {client_id}")
        except Exception as e:
            logger.error(f"Error in client handler for {self.service_name}: {e}")
        finally:
            self.connected_clients.discard(websocket)
            self.status["connected_clients"] = len(self.connected_clients)
            
    async def send_welcome_message(self, websocket):
        """Send welcome message to newly connected client"""
        welcome_message = {
            "type": "welcome",
            "service": self.service_name,
            "service_type": self.service_type,
            "message": f"Connected to {self.service_name}",
            "capabilities": await self.get_capabilities(),
            "status": self.get_status()
        }
        await websocket.send(json.dumps(welcome_message))
        
    async def broadcast_message(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        if not self.connected_clients:
            return
            
        message["service"] = self.service_name
        message["timestamp"] = time.time()
        
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
        self.status["connected_clients"] = len(self.connected_clients)
        
    def get_status(self) -> Dict[str, Any]:
        """Get current service status"""
        return self.status.copy()
        
    # Abstract methods that must be implemented by subclasses
    @abstractmethod
    async def initialize_hardware(self) -> bool:
        """Initialize hardware components"""
        pass
        
    @abstractmethod
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        pass
        
    @abstractmethod
    async def get_capabilities(self) -> Dict[str, Any]:
        """Get service capabilities"""
        pass
        
    @abstractmethod
    async def cleanup(self):
        """Cleanup hardware resources"""
        pass
        
    async def register_service(self):
        """Register service with service registry"""
        # This will be implemented when we create the service registry
        pass
        
    async def unregister_service(self):
        """Unregister service from service registry"""
        # This will be implemented when we create the service registry
        pass
