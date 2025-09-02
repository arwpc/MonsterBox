#!/usr/bin/env python3

"""
Webcam WebSocket Service
Provides WebSocket interface for controlling webcams and cameras
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

class WebcamWebSocketService(BaseHardwareService):
    """WebSocket service for webcam control"""
    
    def __init__(self, port: int = 8774, host: str = "0.0.0.0"):
        super().__init__("webcam_service", "webcam", port, host)
        self.webcam_configs = {}  # Store webcam configurations
        self.active_webcams = {}  # Track active webcam streams
        self.streaming_tasks = {}  # Background streaming tasks
        
    async def initialize_hardware(self) -> bool:
        """Initialize webcam hardware"""
        try:
            logger.info("📹 Initializing webcam hardware...")
            
            # Test if we can access webcam devices
            try:
                # Check for available video devices
                result = await self.run_webcam_command("list", "devices", "", "")
                if result.get("status") == "success":
                    logger.info("✅ Webcam hardware initialized successfully")
                    return True
                else:
                    logger.warning("⚠️ Webcam hardware test returned unexpected result, but continuing...")
                    return True
            except Exception as e:
                logger.warning(f"⚠️ Webcam hardware test failed: {e}, but continuing in simulation mode")
                return True
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize webcam hardware: {e}")
            return False
            
    async def handle_message(self, websocket, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming WebSocket messages"""
        message_type = data.get("type")
        
        try:
            if message_type == "webcam_start":
                return await self.handle_webcam_start(data)
            elif message_type == "webcam_stop":
                return await self.handle_webcam_stop(data)
            elif message_type == "webcam_capture":
                return await self.handle_webcam_capture(data)
            elif message_type == "webcam_settings":
                return await self.handle_webcam_settings(data)
            elif message_type == "webcam_status":
                return await self.handle_webcam_status(data)
            elif message_type == "configure_webcam":
                return await self.handle_configure_webcam(data)
            elif message_type == "get_webcam_configs":
                return await self.handle_get_webcam_configs(data)
            elif message_type == "list_webcams":
                return await self.handle_list_webcams(data)
            elif message_type == "reload_configurations":
                return await self.handle_reload_configurations(data)
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
            
    async def handle_webcam_start(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle webcam start request"""
        try:
            webcam_id = data.get("webcam_id", "webcam_0")
            device = data.get("device", "/dev/video0")
            resolution = data.get("resolution", "640x480")
            fps = data.get("fps", 30)
            
            logger.info(f"📹 Starting webcam: {webcam_id} (device: {device})")
            
            # Stop existing webcam if running
            if webcam_id in self.streaming_tasks:
                await self.handle_webcam_stop({"webcam_id": webcam_id})
            
            # Execute webcam start command
            result = await self.run_webcam_command("start", device, resolution, str(fps))
            
            if result.get("status") == "success":
                # Start streaming task
                task = asyncio.create_task(
                    self.stream_webcam(webcam_id, device, resolution, fps)
                )
                self.streaming_tasks[webcam_id] = task
                
                self.active_webcams[webcam_id] = {
                    "device": device,
                    "resolution": resolution,
                    "fps": fps,
                    "start_time": time.time(),
                    "status": "streaming"
                }
                
                # Broadcast status update
                await self.broadcast_message({
                    "type": "webcam_status_update",
                    "webcam_id": webcam_id,
                    "status": "streaming",
                    "device": device,
                    "resolution": resolution,
                    "fps": fps
                })
            
            return {
                "type": "webcam_start_response",
                "status": result.get("status", "success"),
                "message": result.get("message", f"Webcam {webcam_id} started"),
                "webcam_id": webcam_id,
                "device": device,
                "resolution": resolution,
                "fps": fps
            }
            
        except Exception as e:
            logger.error(f"Error starting webcam: {e}")
            return {
                "type": "webcam_start_response",
                "status": "error",
                "message": f"Webcam start failed: {str(e)}"
            }
            
    async def handle_webcam_stop(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle webcam stop request"""
        try:
            webcam_id = data.get("webcam_id", "webcam_0")
            
            logger.info(f"🛑 Stopping webcam: {webcam_id}")
            
            # Stop streaming task
            if webcam_id in self.streaming_tasks:
                task = self.streaming_tasks[webcam_id]
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                del self.streaming_tasks[webcam_id]
            
            # Execute webcam stop command
            device = self.active_webcams.get(webcam_id, {}).get("device", "/dev/video0")
            result = await self.run_webcam_command("stop", device, "", "")
            
            # Remove from active webcams
            if webcam_id in self.active_webcams:
                del self.active_webcams[webcam_id]
            
            # Broadcast status update
            await self.broadcast_message({
                "type": "webcam_status_update",
                "webcam_id": webcam_id,
                "status": "stopped"
            })
            
            return {
                "type": "webcam_stop_response",
                "status": result.get("status", "success"),
                "message": result.get("message", f"Webcam {webcam_id} stopped"),
                "webcam_id": webcam_id
            }
            
        except Exception as e:
            logger.error(f"Error stopping webcam: {e}")
            return {
                "type": "webcam_stop_response",
                "status": "error",
                "message": f"Failed to stop webcam: {str(e)}"
            }
            
    async def handle_webcam_capture(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle webcam capture request"""
        try:
            webcam_id = data.get("webcam_id", "webcam_0")
            filename = data.get("filename", f"capture_{int(time.time())}.jpg")
            
            logger.info(f"📸 Capturing image from webcam: {webcam_id}")
            
            device = self.active_webcams.get(webcam_id, {}).get("device", "/dev/video0")
            result = await self.run_webcam_command("capture", device, filename, "")
            
            return {
                "type": "webcam_capture_response",
                "status": result.get("status", "success"),
                "message": result.get("message", f"Image captured from {webcam_id}"),
                "webcam_id": webcam_id,
                "filename": filename,
                "filepath": result.get("filepath", "")
            }
            
        except Exception as e:
            logger.error(f"Error capturing from webcam: {e}")
            return {
                "type": "webcam_capture_response",
                "status": "error",
                "message": f"Webcam capture failed: {str(e)}"
            }
            
    async def handle_webcam_settings(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle webcam settings update"""
        try:
            webcam_id = data.get("webcam_id", "webcam_0")
            settings = data.get("settings", {})
            
            logger.info(f"⚙️ Updating webcam settings: {webcam_id}")
            
            device = self.active_webcams.get(webcam_id, {}).get("device", "/dev/video0")
            
            # Apply settings
            for setting, value in settings.items():
                result = await self.run_webcam_command("setting", device, setting, str(value))
                if result.get("status") != "success":
                    logger.warning(f"Failed to set {setting} to {value}")
            
            return {
                "type": "webcam_settings_response",
                "status": "success",
                "message": f"Settings updated for webcam {webcam_id}",
                "webcam_id": webcam_id,
                "settings": settings
            }
            
        except Exception as e:
            logger.error(f"Error updating webcam settings: {e}")
            return {
                "type": "webcam_settings_response",
                "status": "error",
                "message": f"Failed to update settings: {str(e)}"
            }
            
    async def stream_webcam(self, webcam_id: str, device: str, resolution: str, fps: int):
        """Background task to handle webcam streaming"""
        try:
            logger.info(f"📹 Starting streaming for webcam {webcam_id}")
            
            while True:
                try:
                    # In a real implementation, this would capture frames and stream them
                    # For now, we'll just send periodic status updates
                    
                    await self.broadcast_message({
                        "type": "webcam_frame",
                        "webcam_id": webcam_id,
                        "timestamp": time.time(),
                        "frame_data": "base64_encoded_frame_data_would_go_here"
                    })
                    
                    # Wait based on FPS
                    await asyncio.sleep(1.0 / fps)
                    
                except Exception as e:
                    logger.error(f"Error in webcam streaming loop: {e}")
                    await asyncio.sleep(1.0)
                    
        except asyncio.CancelledError:
            logger.info(f"📹 Webcam streaming cancelled for {webcam_id}")
            raise
            
    async def handle_webcam_status(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle webcam status request"""
        try:
            return {
                "type": "webcam_status_response",
                "status": "success",
                "active_webcams": list(self.active_webcams.keys()),
                "webcam_count": len(self.active_webcams),
                "webcam_details": self.active_webcams
            }
            
        except Exception as e:
            logger.error(f"Error getting webcam status: {e}")
            return {
                "type": "webcam_status_response",
                "status": "error",
                "message": f"Failed to get webcam status: {str(e)}"
            }
            
    async def handle_configure_webcam(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle webcam configuration"""
        try:
            webcam_id = data.get("webcam_id", "webcam_0")
            config = data.get("config", {})
            
            self.webcam_configs[webcam_id] = config
            
            return {
                "type": "configure_webcam_response",
                "status": "success",
                "message": f"Webcam {webcam_id} configured",
                "webcam_id": webcam_id,
                "config": config
            }
            
        except Exception as e:
            logger.error(f"Error configuring webcam: {e}")
            return {
                "type": "configure_webcam_response",
                "status": "error",
                "message": f"Failed to configure webcam: {str(e)}"
            }
            
    async def handle_get_webcam_configs(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle get webcam configurations request"""
        try:
            return {
                "type": "webcam_configs_response",
                "status": "success",
                "configs": self.webcam_configs,
                "active_webcams": list(self.active_webcams.keys())
            }
            
        except Exception as e:
            logger.error(f"Error getting webcam configs: {e}")
            return {
                "type": "webcam_configs_response",
                "status": "error",
                "message": f"Failed to get webcam configs: {str(e)}"
            }
            
    async def handle_list_webcams(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle list available webcams request"""
        try:
            result = await self.run_webcam_command("list", "devices", "", "")
            
            return {
                "type": "list_webcams_response",
                "status": result.get("status", "success"),
                "devices": result.get("devices", ["/dev/video0"]),
                "message": result.get("message", "Webcam devices listed")
            }
            
        except Exception as e:
            logger.error(f"Error listing webcams: {e}")
            return {
                "type": "list_webcams_response",
                "status": "error",
                "message": f"Failed to list webcams: {str(e)}"
            }
        
    async def run_webcam_command(self, command: str, device: str, param1: str, param2: str) -> Dict[str, Any]:
        """Run webcam command using existing webcam scripts"""
        try:
            # For now, simulate webcam operations since we don't have physical webcams
            # In a real implementation, this would call actual webcam control scripts
            
            if command == "list":
                return {
                    "status": "success",
                    "devices": ["/dev/video0", "/dev/video1"],
                    "message": "Available webcam devices listed"
                }
            elif command == "start":
                return {
                    "status": "success",
                    "message": f"Webcam started on {device} at {param1} resolution, {param2} fps"
                }
            elif command == "stop":
                return {
                    "status": "success",
                    "message": f"Webcam stopped on {device}"
                }
            elif command == "capture":
                return {
                    "status": "success",
                    "message": f"Image captured to {param1}",
                    "filepath": f"/tmp/{param1}"
                }
            elif command == "setting":
                return {
                    "status": "success",
                    "message": f"Setting {param1} set to {param2}"
                }
            else:
                return {"status": "error", "message": f"Unknown command: {command}"}
                
        except Exception as e:
            logger.error(f"Error running webcam command: {e}")
            return {
                "status": "error",
                "message": f"Failed to execute webcam command: {str(e)}"
            }
            
    async def get_capabilities(self) -> Dict[str, Any]:
        """Get webcam service capabilities"""
        return {
            "service_type": "webcam",
            "supported_commands": [
                "webcam_start",
                "webcam_stop",
                "webcam_capture",
                "webcam_settings",
                "webcam_status",
                "configure_webcam",
                "get_webcam_configs",
                "list_webcams",
                "reload_configurations"
            ],
            "supported_resolutions": ["320x240", "640x480", "800x600", "1024x768", "1280x720", "1920x1080"],
            "supported_fps": [15, 24, 30, 60],
            "max_webcams": 4
        }

    async def handle_reload_configurations(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Reload webcam configurations from parts.json"""
        try:
            logger.info("🔄 Reloading webcam configurations...")

            # Clear existing configurations
            old_webcam_count = len(self.webcam_configs)
            self.webcam_configs.clear()
            # Keep active webcams running, but could stop them if needed

            # Reload webcam configurations from parts.json
            # This would typically load from the parts.json file
            # For now, we'll just acknowledge the reload

            new_webcam_count = len(self.webcam_configs)

            logger.info(f"✅ Webcam configurations reloaded: {old_webcam_count} → {new_webcam_count} webcams")

            return {
                "type": "reload_complete",
                "status": "success",
                "message": f"Webcam configurations reloaded successfully ({new_webcam_count} webcams)",
                "webcam_count": new_webcam_count,
                "timestamp": data.get('timestamp')
            }

        except Exception as e:
            logger.error(f"Error reloading webcam configurations: {e}")
            return {
                "type": "error",
                "status": "error",
                "message": f"Failed to reload webcam configurations: {str(e)}"
            }

    async def cleanup(self):
        """Cleanup webcam resources"""
        try:
            # Stop all streaming tasks
            for webcam_id in list(self.streaming_tasks.keys()):
                await self.handle_webcam_stop({"webcam_id": webcam_id})
                
            logger.info("✅ Webcam service cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during webcam cleanup: {e}")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Webcam WebSocket Service')
    parser.add_argument('--port', type=int, default=8774, help='WebSocket port')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='WebSocket host')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.debug else logging.WARNING
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    async def main():
        service = WebcamWebSocketService(port=args.port, host=args.host)
        await service.start_server()

    asyncio.run(main())
