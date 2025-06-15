#!/usr/bin/env python3
"""
Character Service Manager
Manages dynamic loading and configuration of hardware services based on character requirements
Uses data/characters.json to determine which services to activate
"""

import asyncio
import json
import logging
import os
import sys
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from motor_websocket_service import MotorWebSocketService
from light_websocket_service import LightWebSocketService
from service_registry import ServiceRegistry

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ServiceConfig:
    """Configuration for a hardware service"""
    service_type: str
    service_class: Any
    port: int
    enabled: bool = True
    config: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.config is None:
            self.config = {}

class CharacterServiceManager:
    """Manages hardware services for different characters"""
    
    def __init__(self, characters_file: str = None):
        self.characters_file = characters_file or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            "data", "characters.json"
        )
        self.characters_data = {}
        self.active_services = {}
        self.service_registry = ServiceRegistry()
        self.current_character = None
        
        # Define available service types and their configurations
        self.available_services = {
            "motor": ServiceConfig("motor", MotorWebSocketService, 8771),
            "light": ServiceConfig("light", LightWebSocketService, 8772),
            # Add more services as they are implemented
            # "sensor": ServiceConfig("sensor", SensorWebSocketService, 8773),
            # "webcam": ServiceConfig("webcam", WebcamWebSocketService, 8774),
            # "actuator": ServiceConfig("actuator", ActuatorWebSocketService, 8775),
        }
        
    async def initialize(self):
        """Initialize the character service manager"""
        try:
            logger.info("🚀 Initializing Character Service Manager...")
            
            # Load character configurations
            await self.load_characters()
            
            # Start service registry
            asyncio.create_task(self.service_registry.start_registry())
            
            # Wait a moment for registry to start
            await asyncio.sleep(1)
            
            logger.info("✅ Character Service Manager initialized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Character Service Manager: {e}")
            return False
            
    async def load_characters(self):
        """Load character configurations from JSON file"""
        try:
            if not os.path.exists(self.characters_file):
                logger.warning(f"⚠️ Characters file not found: {self.characters_file}")
                # Create a default configuration
                self.characters_data = {
                    "characters": [
                        {
                            "id": 4,
                            "name": "Orlok",
                            "hardware_requirements": {
                                "motor": {"enabled": True, "pins": [20, 21]},
                                "light": {"enabled": True, "pins": [22, 23]},
                                "sensor": {"enabled": False},
                                "webcam": {"enabled": True},
                                "actuator": {"enabled": False}
                            }
                        }
                    ]
                }
                return
                
            with open(self.characters_file, 'r') as f:
                raw_data = json.load(f)

            # Handle both array and object formats
            if isinstance(raw_data, list):
                # Convert array to expected format
                self.characters_data = {"characters": raw_data}
            else:
                self.characters_data = raw_data

            logger.info(f"📋 Loaded {len(self.characters_data.get('characters', []))} character configurations")
            
        except Exception as e:
            logger.error(f"❌ Failed to load characters: {e}")
            self.characters_data = {"characters": []}
            
    async def get_character_requirements(self, character_id: int) -> Dict[str, Any]:
        """Get hardware requirements for a specific character"""
        characters = self.characters_data.get("characters", [])

        for character in characters:
            if character.get("id") == character_id:
                # Check if character has hardware_requirements field
                if "hardware_requirements" in character:
                    return character.get("hardware_requirements", {})

                # Otherwise, derive requirements from animatronic services
                animatronic = character.get("animatronic", {})
                if animatronic.get("enabled", False):
                    services = animatronic.get("services", [])
                    requirements = {}

                    # Map services to hardware requirements
                    if any("servo" in s or "motor" in s for s in services):
                        requirements["motor"] = {"enabled": True}
                    if any("gpio" in s or "light" in s or "led" in s for s in services):
                        requirements["light"] = {"enabled": True}
                    if "camera" in services:
                        requirements["webcam"] = {"enabled": True}
                    if "linear-actuator" in services:
                        requirements["actuator"] = {"enabled": True}
                    if any("sensor" in s for s in services):
                        requirements["sensor"] = {"enabled": True}

                    return requirements

        logger.warning(f"⚠️ Character {character_id} not found, using default requirements")
        return {
            "motor": {"enabled": True},
            "light": {"enabled": True},
            "sensor": {"enabled": False},
            "webcam": {"enabled": False},
            "actuator": {"enabled": False}
        }
        
    async def start_character_services(self, character_id: int) -> bool:
        """Start hardware services for a specific character"""
        try:
            logger.info(f"🎭 Starting services for character {character_id}")
            
            # Stop current character services if any
            if self.current_character is not None:
                await self.stop_character_services(self.current_character)
                
            # Get character requirements
            requirements = await self.get_character_requirements(character_id)
            
            # Start required services
            started_services = []
            for service_type, requirement in requirements.items():
                if requirement.get("enabled", False) and service_type in self.available_services:
                    service_config = self.available_services[service_type]
                    
                    try:
                        # Create service instance
                        service_instance = service_config.service_class(
                            port=service_config.port,
                            host="0.0.0.0"
                        )
                        
                        # Configure service with character-specific settings
                        if hasattr(service_instance, 'configure_for_character'):
                            await service_instance.configure_for_character(character_id, requirement)
                            
                        # Start service in background
                        service_task = asyncio.create_task(service_instance.start_server())
                        
                        # Store service reference
                        self.active_services[service_type] = {
                            "instance": service_instance,
                            "task": service_task,
                            "character_id": character_id,
                            "config": requirement
                        }
                        
                        started_services.append(service_type)
                        logger.info(f"✅ Started {service_type} service for character {character_id}")
                        
                        # Wait a moment for service to start
                        await asyncio.sleep(0.5)
                        
                    except Exception as e:
                        logger.error(f"❌ Failed to start {service_type} service: {e}")
                        
            self.current_character = character_id
            
            logger.info(f"🎭 Started {len(started_services)} services for character {character_id}: {started_services}")
            return len(started_services) > 0
            
        except Exception as e:
            logger.error(f"❌ Failed to start character services: {e}")
            return False
            
    async def stop_character_services(self, character_id: int = None) -> bool:
        """Stop hardware services for a character"""
        try:
            target_character = character_id or self.current_character
            
            if target_character is None:
                logger.info("ℹ️ No character services to stop")
                return True
                
            logger.info(f"🛑 Stopping services for character {target_character}")
            
            stopped_services = []
            for service_type, service_info in list(self.active_services.items()):
                if service_info["character_id"] == target_character:
                    try:
                        # Stop the service
                        service_instance = service_info["instance"]
                        await service_instance.stop_server()
                        
                        # Cancel the task
                        service_task = service_info["task"]
                        if not service_task.done():
                            service_task.cancel()
                            try:
                                await service_task
                            except asyncio.CancelledError:
                                pass
                                
                        # Remove from active services
                        del self.active_services[service_type]
                        stopped_services.append(service_type)
                        
                        logger.info(f"✅ Stopped {service_type} service")
                        
                    except Exception as e:
                        logger.error(f"❌ Error stopping {service_type} service: {e}")
                        
            if target_character == self.current_character:
                self.current_character = None
                
            logger.info(f"🛑 Stopped {len(stopped_services)} services: {stopped_services}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to stop character services: {e}")
            return False
            
    async def switch_character(self, new_character_id: int) -> bool:
        """Switch from current character to a new character"""
        try:
            logger.info(f"🔄 Switching from character {self.current_character} to {new_character_id}")
            
            # Stop current services
            if self.current_character is not None:
                await self.stop_character_services(self.current_character)
                
            # Start new character services
            success = await self.start_character_services(new_character_id)
            
            if success:
                logger.info(f"✅ Successfully switched to character {new_character_id}")
            else:
                logger.error(f"❌ Failed to switch to character {new_character_id}")
                
            return success
            
        except Exception as e:
            logger.error(f"❌ Error switching character: {e}")
            return False
            
    async def get_active_services(self) -> Dict[str, Any]:
        """Get information about currently active services"""
        active_info = {}
        
        for service_type, service_info in self.active_services.items():
            service_instance = service_info["instance"]
            active_info[service_type] = {
                "character_id": service_info["character_id"],
                "port": service_instance.port,
                "status": service_instance.get_status(),
                "config": service_info["config"]
            }
            
        return {
            "current_character": self.current_character,
            "active_services": active_info,
            "service_count": len(active_info)
        }
        
    async def get_available_characters(self) -> List[Dict[str, Any]]:
        """Get list of available characters"""
        characters = self.characters_data.get("characters", [])

        # Build character info list with async requirements gathering
        character_list = []
        for char in characters:
            char_info = {
                "id": char.get("id"),
                "name": char.get("char_name", char.get("name", "Unknown")),
                "description": char.get("char_description", ""),
                "animatronic_enabled": char.get("animatronic", {}).get("enabled", False),
                "hardware_requirements": await self.get_character_requirements(char.get("id"))
            }
            character_list.append(char_info)

        return character_list
        
    async def shutdown(self):
        """Shutdown all services and cleanup"""
        try:
            logger.info("🛑 Shutting down Character Service Manager...")
            
            # Stop all character services
            if self.current_character is not None:
                await self.stop_character_services(self.current_character)
                
            # Stop service registry
            await self.service_registry.stop_registry()
            
            logger.info("✅ Character Service Manager shutdown complete")
            
        except Exception as e:
            logger.error(f"❌ Error during shutdown: {e}")

async def main():
    """Main function for testing the character service manager"""
    manager = CharacterServiceManager()
    
    try:
        # Initialize manager
        await manager.initialize()
        
        # Start services for Orlok (character 4)
        await manager.start_character_services(4)
        
        # Keep running
        logger.info("🎭 Character Service Manager is running. Press Ctrl+C to stop.")
        while True:
            await asyncio.sleep(10)
            
            # Print status
            status = await manager.get_active_services()
            logger.info(f"📊 Active services: {status}")
            
    except KeyboardInterrupt:
        logger.info("⚠️ Received interrupt signal")
    finally:
        await manager.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
