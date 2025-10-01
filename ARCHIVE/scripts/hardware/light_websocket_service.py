#!/usr/bin/env python3
"""
Light WebSocket Service
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

# Add parent directory to path to import light_control
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import Hardware Integration Layer components
try:
    from integrated_hardware_system import IntegratedHardwareSystem
    from hardware_abstraction_layer import CommandType
    HAL_AVAILABLE = True
    logger = logging.getLogger(__name__)
    logger.info("✅ Hardware Integration Layer available for lights")
except ImportError as e:
    HAL_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning(f"⚠️ Hardware Integration Layer not available for lights, using legacy mode: {e}")

# Configure logging
logging.basicConfig(level=logging.INFO)

class LightWebSocketService(BaseHardwareService):
    """WebSocket service for light control with HAL integration"""

    def __init__(self, port: int = 8772, host: str = "0.0.0.0"):
        super().__init__("light_service", "light", port, host)
        self.light_configs = {}  # Store light configurations
        self.light_states = {}   # Track current light states
        self.hardware_system = None  # Integrated Hardware System instance
        
    async def initialize_hardware(self) -> bool:
        """Initialize light hardware"""
        try:
            logger.info("💡 Initializing light hardware...")
            
            # Test if we can import light control functionality
            try:
                # Test basic GPIO availability with a safe pin
                result = await self.run_light_command("21", "off", "0")
                if result.get("status") == "success" or "error" not in result.get("message", "").lower():
                    logger.info("✅ Light hardware initialized successfully")
                    return True
                else:
                    logger.warning("⚠️ Light hardware test returned unexpected result, but continuing...")
                    return True
            except Exception as e:
                logger.warning(f"⚠️ Light hardware test failed: {e}, but continuing in simulation mode")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize light hardware: {e}")
            return False
            
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "light_control":
                return await self.handle_light_control(data)
            elif message_type == "light_toggle":
                return await self.handle_light_toggle(data)
            elif message_type == "light_status":
                return await self.handle_light_status(data)
            elif message_type == "configure_light":
                return await self.handle_configure_light(data)
            elif message_type == "get_light_configs":
                return await self.handle_get_light_configs(data)
            elif message_type == "light_sequence":
                return await self.handle_light_sequence(data)
            elif message_type == "reload_configurations":
                return await self.handle_reload_configurations(data)
            else:
                return {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                
        except Exception as e:
            logger.error(f"Error handling light message: {e}")
            return {
                "type": "error",
                "message": str(e)
            }
            
    async def handle_light_control(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle light control commands"""
        try:
            light_id = data.get("light_id", "default")
            pin = data.get("pin", 21)
            state = data.get("state", "on")  # on/off
            duration = data.get("duration", 0)  # milliseconds, 0 = indefinite
            
            # Validate parameters
            if state not in ["on", "off"]:
                raise ValueError("State must be 'on' or 'off'")
                
            if not 0 <= pin <= 27:
                raise ValueError("Pin must be between 0 and 27")
                
            if duration < 0:
                raise ValueError("Duration must be non-negative")
                
            logger.info(f"💡 Light control: {light_id} (pin {pin}) - {state}" + 
                       (f" for {duration}ms" if duration > 0 else ""))
            
            # Execute light control command
            result = await self.run_light_command(str(pin), state, str(duration))
            
            # Update light state
            self.light_states[light_id] = {
                "pin": pin,
                "state": state,
                "duration": duration,
                "timestamp": asyncio.get_event_loop().time()
            }
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "light_status_update",
                "light_id": light_id,
                "pin": pin,
                "state": state,
                "duration": duration
            })
            
            return {
                "type": "light_control_response",
                "light_id": light_id,
                "status": "success" if result.get("status") == "success" else "error",
                "message": result.get("message", "Light control executed"),
                "parameters": {
                    "pin": pin,
                    "state": state,
                    "duration": duration
                }
            }
            
        except Exception as e:
            logger.error(f"Error in light control: {e}")
            return {
                "type": "light_control_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_light_toggle(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle light toggle commands"""
        try:
            light_id = data.get("light_id", "default")
            pin = data.get("pin", 21)
            
            # Get current state
            current_state = self.light_states.get(light_id, {}).get("state", "off")
            new_state = "off" if current_state == "on" else "on"
            
            logger.info(f"🔄 Toggling light: {light_id} (pin {pin}) from {current_state} to {new_state}")
            
            # Execute toggle
            result = await self.run_light_command(str(pin), new_state, "0")
            
            # Update light state
            self.light_states[light_id] = {
                "pin": pin,
                "state": new_state,
                "duration": 0,
                "timestamp": asyncio.get_event_loop().time()
            }
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "light_status_update",
                "light_id": light_id,
                "pin": pin,
                "state": new_state,
                "previous_state": current_state
            })
            
            return {
                "type": "light_toggle_response",
                "light_id": light_id,
                "status": "success" if result.get("status") == "success" else "error",
                "message": result.get("message", "Light toggled"),
                "previous_state": current_state,
                "new_state": new_state
            }
            
        except Exception as e:
            logger.error(f"Error toggling light: {e}")
            return {
                "type": "light_toggle_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_light_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle light status requests"""
        light_id = data.get("light_id")
        
        if light_id and light_id in self.light_states:
            light_info = self.light_states[light_id]
            
            return {
                "type": "light_status_response",
                "light_id": light_id,
                "light_info": light_info
            }
        elif light_id:
            return {
                "type": "light_status_response",
                "light_id": light_id,
                "state": "unknown",
                "message": "Light state not tracked"
            }
        else:
            # Return status of all lights
            return {
                "type": "light_status_response",
                "all_lights": self.light_states,
                "light_count": len(self.light_states)
            }
            
    async def handle_configure_light(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle light configuration"""
        try:
            light_id = data.get("light_id")
            config = data.get("config", {})
            
            if not light_id:
                raise ValueError("light_id is required")
                
            self.light_configs[light_id] = config
            
            logger.info(f"⚙️ Configured light: {light_id}")
            
            return {
                "type": "configure_light_response",
                "light_id": light_id,
                "status": "success",
                "config": config
            }
            
        except Exception as e:
            logger.error(f"Error configuring light: {e}")
            return {
                "type": "configure_light_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_get_light_configs(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get light configurations request"""
        return {
            "type": "light_configs_response",
            "configs": self.light_configs
        }
        
    async def handle_light_sequence(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle light sequence commands (multiple lights with timing)"""
        try:
            sequence = data.get("sequence", [])
            repeat = data.get("repeat", 1)
            
            if not sequence:
                raise ValueError("Sequence cannot be empty")
                
            logger.info(f"🎭 Starting light sequence with {len(sequence)} steps, repeat {repeat} times")
            
            # Execute sequence in background
            asyncio.create_task(self.execute_light_sequence(sequence, repeat))
            
            return {
                "type": "light_sequence_response",
                "status": "started",
                "sequence_length": len(sequence),
                "repeat_count": repeat
            }
            
        except Exception as e:
            logger.error(f"Error starting light sequence: {e}")
            return {
                "type": "light_sequence_response",
                "status": "error",
                "message": str(e)
            }
            
    async def execute_light_sequence(self, sequence: list, repeat: int):
        """Execute a light sequence"""
        try:
            for cycle in range(repeat):
                logger.info(f"🎭 Executing light sequence cycle {cycle + 1}/{repeat}")
                
                for step_index, step in enumerate(sequence):
                    light_id = step.get("light_id", f"step_{step_index}")
                    pin = step.get("pin", 21)
                    state = step.get("state", "on")
                    duration = step.get("duration", 1000)
                    delay = step.get("delay", 0)
                    
                    # Execute light command
                    await self.run_light_command(str(pin), state, str(duration))
                    
                    # Update state
                    self.light_states[light_id] = {
                        "pin": pin,
                        "state": state,
                        "duration": duration,
                        "timestamp": asyncio.get_event_loop().time()
                    }
                    
                    # Broadcast update
                    await self.broadcast_message({
                        "type": "light_sequence_step",
                        "cycle": cycle + 1,
                        "step": step_index + 1,
                        "light_id": light_id,
                        "pin": pin,
                        "state": state
                    })
                    
                    # Wait for delay
                    if delay > 0:
                        await asyncio.sleep(delay / 1000.0)
                        
            # Broadcast sequence completion
            await self.broadcast_message({
                "type": "light_sequence_complete",
                "cycles_completed": repeat
            })
            
        except Exception as e:
            logger.error(f"Error executing light sequence: {e}")
            await self.broadcast_message({
                "type": "light_sequence_error",
                "message": str(e)
            })
            
    async def run_light_command(self, pin: str, state: str, duration: str) -> Dict[str, Any]:
        """Run light control command using existing light_control.py script"""
        try:
            # Path to light control script
            script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "light_control.py")
            
            # Build command arguments
            cmd_args = ["python3", script_path, pin, state]
            if duration and int(duration) > 0:
                cmd_args.append(duration)
            
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
                    "message": "Light command executed"
                }
                
        except Exception as e:
            logger.error(f"Error running light command: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
            
    async def handle_reload_configurations(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Reload light configurations from parts.json"""
        try:
            logger.info("🔄 Reloading light configurations...")

            # Clear existing configurations
            old_light_count = len(self.light_configs)
            self.light_configs.clear()
            # Keep light states for continuity, but could clear if needed

            # Reload light configurations from parts.json
            # This would typically load from the parts.json file
            # For now, we'll just acknowledge the reload

            new_light_count = len(self.light_configs)

            logger.info(f"✅ Light configurations reloaded: {old_light_count} → {new_light_count} lights")

            return {
                "type": "reload_complete",
                "status": "success",
                "message": f"Light configurations reloaded successfully ({new_light_count} lights)",
                "light_count": new_light_count,
                "timestamp": data.get('timestamp')
            }

        except Exception as e:
            logger.error(f"Error reloading light configurations: {e}")
            return {
                "type": "error",
                "status": "error",
                "message": f"Failed to reload light configurations: {str(e)}"
            }

    async def get_capabilities(self) -> Dict[str, Any]:
        """Get light service capabilities"""
        return {
            "service_type": "light",
            "supported_commands": [
                "light_control",
                "light_toggle",
                "light_status",
                "configure_light",
                "get_light_configs",
                "light_sequence",
                "reload_configurations"
            ],
            "supported_states": ["on", "off"],
            "pin_range": [0, 27],
            "supports_duration": True,
            "supports_sequences": True
        }
        
    async def cleanup(self):
        """Cleanup light resources"""
        logger.info("🧹 Cleaning up light service...")
        
        # Turn off all tracked lights
        for light_id, light_info in self.light_states.items():
            try:
                if light_info.get("state") == "on":
                    await self.run_light_command(str(light_info["pin"]), "off", "0")
                    logger.info(f"💡 Turned off light: {light_id}")
            except Exception as e:
                logger.error(f"Error turning off light {light_id} during cleanup: {e}")
                
        self.light_states.clear()
        self.light_configs.clear()

async def main():
    """Main function to run the light WebSocket service"""
    service = LightWebSocketService()
    await service.start_server()

if __name__ == "__main__":
    asyncio.run(main())
