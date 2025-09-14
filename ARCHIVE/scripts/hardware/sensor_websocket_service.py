#!/usr/bin/env python3

"""
Sensor WebSocket Service
Provides WebSocket interface for monitoring various sensors (PIR, ultrasonic, temperature, etc.)
"""

import asyncio
import json
import logging
import os
import sys
import time
from typing import Dict, Any, Optional

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from base_hardware_service import BaseHardwareService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SensorWebSocketService(BaseHardwareService):
    """WebSocket service for sensor monitoring"""
    
    def __init__(self, port: int = 8773, host: str = "0.0.0.0"):
        super().__init__("sensor_service", "sensor", port, host)
        self.sensor_configs = {}  # Store sensor configurations
        self.active_sensors = {}  # Track active sensor monitoring
        self.sensor_readings = {}  # Store latest sensor readings
        self.monitoring_tasks = {}  # Background monitoring tasks
        
    async def initialize_hardware(self) -> bool:
        """Initialize sensor hardware"""
        try:
            logger.info("📡 Initializing sensor hardware...")
            
            # Test if we can import sensor control functionality
            try:
                # Test basic GPIO availability for sensors
                result = await self.run_sensor_command("test", "gpio", "24", "pir")
                if result.get("status") == "success" or "test" in result.get("message", "").lower():
                    logger.info("✅ Sensor hardware initialized successfully")
                    return True
                else:
                    logger.warning("⚠️ Sensor hardware test returned unexpected result, but continuing...")
                    return True
            except Exception as e:
                logger.warning(f"⚠️ Sensor hardware test failed: {e}, but continuing in simulation mode")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize sensor hardware: {e}")
            return False
            
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "sensor_read":
                return await self.handle_sensor_read(data)
            elif message_type == "sensor_monitor_start":
                return await self.handle_sensor_monitor_start(data)
            elif message_type == "sensor_monitor_stop":
                return await self.handle_sensor_monitor_stop(data)
            elif message_type == "sensor_status":
                return await self.handle_sensor_status(data)
            elif message_type == "configure_sensor":
                return await self.handle_configure_sensor(data)
            elif message_type == "get_sensor_configs":
                return await self.handle_get_sensor_configs(data)
            elif message_type == "get_sensor_readings":
                return await self.handle_get_sensor_readings(data)
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
            
    async def handle_sensor_read(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle single sensor reading request"""
        try:
            sensor_id = data.get("sensor_id", "unknown_sensor")
            pin = data.get("pin")
            sensor_type = data.get("sensor_type", "digital")
            
            if pin is None:
                return {
                    "type": "sensor_read_response",
                    "status": "error",
                    "message": "Pin is required"
                }
                
            logger.info(f"📡 Reading sensor: {sensor_id} (pin {pin}, type {sensor_type})")
            
            # Execute sensor read command
            result = await self.run_sensor_command("read", sensor_type, str(pin), "single")
            
            # Store reading
            self.sensor_readings[sensor_id] = {
                "value": result.get("value", 0),
                "timestamp": time.time(),
                "pin": pin,
                "sensor_type": sensor_type
            }
            
            return {
                "type": "sensor_read_response",
                "status": result.get("status", "success"),
                "sensor_id": sensor_id,
                "value": result.get("value", 0),
                "timestamp": time.time(),
                "message": result.get("message", f"Sensor {sensor_id} read successfully")
            }
            
        except Exception as e:
            logger.error(f"Error reading sensor: {e}")
            return {
                "type": "sensor_read_response",
                "status": "error",
                "message": f"Sensor read failed: {str(e)}"
            }
            
    async def handle_sensor_monitor_start(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle sensor monitoring start request"""
        try:
            sensor_id = data.get("sensor_id", "unknown_sensor")
            pin = data.get("pin")
            sensor_type = data.get("sensor_type", "digital")
            interval = data.get("interval", 1.0)  # seconds
            
            if pin is None:
                return {
                    "type": "sensor_monitor_response",
                    "status": "error",
                    "message": "Pin is required"
                }
                
            # Stop existing monitoring if any
            if sensor_id in self.monitoring_tasks:
                await self.handle_sensor_monitor_stop({"sensor_id": sensor_id})
                
            logger.info(f"📡 Starting monitoring for sensor: {sensor_id} (interval: {interval}s)")
            
            # Start monitoring task
            task = asyncio.create_task(
                self.monitor_sensor(sensor_id, pin, sensor_type, interval)
            )
            self.monitoring_tasks[sensor_id] = task
            
            self.active_sensors[sensor_id] = {
                "pin": pin,
                "sensor_type": sensor_type,
                "interval": interval,
                "start_time": time.time()
            }
            
            return {
                "type": "sensor_monitor_response",
                "status": "success",
                "sensor_id": sensor_id,
                "message": f"Monitoring started for sensor {sensor_id}"
            }
            
        except Exception as e:
            logger.error(f"Error starting sensor monitoring: {e}")
            return {
                "type": "sensor_monitor_response",
                "status": "error",
                "message": f"Failed to start monitoring: {str(e)}"
            }
            
    async def handle_sensor_monitor_stop(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle sensor monitoring stop request"""
        try:
            sensor_id = data.get("sensor_id", "unknown_sensor")
            
            logger.info(f"🛑 Stopping monitoring for sensor: {sensor_id}")
            
            # Stop monitoring task
            if sensor_id in self.monitoring_tasks:
                task = self.monitoring_tasks[sensor_id]
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                del self.monitoring_tasks[sensor_id]
            
            # Remove from active sensors
            if sensor_id in self.active_sensors:
                del self.active_sensors[sensor_id]
            
            return {
                "type": "sensor_monitor_response",
                "status": "success",
                "sensor_id": sensor_id,
                "message": f"Monitoring stopped for sensor {sensor_id}"
            }
            
        except Exception as e:
            logger.error(f"Error stopping sensor monitoring: {e}")
            return {
                "type": "sensor_monitor_response",
                "status": "error",
                "message": f"Failed to stop monitoring: {str(e)}"
            }
            
    async def monitor_sensor(self, sensor_id: str, pin: int, sensor_type: str, interval: float):
        """Background task to continuously monitor a sensor"""
        try:
            while True:
                try:
                    # Read sensor value
                    result = await self.run_sensor_command("read", sensor_type, str(pin), "continuous")
                    
                    # Store reading
                    reading = {
                        "value": result.get("value", 0),
                        "timestamp": time.time(),
                        "pin": pin,
                        "sensor_type": sensor_type
                    }
                    self.sensor_readings[sensor_id] = reading
                    
                    # Broadcast reading to all connected clients
                    await self.broadcast_message({
                        "type": "sensor_reading",
                        "sensor_id": sensor_id,
                        "value": reading["value"],
                        "timestamp": reading["timestamp"]
                    })
                    
                    await asyncio.sleep(interval)
                    
                except Exception as e:
                    logger.error(f"Error in sensor monitoring loop: {e}")
                    await asyncio.sleep(interval)
                    
        except asyncio.CancelledError:
            logger.info(f"📡 Sensor monitoring cancelled for {sensor_id}")
            raise
            
    async def handle_sensor_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle sensor status request"""
        try:
            return {
                "type": "sensor_status_response",
                "status": "success",
                "active_sensors": list(self.active_sensors.keys()),
                "sensor_count": len(self.active_sensors),
                "latest_readings": self.sensor_readings
            }
            
        except Exception as e:
            logger.error(f"Error getting sensor status: {e}")
            return {
                "type": "sensor_status_response",
                "status": "error",
                "message": f"Failed to get sensor status: {str(e)}"
            }
            
    async def handle_configure_sensor(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle sensor configuration"""
        try:
            sensor_id = data.get("sensor_id", "unknown_sensor")
            config = data.get("config", {})
            
            self.sensor_configs[sensor_id] = config
            
            return {
                "type": "configure_sensor_response",
                "status": "success",
                "message": f"Sensor {sensor_id} configured",
                "sensor_id": sensor_id,
                "config": config
            }
            
        except Exception as e:
            logger.error(f"Error configuring sensor: {e}")
            return {
                "type": "configure_sensor_response",
                "status": "error",
                "message": f"Failed to configure sensor: {str(e)}"
            }
            
    async def handle_get_sensor_configs(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get sensor configurations request"""
        try:
            return {
                "type": "sensor_configs_response",
                "status": "success",
                "configs": self.sensor_configs,
                "active_sensors": list(self.active_sensors.keys())
            }
            
        except Exception as e:
            logger.error(f"Error getting sensor configs: {e}")
            return {
                "type": "sensor_configs_response",
                "status": "error",
                "message": f"Failed to get sensor configs: {str(e)}"
            }
            
    async def handle_get_sensor_readings(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get sensor readings request"""
        try:
            return {
                "type": "sensor_readings_response",
                "status": "success",
                "readings": self.sensor_readings,
                "timestamp": time.time()
            }
            
        except Exception as e:
            logger.error(f"Error getting sensor readings: {e}")
            return {
                "type": "sensor_readings_response",
                "status": "error",
                "message": f"Failed to get sensor readings: {str(e)}"
            }
        
    async def run_sensor_command(self, command: str, sensor_type: str, pin: str, mode: str) -> Dict[str, Any]:
        """Run sensor command using existing sensor scripts"""
        try:
            # For now, simulate sensor readings since we don't have physical sensors
            # In a real implementation, this would call actual sensor scripts
            
            if command == "test":
                return {"status": "success", "message": "Sensor test completed"}
            elif command == "read":
                # Simulate different sensor types
                if sensor_type == "pir":
                    # PIR sensor - motion detection (0 or 1)
                    import random
                    value = random.choice([0, 1])
                elif sensor_type == "ultrasonic":
                    # Ultrasonic sensor - distance in cm
                    import random
                    value = random.randint(5, 200)
                elif sensor_type == "temperature":
                    # Temperature sensor - degrees Celsius
                    import random
                    value = random.randint(18, 35)
                elif sensor_type == "analog":
                    # Generic analog sensor - 0-1023
                    import random
                    value = random.randint(0, 1023)
                else:
                    # Digital sensor - 0 or 1
                    import random
                    value = random.choice([0, 1])
                    
                return {
                    "status": "success",
                    "value": value,
                    "message": f"Sensor reading: {value}"
                }
            else:
                return {"status": "error", "message": f"Unknown command: {command}"}
                
        except Exception as e:
            logger.error(f"Error running sensor command: {e}")
            return {
                "status": "error",
                "message": f"Failed to execute sensor command: {str(e)}"
            }
            
    async def get_capabilities(self) -> Dict[str, Any]:
        """Get sensor service capabilities"""
        return {
            "service_type": "sensor",
            "supported_commands": [
                "sensor_read",
                "sensor_monitor_start",
                "sensor_monitor_stop", 
                "sensor_status",
                "configure_sensor",
                "get_sensor_configs",
                "get_sensor_readings"
            ],
            "supported_sensor_types": ["digital", "analog", "pir", "ultrasonic", "temperature"],
            "monitoring_intervals": [0.1, 0.5, 1.0, 2.0, 5.0],  # seconds
            "max_sensors": 16
        }
        
    async def cleanup(self):
        """Cleanup sensor resources"""
        try:
            # Stop all monitoring tasks
            for sensor_id in list(self.monitoring_tasks.keys()):
                await self.handle_sensor_monitor_stop({"sensor_id": sensor_id})
                
            logger.info("✅ Sensor service cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during sensor cleanup: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Sensor WebSocket Service')
    parser.add_argument('--port', type=int, default=8773, help='WebSocket port')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='WebSocket host')
    
    args = parser.parse_args()
    
    async def main():
        service = SensorWebSocketService(port=args.port, host=args.host)
        await service.start_server()
    
    asyncio.run(main())
