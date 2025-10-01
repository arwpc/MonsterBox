#!/usr/bin/env python3
"""
Motion Sensor WebSocket Service
Dedicated service for PIR motion sensors with real-time detection
Wraps existing Python motion sensor scripts without modification
"""

import asyncio
import json
import logging
import subprocess
import sys
import os
import time
from typing import Dict, Any, Optional
from base_hardware_service import BaseHardwareService

# Add parent directory to path to import motion sensor scripts
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MotionSensorWebSocketService(BaseHardwareService):
    """WebSocket service for motion sensor control and monitoring"""

    def __init__(self, port: int = 8777, host: str = "0.0.0.0"):
        super().__init__("motion_sensor_service", "motion_sensor", port, host)
        self.sensor_configs = {}  # Store motion sensor configurations
        self.sensor_states = {}   # Track current motion sensor states
        self.monitoring_tasks = {}  # Track active monitoring tasks
        self.sensor_processes = {}  # Track active sensor processes
        
    async def initialize_hardware(self) -> bool:
        """Initialize motion sensor hardware"""
        try:
            logger.info("🔍 Initializing motion sensor hardware...")
            
            # Test if we can access motion sensor functionality
            try:
                # Test basic sensor script availability with a safe pin
                result = await self.run_motion_sensor_command("26", "test", "1")
                if result.get("status") == "success" or "error" not in result.get("message", "").lower():
                    logger.info("✅ Motion sensor hardware initialized successfully")
                    return True
                else:
                    logger.warning("⚠️ Motion sensor hardware test returned unexpected result, but continuing...")
                    return True
            except Exception as e:
                logger.warning(f"⚠️ Motion sensor hardware test failed: {e}, but continuing in simulation mode")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize motion sensor hardware: {e}")
            return False
            
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "motion_sensor_start":
                return await self.handle_motion_sensor_start(data)
            elif message_type == "motion_sensor_stop":
                return await self.handle_motion_sensor_stop(data)
            elif message_type == "motion_sensor_status":
                return await self.handle_motion_sensor_status(data)
            elif message_type == "configure_motion_sensor":
                return await self.handle_configure_motion_sensor(data)
            elif message_type == "get_motion_sensor_configs":
                return await self.handle_get_motion_sensor_configs(data)
            elif message_type == "motion_sensor_test":
                return await self.handle_motion_sensor_test(data)
            else:
                return {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                
        except Exception as e:
            logger.error(f"Error handling motion sensor message: {e}")
            return {
                "type": "error",
                "message": str(e)
            }
            
    async def handle_motion_sensor_start(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motion sensor start monitoring commands"""
        try:
            sensor_id = data.get("sensor_id", "default")
            pin = data.get("pin", 26)
            sensitivity = data.get("sensitivity", 0.1)  # seconds between readings
            duration = data.get("duration", 0)  # 0 = indefinite
            
            # Validate parameters
            if not 0 <= pin <= 27:
                raise ValueError("Pin must be between 0 and 27")
                
            if sensitivity < 0.05:
                raise ValueError("Sensitivity must be at least 0.05 seconds")
                
            logger.info(f"🔍 Starting motion sensor: {sensor_id} (pin {pin})" + 
                       (f" for {duration}s" if duration > 0 else " indefinitely"))
            
            # Stop existing monitoring if any
            if sensor_id in self.monitoring_tasks:
                await self.handle_motion_sensor_stop({"sensor_id": sensor_id})
            
            # Start monitoring task
            task = asyncio.create_task(
                self.monitor_motion_sensor(sensor_id, pin, sensitivity, duration)
            )
            self.monitoring_tasks[sensor_id] = task
            
            # Update sensor state
            self.sensor_states[sensor_id] = {
                "pin": pin,
                "status": "monitoring",
                "sensitivity": sensitivity,
                "duration": duration,
                "start_time": time.time(),
                "last_detection": None
            }
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "motion_sensor_status_update",
                "sensor_id": sensor_id,
                "pin": pin,
                "status": "monitoring",
                "sensitivity": sensitivity
            })
            
            return {
                "type": "motion_sensor_start_response",
                "sensor_id": sensor_id,
                "status": "success",
                "message": f"Motion sensor {sensor_id} monitoring started",
                "parameters": {
                    "pin": pin,
                    "sensitivity": sensitivity,
                    "duration": duration
                }
            }
            
        except Exception as e:
            logger.error(f"Error starting motion sensor: {e}")
            return {
                "type": "motion_sensor_start_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_motion_sensor_stop(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motion sensor stop monitoring commands"""
        try:
            sensor_id = data.get("sensor_id", "default")
            
            logger.info(f"🛑 Stopping motion sensor: {sensor_id}")
            
            # Stop monitoring task
            if sensor_id in self.monitoring_tasks:
                task = self.monitoring_tasks[sensor_id]
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                del self.monitoring_tasks[sensor_id]
            
            # Stop sensor process if running
            if sensor_id in self.sensor_processes:
                process = self.sensor_processes[sensor_id]
                try:
                    process.terminate()
                    await asyncio.sleep(0.1)
                    if process.returncode is None:
                        process.kill()
                except Exception as e:
                    logger.warning(f"Error stopping sensor process: {e}")
                del self.sensor_processes[sensor_id]
            
            # Update sensor state
            if sensor_id in self.sensor_states:
                self.sensor_states[sensor_id]["status"] = "stopped"
                self.sensor_states[sensor_id]["stop_time"] = time.time()
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "motion_sensor_status_update",
                "sensor_id": sensor_id,
                "status": "stopped"
            })
            
            return {
                "type": "motion_sensor_stop_response",
                "sensor_id": sensor_id,
                "status": "success",
                "message": f"Motion sensor {sensor_id} monitoring stopped"
            }
            
        except Exception as e:
            logger.error(f"Error stopping motion sensor: {e}")
            return {
                "type": "motion_sensor_stop_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_motion_sensor_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motion sensor status requests"""
        sensor_id = data.get("sensor_id")
        
        if sensor_id and sensor_id in self.sensor_states:
            sensor_info = self.sensor_states[sensor_id]
            
            return {
                "type": "motion_sensor_status_response",
                "sensor_id": sensor_id,
                "sensor_info": sensor_info
            }
        elif sensor_id:
            return {
                "type": "motion_sensor_status_response",
                "sensor_id": sensor_id,
                "status": "unknown",
                "message": "Motion sensor state not tracked"
            }
        else:
            # Return status of all motion sensors
            return {
                "type": "motion_sensor_status_response",
                "all_sensors": self.sensor_states,
                "sensor_count": len(self.sensor_states)
            }
            
    async def handle_configure_motion_sensor(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motion sensor configuration"""
        try:
            sensor_id = data.get("sensor_id")
            config = data.get("config", {})
            
            if not sensor_id:
                raise ValueError("sensor_id is required")
                
            self.sensor_configs[sensor_id] = config
            
            logger.info(f"⚙️ Configured motion sensor: {sensor_id}")
            
            return {
                "type": "configure_motion_sensor_response",
                "sensor_id": sensor_id,
                "status": "success",
                "config": config
            }
            
        except Exception as e:
            logger.error(f"Error configuring motion sensor: {e}")
            return {
                "type": "configure_motion_sensor_response",
                "status": "error",
                "message": str(e)
            }
            
    async def handle_get_motion_sensor_configs(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get motion sensor configurations request"""
        return {
            "type": "motion_sensor_configs_response",
            "configs": self.sensor_configs
        }
        
    async def handle_motion_sensor_test(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle motion sensor test request"""
        try:
            sensor_id = data.get("sensor_id", "test_sensor")
            pin = data.get("pin", 26)
            duration = data.get("duration", 2)  # Test for 2 seconds
            
            logger.info(f"🧪 Testing motion sensor: {sensor_id} (pin {pin}) for {duration}s")
            
            # Run test command
            result = await self.run_motion_sensor_command(str(pin), "test", str(duration))
            
            return {
                "type": "motion_sensor_test_response",
                "sensor_id": sensor_id,
                "status": "success" if result.get("status") == "success" else "error",
                "message": result.get("message", "Motion sensor test completed"),
                "test_result": result
            }
            
        except Exception as e:
            logger.error(f"Error testing motion sensor: {e}")
            return {
                "type": "motion_sensor_test_response",
                "status": "error",
                "message": str(e)
            }

    async def monitor_motion_sensor(self, sensor_id: str, pin: int, sensitivity: float, duration: int):
        """Background task to continuously monitor a motion sensor"""
        try:
            start_time = time.time()
            logger.info(f"🔍 Starting motion monitoring for sensor {sensor_id} on pin {pin}")

            while True:
                # Check if duration limit reached
                if duration > 0 and time.time() - start_time >= duration:
                    logger.info(f"⏰ Motion sensor {sensor_id} monitoring duration reached")
                    break

                try:
                    # Read motion sensor value
                    result = await self.run_motion_sensor_command(str(pin), "read", "1")

                    if result.get("status") == "success":
                        # Parse motion detection result
                        motion_detected = self.parse_motion_result(result)

                        # Update sensor state
                        current_state = self.sensor_states.get(sensor_id, {})
                        previous_motion = current_state.get("motion_detected", False)

                        self.sensor_states[sensor_id].update({
                            "motion_detected": motion_detected,
                            "last_reading": time.time(),
                            "reading_count": current_state.get("reading_count", 0) + 1
                        })

                        # Only broadcast on state change or first reading
                        if motion_detected != previous_motion or current_state.get("reading_count", 0) == 0:
                            if motion_detected:
                                self.sensor_states[sensor_id]["last_detection"] = time.time()

                            # Broadcast motion detection update
                            await self.broadcast_message({
                                "type": "motion_detection",
                                "sensor_id": sensor_id,
                                "pin": pin,
                                "motion_detected": motion_detected,
                                "timestamp": time.time(),
                                "status": "Motion Detected" if motion_detected else "No Motion"
                            })

                            logger.info(f"🔍 Motion sensor {sensor_id}: {'Motion Detected' if motion_detected else 'No Motion'}")

                    await asyncio.sleep(sensitivity)

                except asyncio.CancelledError:
                    logger.info(f"🛑 Motion sensor {sensor_id} monitoring cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error reading motion sensor {sensor_id}: {e}")
                    await asyncio.sleep(sensitivity)

        except Exception as e:
            logger.error(f"Error in motion sensor monitoring task: {e}")
        finally:
            # Clean up
            if sensor_id in self.sensor_states:
                self.sensor_states[sensor_id]["status"] = "stopped"
            logger.info(f"🔍 Motion sensor {sensor_id} monitoring ended")

    def parse_motion_result(self, result: Dict[str, Any]) -> bool:
        """Parse motion sensor result to determine if motion was detected"""
        try:
            # Check for motion detection in various result formats
            message = result.get("message", "").lower()
            if "motion detected" in message:
                return True
            elif "no motion" in message:
                return False

            # Check for JSON status in message
            if "status" in result:
                status = result["status"]
                if isinstance(status, str):
                    return "motion detected" in status.lower()
                elif isinstance(status, dict):
                    return status.get("motion_detected", False)

            # Default to no motion if unclear
            return False

        except Exception as e:
            logger.error(f"Error parsing motion result: {e}")
            return False

    async def run_motion_sensor_command(self, pin: str, command: str, duration: str) -> Dict[str, Any]:
        """Run motion sensor command using existing test_sensor.py script"""
        try:
            # Path to motion sensor test script
            script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test_sensor.py")

            # Build command arguments
            if command == "test" or command == "read":
                cmd_args = ["python3", script_path, pin]
                if duration and int(duration) > 0:
                    cmd_args.append(duration)
            else:
                raise ValueError(f"Unknown command: {command}")

            # Execute command
            process = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Wait for completion with timeout
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10.0)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return {
                    "status": "error",
                    "message": "Motion sensor command timed out"
                }

            # Parse output
            if stdout:
                try:
                    # Try to parse as JSON (test_sensor.py outputs JSON)
                    output_lines = stdout.decode().strip().split('\n')
                    if output_lines:
                        # Get the last line which should contain the result
                        last_line = output_lines[-1]
                        result = json.loads(last_line)
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
                    "message": "Motion sensor command executed"
                }

        except Exception as e:
            logger.error(f"Error running motion sensor command: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    async def get_capabilities(self) -> Dict[str, Any]:
        """Get motion sensor service capabilities"""
        return {
            "service_type": "motion_sensor",
            "supported_commands": [
                "motion_sensor_start",
                "motion_sensor_stop",
                "motion_sensor_status",
                "configure_motion_sensor",
                "get_motion_sensor_configs",
                "motion_sensor_test"
            ],
            "supported_sensor_types": ["pir", "motion"],
            "pin_range": [0, 27],
            "supports_continuous_monitoring": True,
            "supports_duration_limits": True,
            "min_sensitivity": 0.05
        }

    async def cleanup(self):
        """Cleanup motion sensor resources"""
        logger.info("🧹 Cleaning up motion sensor service...")

        # Stop all monitoring tasks
        for sensor_id in list(self.monitoring_tasks.keys()):
            try:
                await self.handle_motion_sensor_stop({"sensor_id": sensor_id})
                logger.info(f"🔍 Stopped motion sensor: {sensor_id}")
            except Exception as e:
                logger.error(f"Error stopping motion sensor {sensor_id} during cleanup: {e}")

        # Stop all sensor processes
        for sensor_id, process in list(self.sensor_processes.items()):
            try:
                process.terminate()
                await asyncio.sleep(0.1)
                if process.returncode is None:
                    process.kill()
                logger.info(f"🔍 Terminated motion sensor process: {sensor_id}")
            except Exception as e:
                logger.error(f"Error terminating motion sensor process {sensor_id}: {e}")

        self.sensor_states.clear()
        self.sensor_configs.clear()
        self.monitoring_tasks.clear()
        self.sensor_processes.clear()

async def main():
    """Main function to run the motion sensor WebSocket service"""
    service = MotionSensorWebSocketService()
    await service.start_server()

if __name__ == "__main__":
    asyncio.run(main())
