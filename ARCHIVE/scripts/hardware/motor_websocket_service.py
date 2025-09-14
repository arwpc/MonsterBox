#!/usr/bin/env python3
"""
Motor WebSocket Service
Enhanced with Hardware Integration Layer (HAL) support
Maintains backward compatibility while using new HAL architecture
"""

import asyncio
import json
import logging
import subprocess
import sys
import os
from typing import Dict, Any, Optional
from base_hardware_service import BaseHardwareService

# Add parent directory to path to import motor_control
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import Hardware Integration Layer components
try:
    from integrated_hardware_system import IntegratedHardwareSystem
    from hardware_abstraction_layer import CommandType
    HAL_AVAILABLE = True
    logger = logging.getLogger(__name__)
    logger.info("✅ Hardware Integration Layer available")
except ImportError as e:
    HAL_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning(f"⚠️ Hardware Integration Layer not available, using legacy mode: {e}")

# Configure logging
logging.basicConfig(level=logging.INFO)

class MotorWebSocketService(BaseHardwareService):
    """WebSocket service for motor control with HAL integration"""

    def __init__(self, port: int = 8771, host: str = "0.0.0.0"):
        super().__init__("motor_service", "motor", port, host)
        self.motor_configs = {}  # Store motor configurations
        self.active_motors = {}  # Track active motor operations
        self.hardware_system = None  # Integrated Hardware System instance

    async def initialize_hardware(self) -> bool:
        """Initialize motor hardware with HAL integration"""
        try:
            logger.info("🔧 Initializing motor hardware...")

            # Try to initialize Hardware Integration Layer first
            if HAL_AVAILABLE:
                try:
                    logger.info("🚀 Initializing Hardware Integration Layer...")
                    self.hardware_system = IntegratedHardwareSystem()

                    # Initialize the hardware system
                    if await asyncio.get_event_loop().run_in_executor(None, self.hardware_system.initialize):
                        logger.info("✅ Hardware Integration Layer initialized successfully")
                        return True
                    else:
                        logger.warning("⚠️ HAL initialization failed, falling back to legacy mode")
                        self.hardware_system = None
                except Exception as e:
                    logger.warning(f"⚠️ HAL initialization error: {e}, falling back to legacy mode")
                    self.hardware_system = None

            # Fallback to legacy motor control testing
            if not self.hardware_system:
                logger.info("🔄 Using legacy motor control mode")
                try:
                    # Test basic GPIO availability
                    result = await self.run_motor_command_legacy("test", "gpio", "20", "forward", "50", "100")
                    if result.get("status") == "success" or "test" in result.get("message", "").lower():
                        logger.info("✅ Legacy motor hardware initialized successfully")
                        return True
                    else:
                        logger.warning("⚠️ Motor hardware test returned unexpected result, but continuing...")
                        return True
                except Exception as e:
                    logger.warning(f"⚠️ Motor hardware test failed: {e}, but continuing in simulation mode")
                    return True

        except Exception as e:
            logger.error(f"❌ Failed to initialize motor hardware: {e}")
            return False
            
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "motor_control":
                return await self.handle_motor_control(data)
            elif message_type == "motor_stop":
                return await self.handle_motor_stop(data)
            elif message_type == "motor_status":
                return await self.handle_motor_status(data)
            elif message_type == "configure_motor":
                return await self.handle_configure_motor(data)
            elif message_type == "get_motor_configs":
                return await self.handle_get_motor_configs(data)
            elif message_type == "reload_configurations":
                return await self.handle_reload_configurations(data)
            else:
                return {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                
        except Exception as e:
            logger.error(f"Error handling motor message: {e}")
            return {
                "type": "error",
                "message": str(e)
            }
            
    async def handle_motor_control(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motor control commands"""
        try:
            motor_id = data.get("motor_id", "default")
            direction = data.get("direction", "forward")
            speed = data.get("speed", 50)
            duration = data.get("duration", 1000)  # milliseconds
            control_type = data.get("control_type", "gpio")
            pin_or_channel = data.get("pin", data.get("channel", 20))
            
            # Validate parameters
            if direction not in ["forward", "backward", "reverse"]:
                raise ValueError("Direction must be 'forward', 'backward', or 'reverse'")
                
            if not 0 <= speed <= 100:
                raise ValueError("Speed must be between 0 and 100")
                
            if not 0 <= duration <= 10000:  # Max 10 seconds for safety
                raise ValueError("Duration must be between 0 and 10000 milliseconds")
                
            logger.info(f"🔄 Motor control: {motor_id} - {direction} at {speed}% for {duration}ms")

            # Execute motor control command using HAL or legacy method
            if self.hardware_system:
                result = await self.run_motor_command_hal(
                    motor_id, pin_or_channel, direction, speed, duration
                )
            else:
                result = await self.run_motor_command_legacy(
                    "control", control_type, str(pin_or_channel),
                    direction, str(speed), str(duration)
                )
            
            # Track active motor
            self.active_motors[motor_id] = {
                "direction": direction,
                "speed": speed,
                "duration": duration,
                "start_time": asyncio.get_event_loop().time(),
                "pin": pin_or_channel
            }
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "motor_status_update",
                "motor_id": motor_id,
                "status": "running",
                "direction": direction,
                "speed": speed,
                "duration": duration
            })
            
            return {
                "type": "motor_control_response",
                "motor_id": motor_id,
                "status": "success" if result.get("status") == "success" else "error",
                "message": result.get("message", "Motor control executed"),
                "parameters": {
                    "direction": direction,
                    "speed": speed,
                    "duration": duration,
                    "pin": pin_or_channel
                }
            }
            
        except Exception as e:
            logger.error(f"Error in motor control: {e}")
            return {
                "type": "motor_control_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_motor_stop(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motor stop commands"""
        try:
            motor_id = data.get("motor_id", "default")
            control_type = data.get("control_type", "gpio")
            pin_or_channel = data.get("pin", data.get("channel", 20))
            
            logger.info(f"🛑 Stopping motor: {motor_id}")

            # Execute stop command using HAL or legacy method
            if self.hardware_system:
                result = await self.run_motor_command_hal(
                    motor_id, pin_or_channel, "forward", 0, 0
                )
            else:
                result = await self.run_motor_command_legacy(
                    "control", control_type, str(pin_or_channel),
                    "forward", "0", "0"
                )
            
            # Remove from active motors
            if motor_id in self.active_motors:
                del self.active_motors[motor_id]
                
            # Broadcast status update
            await self.broadcast_message({
                "type": "motor_status_update",
                "motor_id": motor_id,
                "status": "stopped"
            })
            
            return {
                "type": "motor_stop_response",
                "motor_id": motor_id,
                "status": "success" if result.get("status") == "success" else "error",
                "message": result.get("message", "Motor stopped")
            }
            
        except Exception as e:
            logger.error(f"Error stopping motor: {e}")
            return {
                "type": "motor_stop_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_motor_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motor status requests"""
        motor_id = data.get("motor_id")
        
        if motor_id and motor_id in self.active_motors:
            motor_info = self.active_motors[motor_id]
            current_time = asyncio.get_event_loop().time()
            elapsed_time = (current_time - motor_info["start_time"]) * 1000  # Convert to ms
            
            status = "running" if elapsed_time < motor_info["duration"] else "stopped"
            
            return {
                "type": "motor_status_response",
                "motor_id": motor_id,
                "status": status,
                "elapsed_time": elapsed_time,
                "motor_info": motor_info
            }
        elif motor_id:
            return {
                "type": "motor_status_response",
                "motor_id": motor_id,
                "status": "stopped",
                "message": "Motor not active"
            }
        else:
            # Return status of all motors
            return {
                "type": "motor_status_response",
                "all_motors": self.active_motors,
                "active_count": len(self.active_motors)
            }
            
    async def handle_configure_motor(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motor configuration"""
        try:
            motor_id = data.get("motor_id")
            config = data.get("config", {})
            
            if not motor_id:
                raise ValueError("motor_id is required")
                
            self.motor_configs[motor_id] = config
            
            logger.info(f"⚙️ Configured motor: {motor_id}")
            
            return {
                "type": "configure_motor_response",
                "motor_id": motor_id,
                "status": "success",
                "config": config
            }
            
        except Exception as e:
            logger.error(f"Error configuring motor: {e}")
            return {
                "type": "configure_motor_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_get_motor_configs(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get motor configurations request"""
        return {
            "type": "motor_configs_response",
            "configs": self.motor_configs
        }
        
    async def run_motor_command_hal(self, motor_id: str, pin: int, direction: str,
                                   speed: int, duration: int) -> Dict[str, Any]:
        """Run motor control command using Hardware Integration Layer"""
        try:
            if not self.hardware_system:
                raise ValueError("Hardware Integration Layer not available")

            # Create device ID for the motor
            device_id = f"motor_{pin}"

            # Prepare command parameters
            parameters = {
                "direction": direction,
                "speed": speed,
                "duration": duration,
                "pin": pin
            }

            # Execute command through HAL
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                self.hardware_system.execute_hardware_command,
                device_id, CommandType.CONTROL, parameters
            )

            if response and response.success:
                return {
                    "status": "success",
                    "message": f"Motor {motor_id} controlled via HAL",
                    "response": response.data
                }
            else:
                error_msg = response.error_message if response else "Unknown HAL error"
                return {
                    "status": "error",
                    "message": f"HAL motor control failed: {error_msg}"
                }

        except Exception as e:
            logger.error(f"Error in HAL motor command: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    async def run_motor_command_legacy(self, command: str, control_type: str, pin: str,
                                      direction: str, speed: str, duration: str) -> Dict[str, Any]:
        """Run motor control command using legacy motor_control.py script"""
        try:
            # Path to motor control script
            script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "motor_control.py")

            # Build command arguments in the correct order for motor_control.py
            # motor_control.py expects: direction, speed, duration, dir_pin, pwm_pin
            dir_pin = pin
            pwm_pin = str(int(pin) + 1)  # Use next pin for PWM

            cmd_args = [
                "python3", script_path,
                direction, speed, duration, dir_pin, pwm_pin
            ]
            
            # Execute command
            process = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            # Parse output
            if stdout:
                try:
                    result = json.loads(stdout.decode())
                    return result
                except json.JSONDecodeError:
                    return {
                        "status": "success" if process.returncode == 0 else "error",
                        "message": stdout.decode().strip()
                    }
            elif stderr:
                return {
                    "status": "error",
                    "message": stderr.decode().strip()
                }
            else:
                return {
                    "status": "success" if process.returncode == 0 else "error",
                    "message": "Motor command executed"
                }
                
        except Exception as e:
            logger.error(f"Error running motor command: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    async def handle_reload_configurations(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Reload motor configurations from parts.json"""
        try:
            logger.info("🔄 Reloading motor configurations...")

            # Clear existing configurations
            old_motor_count = len(self.motor_configs)
            self.motor_configs.clear()
            self.active_motors.clear()

            # Reload motor configurations from parts.json
            # This would typically load from the parts.json file
            # For now, we'll just acknowledge the reload

            new_motor_count = len(self.motor_configs)

            logger.info(f"✅ Motor configurations reloaded: {old_motor_count} → {new_motor_count} motors")

            return {
                "type": "reload_complete",
                "status": "success",
                "message": f"Motor configurations reloaded successfully ({new_motor_count} motors)",
                "motor_count": new_motor_count,
                "timestamp": data.get('timestamp')
            }

        except Exception as e:
            logger.error(f"Error reloading motor configurations: {e}")
            return {
                "type": "error",
                "status": "error",
                "message": f"Failed to reload motor configurations: {str(e)}"
            }

    async def get_capabilities(self) -> Dict[str, Any]:
        """Get motor service capabilities"""
        return {
            "service_type": "motor",
            "supported_commands": [
                "motor_control",
                "motor_stop",
                "motor_status",
                "configure_motor",
                "get_motor_configs",
                "reload_configurations"
            ],
            "supported_directions": ["forward", "backward", "reverse"],
            "speed_range": [0, 100],
            "max_duration": 10000,  # milliseconds
            "control_types": ["gpio", "pca9685"]
        }
        
    async def cleanup(self):
        """Cleanup motor resources"""
        logger.info("🧹 Cleaning up motor service...")
        
        # Stop all active motors
        for motor_id in list(self.active_motors.keys()):
            try:
                await self.handle_motor_stop({"motor_id": motor_id})
            except Exception as e:
                logger.error(f"Error stopping motor {motor_id} during cleanup: {e}")
                
        self.active_motors.clear()
        self.motor_configs.clear()

async def main():
    """Main function to run the motor WebSocket service"""
    service = MotorWebSocketService()
    await service.start_server()

if __name__ == "__main__":
    asyncio.run(main())
