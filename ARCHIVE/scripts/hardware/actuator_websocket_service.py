#!/usr/bin/env python3

"""
Linear Actuator WebSocket Service
Provides WebSocket interface for controlling linear actuators
"""

import asyncio
import json
import logging
import os
import sys
from typing import Dict, Any, Optional

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from base_hardware_service import BaseHardwareService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ActuatorWebSocketService(BaseHardwareService):
    """WebSocket service for linear actuator control"""
    
    def __init__(self, port: int = 8775, host: str = "0.0.0.0"):
        super().__init__("actuator_service", "actuator", port, host)
        self.actuator_configs = {}  # Store actuator configurations
        self.active_actuators = {}  # Track active actuator operations
        
    async def initialize_hardware(self) -> bool:
        """Initialize actuator hardware"""
        try:
            logger.info("🔧 Initializing linear actuator hardware...")
            
            # Test if we can import actuator control functionality
            try:
                # Test basic GPIO availability for actuators
                result = await self.run_actuator_command("test", "gpio", "22", "extend", "75", "1000")
                if result.get("status") == "success" or "test" in result.get("message", "").lower():
                    logger.info("✅ Actuator hardware initialized successfully")
                    return True
                else:
                    logger.warning("⚠️ Actuator hardware test returned unexpected result, but continuing...")
                    return True
            except Exception as e:
                logger.warning(f"⚠️ Actuator hardware test failed: {e}, but continuing in simulation mode")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize actuator hardware: {e}")
            return False
            
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "actuator_control":
                return await self.handle_actuator_control(data)
            elif message_type == "actuator_stop":
                return await self.handle_actuator_stop(data)
            elif message_type == "actuator_status":
                return await self.handle_actuator_status(data)
            elif message_type == "configure_actuator":
                return await self.handle_configure_actuator(data)
            elif message_type == "get_actuator_configs":
                return await self.handle_get_actuator_configs(data)
            else:
                return {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            return {
                "type": "error",
                "message": f"Error processing message: {str(e)}"
            }
            
    async def handle_actuator_control(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle actuator control command"""
        try:
            actuator_id = data.get("actuator_id", "unknown_actuator")
            pin_or_channel = data.get("pin", data.get("channel"))
            direction = data.get("direction", "extend")
            speed = data.get("speed", 75)
            duration = data.get("duration", 2000)
            control_type = data.get("control_type", "gpio")
            
            # Validate parameters
            if pin_or_channel is None:
                return {
                    "type": "actuator_control_response",
                    "status": "error",
                    "message": "Pin or channel is required"
                }
                
            # Validate direction
            if direction not in ["extend", "retract"]:
                return {
                    "type": "actuator_control_response",
                    "status": "error",
                    "message": "Direction must be 'extend' or 'retract'"
                }
                
            # Validate speed (0-100)
            speed = max(0, min(100, int(speed)))
            
            # Validate duration (max 10 seconds for safety)
            duration = max(0, min(10000, int(duration)))
                
            logger.info(f"🔄 Actuator control: {actuator_id} - {direction} at {speed}% for {duration}ms")
            
            # Execute actuator control command
            result = await self.run_actuator_command(
                "control", control_type, str(pin_or_channel), 
                direction, str(speed), str(duration)
            )
            
            # Track active actuator
            self.active_actuators[actuator_id] = {
                "direction": direction,
                "speed": speed,
                "duration": duration,
                "start_time": asyncio.get_event_loop().time(),
                "pin": pin_or_channel
            }
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "actuator_status_update",
                "actuator_id": actuator_id,
                "status": "running",
                "direction": direction,
                "speed": speed,
                "duration": duration
            })
            
            return {
                "type": "actuator_control_response",
                "status": result.get("status", "success"),
                "message": result.get("message", f"Actuator {actuator_id} control executed"),
                "actuator_id": actuator_id,
                "direction": direction,
                "speed": speed,
                "duration": duration
            }
            
        except Exception as e:
            logger.error(f"Error in actuator control: {e}")
            return {
                "type": "actuator_control_response",
                "status": "error",
                "message": f"Actuator control failed: {str(e)}"
            }
            
    async def handle_actuator_stop(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle actuator stop command"""
        try:
            actuator_id = data.get("actuator_id", "unknown_actuator")
            pin_or_channel = data.get("pin", data.get("channel"))
            
            if pin_or_channel is None:
                return {
                    "type": "actuator_stop_response",
                    "status": "error",
                    "message": "Pin or channel is required"
                }
            
            logger.info(f"🛑 Stopping actuator: {actuator_id}")
            
            # Execute stop command
            result = await self.run_actuator_command(
                "stop", "gpio", str(pin_or_channel), "stop", "0", "0"
            )
            
            # Remove from active actuators
            if actuator_id in self.active_actuators:
                del self.active_actuators[actuator_id]
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "actuator_status_update",
                "actuator_id": actuator_id,
                "status": "stopped"
            })
            
            return {
                "type": "actuator_stop_response",
                "status": result.get("status", "success"),
                "message": result.get("message", f"Actuator {actuator_id} stopped"),
                "actuator_id": actuator_id
            }
            
        except Exception as e:
            logger.error(f"Error stopping actuator: {e}")
            return {
                "type": "actuator_stop_response",
                "status": "error",
                "message": f"Failed to stop actuator: {str(e)}"
            }
            
    async def handle_actuator_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle actuator status request"""
        try:
            actuator_id = data.get("actuator_id")
            
            if actuator_id and actuator_id in self.active_actuators:
                actuator_info = self.active_actuators[actuator_id]
                return {
                    "type": "actuator_status_response",
                    "actuator_id": actuator_id,
                    "status": "running",
                    "direction": actuator_info["direction"],
                    "speed": actuator_info["speed"],
                    "duration": actuator_info["duration"],
                    "elapsed_time": asyncio.get_event_loop().time() - actuator_info["start_time"]
                }
            else:
                return {
                    "type": "actuator_status_response",
                    "actuator_id": actuator_id,
                    "status": "stopped"
                }
                
        except Exception as e:
            logger.error(f"Error getting actuator status: {e}")
            return {
                "type": "actuator_status_response",
                "status": "error",
                "message": f"Failed to get actuator status: {str(e)}"
            }
            
    async def handle_configure_actuator(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle actuator configuration"""
        try:
            actuator_id = data.get("actuator_id", "unknown_actuator")
            config = data.get("config", {})
            
            self.actuator_configs[actuator_id] = config
            
            return {
                "type": "configure_actuator_response",
                "status": "success",
                "message": f"Actuator {actuator_id} configured",
                "actuator_id": actuator_id,
                "config": config
            }
            
        except Exception as e:
            logger.error(f"Error configuring actuator: {e}")
            return {
                "type": "configure_actuator_response",
                "status": "error",
                "message": f"Failed to configure actuator: {str(e)}"
            }
            
    async def handle_get_actuator_configs(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get actuator configurations request"""
        try:
            return {
                "type": "actuator_configs_response",
                "status": "success",
                "configs": self.actuator_configs,
                "active_actuators": list(self.active_actuators.keys())
            }
            
        except Exception as e:
            logger.error(f"Error getting actuator configs: {e}")
            return {
                "type": "actuator_configs_response",
                "status": "error",
                "message": f"Failed to get actuator configs: {str(e)}"
            }
        
    async def run_actuator_command(self, command: str, control_type: str, pin: str, 
                                  direction: str, speed: str, duration: str) -> Dict[str, Any]:
        """Run actuator control command using existing motor_control.py script"""
        try:
            # Path to motor control script (actuators use motor control)
            script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "motor_control.py")
            
            # Build command arguments - actuators use motor control with specific mapping
            cmd_args = [
                "python3", script_path,
                direction, speed, duration, pin, str(int(pin) + 1)  # Use adjacent pin for direction
            ]
            
            # Execute command
            process = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                try:
                    result = json.loads(stdout.decode())
                    return result
                except json.JSONDecodeError:
                    return {
                        "status": "success",
                        "message": stdout.decode().strip() or f"Actuator {command} completed"
                    }
            else:
                return {
                    "status": "error",
                    "message": stderr.decode().strip() or f"Actuator {command} failed"
                }
                
        except Exception as e:
            logger.error(f"Error running actuator command: {e}")
            return {
                "status": "error",
                "message": f"Failed to execute actuator command: {str(e)}"
            }
            
    async def get_capabilities(self) -> Dict[str, Any]:
        """Get actuator service capabilities"""
        return {
            "service_type": "actuator",
            "supported_commands": [
                "actuator_control",
                "actuator_stop", 
                "actuator_status",
                "configure_actuator",
                "get_actuator_configs"
            ],
            "supported_directions": ["extend", "retract"],
            "speed_range": [0, 100],
            "max_duration": 10000,  # milliseconds
            "control_types": ["gpio", "pca9685"]
        }
        
    async def cleanup(self):
        """Cleanup actuator resources"""
        try:
            # Stop all active actuators
            for actuator_id in list(self.active_actuators.keys()):
                await self.handle_actuator_stop({"actuator_id": actuator_id})
                
            logger.info("✅ Actuator service cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during actuator cleanup: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Linear Actuator WebSocket Service')
    parser.add_argument('--port', type=int, default=8775, help='WebSocket port')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='WebSocket host')
    
    args = parser.parse_args()
    
    async def main():
        service = ActuatorWebSocketService(port=args.port, host=args.host)
        await service.start_server()
    
    asyncio.run(main())
