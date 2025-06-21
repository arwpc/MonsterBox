#!/usr/bin/env python3
"""
Head Tracking WebSocket Service
Part of MonsterBox Hardware Integration Layer

This service provides real-time head tracking capabilities using OpenCV computer vision
to detect and track the largest moving object in the webcam feed, controlling assigned
servo motors to follow tracked targets.

Features:
- OpenCV-based motion detection and tracking
- WebSocket communication on port 8776
- Character-specific webcam and servo assignments
- Configurable tracking parameters and servo limits
- Integration with existing MonsterBox servo control system
- Real-time status updates and error handling
"""

import asyncio
import websockets
import json
import logging
import time
import threading
import cv2
import numpy as np
import os
import sys
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from base_hardware_service import BaseHardwareService

# MCP Log Collection Integration
try:
    from mcp_logger import MCPLogger
    mcp_logger = MCPLogger("head_tracking_service")
except ImportError:
    mcp_logger = None
    logging.warning("MCP Logger not available, using standard logging")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class TrackingConfig:
    """Configuration for head tracking parameters"""
    enabled: bool = False
    webcam_device: str = "/dev/video0"
    webcam_width: int = 640
    webcam_height: int = 480
    webcam_fps: int = 15
    
    # Motion detection parameters
    motion_threshold: int = 25
    min_contour_area: int = 500
    max_contour_area: int = 50000
    background_learning_rate: float = 0.01
    noise_reduction_kernel_size: int = 3
    
    # Tracking parameters
    tracking_smoothing: float = 0.3
    tracking_deadzone: float = 5.0  # Percentage of frame width
    tracking_sensitivity: float = 1.0
    
    # Servo control parameters
    servo_id: str = ""
    servo_min_angle: float = 0.0
    servo_max_angle: float = 180.0
    servo_center_angle: float = 90.0
    servo_speed: float = 0.5
    servo_reverse: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TrackingConfig':
        return cls(**data)

@dataclass
class TrackingStatus:
    """Current tracking status and data"""
    active: bool = False
    target_detected: bool = False
    target_position: Tuple[float, float] = (0.0, 0.0)  # Normalized (0-100, 0-100)
    target_size: float = 0.0  # Percentage of frame
    servo_angle: float = 90.0
    frame_count: int = 0
    fps: float = 0.0
    last_detection_time: float = 0.0
    error_message: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class HeadTracker:
    """Core head tracking implementation using OpenCV"""
    
    def __init__(self, config: TrackingConfig):
        self.config = config
        self.status = TrackingStatus()
        self.cap = None
        self.bg_subtractor = None
        self.running = False
        self.thread = None
        self.last_servo_angle = config.servo_center_angle
        self.frame_times = []
        
    def initialize(self) -> bool:
        """Initialize camera and background subtractor"""
        try:
            # Initialize camera
            device_id = int(self.config.webcam_device.replace('/dev/video', ''))
            self.cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)

            if not self.cap.isOpened():
                logger.error(f"Failed to open camera {self.config.webcam_device}")
                if mcp_logger:
                    mcp_logger.log_error("camera_init_failed", {
                        "webcam_device": self.config.webcam_device,
                        "device_id": device_id,
                        "error": "Camera failed to open"
                    })
                return False

            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.webcam_width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.webcam_height)
            self.cap.set(cv2.CAP_PROP_FPS, self.config.webcam_fps)

            # Initialize background subtractor
            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                detectShadows=True,
                varThreshold=self.config.motion_threshold
            )

            logger.info(f"✅ Head tracker initialized for {self.config.webcam_device}")
            if mcp_logger:
                mcp_logger.log_info("head_tracker_initialized", {
                    "webcam_device": self.config.webcam_device,
                    "device_id": device_id,
                    "width": self.config.webcam_width,
                    "height": self.config.webcam_height,
                    "fps": self.config.webcam_fps,
                    "motion_threshold": self.config.motion_threshold
                })
            return True

        except Exception as e:
            logger.error(f"❌ Failed to initialize head tracker: {e}")
            if mcp_logger:
                mcp_logger.log_error("head_tracker_init_failed", {
                    "webcam_device": self.config.webcam_device,
                    "error": str(e),
                    "error_type": type(e).__name__
                })
            return False
    
    def start(self):
        """Start tracking in background thread"""
        if self.running:
            return
        
        if not self.initialize():
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._tracking_loop, daemon=True)
        self.thread.start()
        logger.info("🎯 Head tracking started")
    
    def stop(self):
        """Stop tracking"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)
        
        if self.cap:
            self.cap.release()
            self.cap = None
        
        self.status.active = False
        logger.info("⏹️ Head tracking stopped")
    
    def _tracking_loop(self):
        """Main tracking loop"""
        self.status.active = True
        frame_count = 0
        
        while self.running:
            try:
                ret, frame = self.cap.read()
                if not ret:
                    continue
                
                frame_start = time.time()
                
                # Apply background subtraction
                fg_mask = self.bg_subtractor.apply(frame, learningRate=self.config.background_learning_rate)
                
                # Noise reduction
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, 
                    (self.config.noise_reduction_kernel_size, self.config.noise_reduction_kernel_size))
                fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
                
                # Find contours
                contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                # Filter contours by area
                valid_contours = [c for c in contours 
                    if self.config.min_contour_area <= cv2.contourArea(c) <= self.config.max_contour_area]
                
                if valid_contours:
                    # Find largest contour
                    largest_contour = max(valid_contours, key=cv2.contourArea)
                    
                    # Get bounding box
                    x, y, w, h = cv2.boundingRect(largest_contour)
                    
                    # Calculate center and normalized position
                    center_x = x + w // 2
                    center_y = y + h // 2
                    
                    norm_x = (center_x / frame.shape[1]) * 100
                    norm_y = (center_y / frame.shape[0]) * 100
                    
                    # Update status
                    self.status.target_detected = True
                    self.status.target_position = (norm_x, norm_y)
                    self.status.target_size = (cv2.contourArea(largest_contour) / (frame.shape[0] * frame.shape[1])) * 100
                    self.status.last_detection_time = time.time()
                    
                    # Calculate servo angle
                    self._update_servo_angle(norm_x)
                    
                else:
                    self.status.target_detected = False
                
                # Update frame statistics
                frame_count += 1
                self.status.frame_count = frame_count
                
                # Calculate FPS
                frame_time = time.time() - frame_start
                self.frame_times.append(frame_time)
                if len(self.frame_times) > 30:
                    self.frame_times.pop(0)
                
                if self.frame_times:
                    avg_frame_time = sum(self.frame_times) / len(self.frame_times)
                    self.status.fps = 1.0 / avg_frame_time if avg_frame_time > 0 else 0
                
                # Frame rate control
                target_frame_time = 1.0 / self.config.webcam_fps
                if frame_time < target_frame_time:
                    time.sleep(target_frame_time - frame_time)
                
            except Exception as e:
                logger.error(f"Error in tracking loop: {e}")
                self.status.error_message = str(e)
                time.sleep(0.1)
        
        self.status.active = False
    
    def _update_servo_angle(self, norm_x: float):
        """Update servo angle based on target position"""
        # Check if movement is outside deadzone
        center_x = 50.0  # Center of frame
        deadzone = self.config.tracking_deadzone
        
        if abs(norm_x - center_x) < deadzone:
            return  # No movement needed
        
        # Calculate angle adjustment
        angle_range = self.config.servo_max_angle - self.config.servo_min_angle
        adjustment = ((norm_x - center_x) / 50.0) * (angle_range / 2) * self.config.tracking_sensitivity
        
        if self.config.servo_reverse:
            adjustment = -adjustment
        
        # Apply smoothing
        target_angle = self.config.servo_center_angle + adjustment
        smoothed_angle = (self.last_servo_angle * (1 - self.config.tracking_smoothing) + 
                         target_angle * self.config.tracking_smoothing)
        
        # Clamp to limits
        smoothed_angle = max(self.config.servo_min_angle, 
                           min(self.config.servo_max_angle, smoothed_angle))
        
        self.last_servo_angle = smoothed_angle
        self.status.servo_angle = smoothed_angle

class HeadTrackingWebSocketService(BaseHardwareService):
    """WebSocket service for head tracking with OpenCV integration"""

    def __init__(self, port: int = 8776, host: str = "0.0.0.0"):
        super().__init__("head_tracking_service", "head_tracking", port, host)
        
        # Tracking configurations per character
        self.tracking_configs: Dict[str, TrackingConfig] = {}
        self.tracking_status: Dict[str, TrackingStatus] = {}
        self.active_trackers: Dict[str, HeadTracker] = {}
        
        # Hardware integration
        self.hardware_system = None
        
        # Service capabilities
        self.capabilities = {
            "motion_detection": True,
            "servo_control": True,
            "real_time_tracking": True,
            "configurable_parameters": True,
            "multiple_characters": True
        }

    async def initialize_hardware(self) -> bool:
        """Initialize head tracking hardware"""
        try:
            logger.info("🎯 Initializing head tracking hardware...")
            
            # Test OpenCV availability
            if not self._test_opencv():
                logger.error("OpenCV not available or not properly configured")
                return False
            
            # Initialize hardware integration if available
            try:
                from integrated_hardware_system import IntegratedHardwareSystem
                self.hardware_system = IntegratedHardwareSystem()
                await self.hardware_system.initialize()
                logger.info("✅ Hardware integration layer connected")
            except ImportError:
                logger.warning("⚠️ Hardware integration layer not available, using direct servo control")
            except Exception as e:
                logger.warning(f"⚠️ Hardware integration failed: {e}, using direct servo control")
            
            logger.info("✅ Head tracking hardware initialized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize head tracking hardware: {e}")
            return False

    def _test_opencv(self) -> bool:
        """Test OpenCV installation and basic functionality"""
        try:
            # Test basic OpenCV functionality
            test_image = np.zeros((100, 100, 3), dtype=np.uint8)
            _ = cv2.cvtColor(test_image, cv2.COLOR_BGR2GRAY)  # Test color conversion

            # Test background subtractor
            bg_subtractor = cv2.createBackgroundSubtractorMOG2()
            _ = bg_subtractor.apply(test_image)  # Test background subtraction

            logger.info(f"✅ OpenCV {cv2.__version__} is working correctly")
            if mcp_logger:
                mcp_logger.log_info("opencv_test_success", {
                    "opencv_version": cv2.__version__,
                    "test_image_shape": test_image.shape,
                    "gray_conversion": "success",
                    "background_subtractor": "success"
                })
            return True

        except Exception as e:
            logger.error(f"❌ OpenCV test failed: {e}")
            if mcp_logger:
                mcp_logger.log_error("opencv_test_failed", {
                    "error": str(e),
                    "error_type": type(e).__name__
                })
            return False

    async def handle_message(self, websocket, message_data: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        try:
            message_type = message_data.get("type")

            if message_type == "start_tracking":
                await self.handle_start_tracking(websocket, message_data)
            elif message_type == "stop_tracking":
                await self.handle_stop_tracking(websocket, message_data)
            elif message_type == "configure_tracking":
                await self.handle_configure_tracking(websocket, message_data)
            elif message_type == "get_tracking_status":
                await self.handle_get_tracking_status(websocket, message_data)
            elif message_type == "get_tracking_config":
                await self.handle_get_tracking_config(websocket, message_data)
            elif message_type == "test_servo":
                await self.handle_test_servo(websocket, message_data)
            elif message_type == "calibrate_tracking":
                await self.handle_calibrate_tracking(websocket, message_data)
            else:
                await self.send_error(websocket, f"Unknown message type: {message_type}")

        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self.send_error(websocket, f"Message handling error: {str(e)}")

    async def handle_start_tracking(self, websocket, data: Dict[str, Any]):
        """Start head tracking for a character"""
        try:
            character_id = data.get("character_id")
            if not character_id:
                await self.send_error(websocket, "character_id is required")
                return

            # Get or create tracking configuration
            if character_id not in self.tracking_configs:
                self.tracking_configs[character_id] = TrackingConfig()

            config = self.tracking_configs[character_id]

            # Stop existing tracker if running
            if character_id in self.active_trackers:
                self.active_trackers[character_id].stop()
                del self.active_trackers[character_id]

            # Create and start new tracker
            tracker = HeadTracker(config)
            tracker.start()

            if tracker.status.active:
                self.active_trackers[character_id] = tracker
                self.tracking_status[character_id] = tracker.status

                await websocket.send(json.dumps({
                    "type": "tracking_started",
                    "character_id": character_id,
                    "status": "success",
                    "config": config.to_dict()
                }))

                # Start status broadcast task
                asyncio.create_task(self._broadcast_tracking_status(character_id))

            else:
                await self.send_error(websocket, f"Failed to start tracking for character {character_id}")

        except Exception as e:
            logger.error(f"Error starting tracking: {e}")
            await self.send_error(websocket, f"Failed to start tracking: {str(e)}")

    async def handle_stop_tracking(self, websocket, data: Dict[str, Any]):
        """Stop head tracking for a character"""
        try:
            character_id = data.get("character_id")
            if not character_id:
                await self.send_error(websocket, "character_id is required")
                return

            if character_id in self.active_trackers:
                self.active_trackers[character_id].stop()
                del self.active_trackers[character_id]

                if character_id in self.tracking_status:
                    del self.tracking_status[character_id]

                await websocket.send(json.dumps({
                    "type": "tracking_stopped",
                    "character_id": character_id,
                    "status": "success"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "tracking_stopped",
                    "character_id": character_id,
                    "status": "success",
                    "message": "Tracking was not active"
                }))

        except Exception as e:
            logger.error(f"Error stopping tracking: {e}")
            await self.send_error(websocket, f"Failed to stop tracking: {str(e)}")

    async def handle_configure_tracking(self, websocket, data: Dict[str, Any]):
        """Configure head tracking parameters"""
        try:
            character_id = data.get("character_id")
            config_data = data.get("config", {})

            if not character_id:
                await self.send_error(websocket, "character_id is required")
                return

            # Update configuration
            if character_id not in self.tracking_configs:
                self.tracking_configs[character_id] = TrackingConfig()

            config = self.tracking_configs[character_id]

            # Update configuration fields
            for key, value in config_data.items():
                if hasattr(config, key):
                    setattr(config, key, value)

            # If tracking is active, restart with new config
            if character_id in self.active_trackers:
                self.active_trackers[character_id].stop()
                del self.active_trackers[character_id]

                tracker = HeadTracker(config)
                tracker.start()

                if tracker.status.active:
                    self.active_trackers[character_id] = tracker
                    self.tracking_status[character_id] = tracker.status

            await websocket.send(json.dumps({
                "type": "tracking_configured",
                "character_id": character_id,
                "status": "success",
                "config": config.to_dict()
            }))

        except Exception as e:
            logger.error(f"Error configuring tracking: {e}")
            await self.send_error(websocket, f"Failed to configure tracking: {str(e)}")

    async def handle_get_tracking_status(self, websocket, data: Dict[str, Any]):
        """Get current tracking status"""
        try:
            character_id = data.get("character_id")

            if character_id:
                # Get status for specific character
                if character_id in self.active_trackers:
                    status = self.active_trackers[character_id].status.to_dict()
                else:
                    status = TrackingStatus().to_dict()

                await websocket.send(json.dumps({
                    "type": "tracking_status",
                    "character_id": character_id,
                    "status": status
                }))
            else:
                # Get status for all characters
                all_status = {}
                for char_id, tracker in self.active_trackers.items():
                    all_status[char_id] = tracker.status.to_dict()

                await websocket.send(json.dumps({
                    "type": "tracking_status_all",
                    "status": all_status
                }))

        except Exception as e:
            logger.error(f"Error getting tracking status: {e}")
            await self.send_error(websocket, f"Failed to get tracking status: {str(e)}")

    async def handle_get_tracking_config(self, websocket, data: Dict[str, Any]):
        """Get tracking configuration"""
        try:
            character_id = data.get("character_id")

            if character_id:
                # Get config for specific character
                if character_id in self.tracking_configs:
                    config = self.tracking_configs[character_id].to_dict()
                else:
                    config = TrackingConfig().to_dict()

                await websocket.send(json.dumps({
                    "type": "tracking_config",
                    "character_id": character_id,
                    "config": config
                }))
            else:
                # Get config for all characters
                all_configs = {}
                for char_id, config in self.tracking_configs.items():
                    all_configs[char_id] = config.to_dict()

                await websocket.send(json.dumps({
                    "type": "tracking_config_all",
                    "configs": all_configs
                }))

        except Exception as e:
            logger.error(f"Error getting tracking config: {e}")
            await self.send_error(websocket, f"Failed to get tracking config: {str(e)}")

    async def handle_test_servo(self, websocket, data: Dict[str, Any]):
        """Test servo movement"""
        try:
            character_id = data.get("character_id")
            servo_id = data.get("servo_id")
            angle = data.get("angle", 90.0)

            if not character_id or not servo_id:
                await self.send_error(websocket, "character_id and servo_id are required")
                return

            # Execute servo command
            success = await self._control_servo(servo_id, angle)

            await websocket.send(json.dumps({
                "type": "servo_test_result",
                "character_id": character_id,
                "servo_id": servo_id,
                "angle": angle,
                "success": success
            }))

        except Exception as e:
            logger.error(f"Error testing servo: {e}")
            await self.send_error(websocket, f"Failed to test servo: {str(e)}")

    async def handle_calibrate_tracking(self, websocket, data: Dict[str, Any]):
        """Calibrate tracking system"""
        try:
            character_id = data.get("character_id")
            if not character_id:
                await self.send_error(websocket, "character_id is required")
                return

            # Get current config
            if character_id not in self.tracking_configs:
                self.tracking_configs[character_id] = TrackingConfig()

            config = self.tracking_configs[character_id]

            # Reset servo to center position
            if config.servo_id:
                await self._control_servo(config.servo_id, config.servo_center_angle)

            await websocket.send(json.dumps({
                "type": "calibration_complete",
                "character_id": character_id,
                "status": "success",
                "center_angle": config.servo_center_angle
            }))

        except Exception as e:
            logger.error(f"Error calibrating tracking: {e}")
            await self.send_error(websocket, f"Failed to calibrate tracking: {str(e)}")

    async def _control_servo(self, servo_id: str, angle: float) -> bool:
        """Control servo through hardware integration layer"""
        try:
            if self.hardware_system:
                # Use hardware integration layer
                command_params = {
                    "angle": angle,
                    "duration": 1000  # 1 second movement
                }
                response = await self.hardware_system.execute_hardware_command(
                    "move", servo_id, command_params
                )
                return response.get("success", False)
            else:
                # Direct servo control fallback
                return await self._direct_servo_control(servo_id, angle)

        except Exception as e:
            logger.error(f"Error controlling servo {servo_id}: {e}")
            return False

    async def _direct_servo_control(self, servo_id: str, angle: float) -> bool:
        """Direct servo control using existing servo scripts"""
        try:
            import subprocess

            script_path = os.path.join(os.path.dirname(__file__), '..', 'servo_control.py')

            # Execute servo control command
            result = subprocess.run([
                'python3', script_path,
                'test', 'gpio', '18', str(angle), '1000', 'Standard', servo_id
            ], capture_output=True, text=True, timeout=5)

            return result.returncode == 0

        except Exception as e:
            logger.error(f"Direct servo control failed: {e}")
            return False

    async def _broadcast_tracking_status(self, character_id: str):
        """Broadcast tracking status updates"""
        try:
            while character_id in self.active_trackers:
                tracker = self.active_trackers[character_id]
                if not tracker.status.active:
                    break

                # Send servo commands if target detected and angle changed significantly
                if (tracker.status.target_detected and
                    abs(tracker.status.servo_angle - tracker.last_servo_angle) > 1.0):

                    config = self.tracking_configs[character_id]
                    if config.servo_id:
                        await self._control_servo(config.servo_id, tracker.status.servo_angle)
                        tracker.last_servo_angle = tracker.status.servo_angle

                # Broadcast status to all connected clients
                status_message = {
                    "type": "tracking_status_update",
                    "character_id": character_id,
                    "status": tracker.status.to_dict()
                }

                await self.broadcast_message(status_message)

                # Wait before next update
                await asyncio.sleep(0.1)  # 10 FPS status updates

        except Exception as e:
            logger.error(f"Error in status broadcast: {e}")

    async def cleanup(self):
        """Cleanup head tracking resources"""
        try:
            logger.info("🧹 Cleaning up head tracking resources...")

            # Stop all active trackers
            for character_id, tracker in list(self.active_trackers.items()):
                try:
                    tracker.stop()
                    logger.info(f"✅ Stopped tracker for character {character_id}")
                except Exception as e:
                    logger.error(f"❌ Error stopping tracker for character {character_id}: {e}")

            self.active_trackers.clear()
            self.tracking_status.clear()

            logger.info("✅ Head tracking cleanup complete")

        except Exception as e:
            logger.error(f"❌ Error during head tracking cleanup: {e}")

    async def get_capabilities(self) -> Dict[str, Any]:
        """Get head tracking service capabilities"""
        return {
            "service_type": "head_tracking",
            "features": {
                "motion_detection": True,
                "servo_control": True,
                "real_time_tracking": True,
                "configurable_parameters": True,
                "multiple_characters": True,
                "opencv_integration": True
            },
            "supported_commands": [
                "start_tracking",
                "stop_tracking",
                "configure_tracking",
                "get_tracking_status",
                "get_tracking_config"
            ],
            "configuration_options": {
                "webcam_device": "string",
                "webcam_resolution": "tuple",
                "motion_threshold": "integer",
                "tracking_sensitivity": "float",
                "servo_configuration": "object"
            }
        }

# Main execution
if __name__ == "__main__":
    async def main():
        service = HeadTrackingWebSocketService()
        await service.start_server()

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Head tracking service stopped by user")
