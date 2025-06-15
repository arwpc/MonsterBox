#!/usr/bin/env python3
"""
Hardware Service Registry
Manages service discovery and registration for hardware WebSocket services
"""

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional
import websockets
from dataclasses import dataclass, asdict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ServiceInfo:
    """Information about a registered service"""
    service_name: str
    service_type: str
    host: str
    port: int
    capabilities: Dict[str, Any]
    status: str
    registered_at: float
    last_heartbeat: float
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class ServiceRegistry:
    """Central registry for hardware services"""
    
    def __init__(self, registry_port: int = 8770, host: str = "0.0.0.0"):
        self.host = host
        self.port = registry_port
        self.services: Dict[str, ServiceInfo] = {}
        self.connected_clients = set()
        self.server = None
        self.is_running = False
        self.heartbeat_timeout = 60  # seconds
        
    async def start_registry(self):
        """Start the service registry WebSocket server"""
        if self.is_running:
            logger.warning("Service registry is already running")
            return
            
        try:
            logger.info(f"🚀 Starting Service Registry on {self.host}:{self.port}")
            
            self.server = await websockets.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=30,
                ping_timeout=10
            )
            
            self.is_running = True
            logger.info(f"✅ Service Registry running on ws://{self.host}:{self.port}")
            
            # Start heartbeat monitor
            asyncio.create_task(self.monitor_services())
            
            await self.server.wait_closed()
            
        except Exception as e:
            logger.error(f"❌ Failed to start service registry: {e}")
            return False
            
    async def stop_registry(self):
        """Stop the service registry"""
        if not self.is_running:
            return
            
        logger.info("🛑 Stopping Service Registry")
        
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
        
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections"""
        client_id = f"registry_client_{len(self.connected_clients)}_{id(websocket)}"
        self.connected_clients.add(websocket)
        
        logger.info(f"✅ Client connected to registry: {client_id}")
        
        try:
            # Send welcome message with current services
            await self.send_service_list(websocket)
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_registry_message(websocket, data)
                    
                except json.JSONDecodeError:
                    error_response = {
                        "type": "error",
                        "message": "Invalid JSON format"
                    }
                    await websocket.send(json.dumps(error_response))
                    
                except Exception as e:
                    logger.error(f"Error handling registry message: {e}")
                    error_response = {
                        "type": "error",
                        "message": str(e)
                    }
                    await websocket.send(json.dumps(error_response))
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Registry client disconnected: {client_id}")
        except Exception as e:
            logger.error(f"Error in registry client handler: {e}")
        finally:
            self.connected_clients.discard(websocket)
            
    async def handle_registry_message(self, websocket, data: Dict[str, Any]):
        """Handle incoming registry messages"""
        message_type = data.get("type")
        
        if message_type == "register_service":
            await self.register_service(websocket, data)
        elif message_type == "unregister_service":
            await self.unregister_service(websocket, data)
        elif message_type == "heartbeat":
            await self.handle_heartbeat(websocket, data)
        elif message_type == "get_services":
            await self.send_service_list(websocket)
        elif message_type == "get_service":
            await self.send_service_info(websocket, data)
        else:
            error_response = {
                "type": "error",
                "message": f"Unknown message type: {message_type}"
            }
            await websocket.send(json.dumps(error_response))
            
    async def register_service(self, websocket, data: Dict[str, Any]):
        """Register a new service"""
        try:
            service_name = data.get("service_name")
            service_type = data.get("service_type")
            host = data.get("host", "localhost")
            port = data.get("port")
            capabilities = data.get("capabilities", {})
            
            if not all([service_name, service_type, port]):
                raise ValueError("Missing required fields: service_name, service_type, port")
                
            # Create service info
            service_info = ServiceInfo(
                service_name=service_name,
                service_type=service_type,
                host=host,
                port=port,
                capabilities=capabilities,
                status="active",
                registered_at=time.time(),
                last_heartbeat=time.time()
            )
            
            # Register the service
            self.services[service_name] = service_info
            
            logger.info(f"📝 Registered service: {service_name} ({service_type}) on {host}:{port}")
            
            # Send confirmation
            response = {
                "type": "service_registered",
                "service_name": service_name,
                "status": "success"
            }
            await websocket.send(json.dumps(response))
            
            # Broadcast service update to all clients
            await self.broadcast_service_update("service_added", service_info)
            
        except Exception as e:
            logger.error(f"Error registering service: {e}")
            error_response = {
                "type": "error",
                "message": f"Failed to register service: {str(e)}"
            }
            await websocket.send(json.dumps(error_response))
            
    async def unregister_service(self, websocket, data: Dict[str, Any]):
        """Unregister a service"""
        try:
            service_name = data.get("service_name")
            
            if not service_name:
                raise ValueError("Missing service_name")
                
            if service_name in self.services:
                service_info = self.services[service_name]
                del self.services[service_name]
                
                logger.info(f"🗑️ Unregistered service: {service_name}")
                
                # Send confirmation
                response = {
                    "type": "service_unregistered",
                    "service_name": service_name,
                    "status": "success"
                }
                await websocket.send(json.dumps(response))
                
                # Broadcast service update to all clients
                await self.broadcast_service_update("service_removed", service_info)
                
            else:
                response = {
                    "type": "error",
                    "message": f"Service {service_name} not found"
                }
                await websocket.send(json.dumps(response))
                
        except Exception as e:
            logger.error(f"Error unregistering service: {e}")
            error_response = {
                "type": "error",
                "message": f"Failed to unregister service: {str(e)}"
            }
            await websocket.send(json.dumps(error_response))
            
    async def handle_heartbeat(self, websocket, data: Dict[str, Any]):
        """Handle service heartbeat"""
        service_name = data.get("service_name")
        
        if service_name and service_name in self.services:
            self.services[service_name].last_heartbeat = time.time()
            self.services[service_name].status = "active"
            
            response = {
                "type": "heartbeat_ack",
                "service_name": service_name,
                "timestamp": time.time()
            }
            await websocket.send(json.dumps(response))
            
    async def send_service_list(self, websocket):
        """Send list of all registered services"""
        services_data = {
            "type": "service_list",
            "services": [service.to_dict() for service in self.services.values()],
            "count": len(self.services)
        }
        await websocket.send(json.dumps(services_data))
        
    async def send_service_info(self, websocket, data: Dict[str, Any]):
        """Send information about a specific service"""
        service_name = data.get("service_name")
        
        if service_name and service_name in self.services:
            service_data = {
                "type": "service_info",
                "service": self.services[service_name].to_dict()
            }
            await websocket.send(json.dumps(service_data))
        else:
            error_response = {
                "type": "error",
                "message": f"Service {service_name} not found"
            }
            await websocket.send(json.dumps(error_response))
            
    async def broadcast_service_update(self, update_type: str, service_info: ServiceInfo):
        """Broadcast service updates to all connected clients"""
        if not self.connected_clients:
            return
            
        message = {
            "type": update_type,
            "service": service_info.to_dict(),
            "timestamp": time.time()
        }
        
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
        
    async def monitor_services(self):
        """Monitor service health and remove inactive services"""
        while self.is_running:
            try:
                current_time = time.time()
                inactive_services = []
                
                for service_name, service_info in self.services.items():
                    if current_time - service_info.last_heartbeat > self.heartbeat_timeout:
                        inactive_services.append(service_name)
                        service_info.status = "inactive"
                        
                # Remove inactive services
                for service_name in inactive_services:
                    service_info = self.services[service_name]
                    del self.services[service_name]
                    logger.warning(f"⚠️ Removed inactive service: {service_name}")
                    await self.broadcast_service_update("service_removed", service_info)
                    
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"Error in service monitor: {e}")
                await asyncio.sleep(30)

# Global registry instance
registry = ServiceRegistry()

async def main():
    """Main function to run the service registry"""
    await registry.start_registry()

if __name__ == "__main__":
    asyncio.run(main())
