#!/usr/bin/env python3

import cv2
import sys
import json
import argparse
import logging
import subprocess
import time
import numpy as np
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CameraController:
    """Handles camera operations and head tracking control."""
    
    def __init__(self, camera_id: int = 0, width: int = 160, height: int = 120):
        """Initialize camera controller with specified settings.
        
        Args:
            camera_id: Camera device ID (default: 0)
            width: Desired frame width (default: 160)
            height: Desired frame height (default: 120)
        """
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=100,  # Number of frames to build background model
            varThreshold=10  # Threshold for detecting foreground
        )
        self.head_tracking_process = None
        self.last_frame_time = 0
        self.frame_count = 0

    def initialize(self) -> bool:
        """Initialize camera with specified settings.
        
        Returns:
            bool: True if initialization successful, False otherwise
        """
        try:
            # Try different backends in order of preference
            backends = [
                (cv2.CAP_V4L2, "V4L2"),
                (cv2.CAP_V4L, "V4L"),
                (cv2.CAP_GSTREAMER, "GStreamer"),
                (cv2.CAP_ANY, "Default")
            ]

            for backend, name in backends:
                logger.info(f"Trying {name} backend...")
                self.cap = cv2.VideoCapture(self.camera_id + backend)
                
                if self.cap.isOpened():
                    # Configure camera settings
                    self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                    self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                    self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                    self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    self.cap.set(cv2.CAP_PROP_FPS, 30)

                    # Verify settings with multiple attempts
                    for _ in range(3):
                        ret, frame = self.cap.read()
                        if ret and frame is not None:
                            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))
                            
                            logger.info(f"Camera initialized: {actual_width}x{actual_height} @{actual_fps}fps using {name}")
                            
                            # Update internal dimensions to match actual camera output
                            self.width = actual_width
                            self.height = actual_height
                            return True
                        time.sleep(0.1)
                    
                    self.release()
                    
            raise RuntimeError("Failed to initialize camera with any backend")

        except Exception as e:
            logger.error(f"Camera initialization error: {e}")
            self.release()
            return False

    def release(self):
        """Release camera resources."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def capture_frame(self) -> Dict[str, Any]:
        """Capture a single frame and return its properties.
        
        Returns:
            dict: Frame properties including width, height, and fps
        """
        if not self.initialize():
            return {"success": False, "error": "Failed to initialize camera"}

        try:
            # Multiple frame capture attempts
            for _ in range(3):
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    break
                time.sleep(0.1)
            
            if not ret or frame is None:
                return {"success": False, "error": "Failed to capture frame"}

            # Get frame properties
            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))

            # Calculate actual FPS
            current_time = time.time()
            if current_time - self.last_frame_time >= 1:
                measured_fps = self.frame_count
                self.frame_count = 0
                self.last_frame_time = current_time
            self.frame_count += 1

            # Test frame encoding
            ret, _ = cv2.imencode('.jpg', frame)
            if not ret:
                return {"success": False, "error": "Failed to encode frame"}

            return {
                "success": True,
                "width": actual_width,
                "height": actual_height,
                "fps": actual_fps
            }

        except Exception as e:
            logger.error(f"Capture error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            self.release()

    def detect_motion(self) -> Dict[str, Any]:
        """Detect motion in current frame.
        
        Returns:
            dict: Motion detection results including position and area
        """
        if not self.cap or not self.cap.isOpened():
            if not self.initialize():
                return {"success": False, "error": "Failed to initialize camera"}

        try:
            # Multiple frame capture attempts
            for _ in range(3):
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    break
                time.sleep(0.1)
            
            if not ret or frame is None:
                return {"success": False, "error": "Failed to capture frame"}

            # Convert to grayscale for better motion detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            # Apply background subtraction
            mask = self.background_subtractor.apply(gray)
            
            # Clean up the mask
            mask = cv2.erode(mask, None, iterations=2)
            mask = cv2.dilate(mask, None, iterations=2)
            
            # Apply threshold to get binary image
            _, mask = cv2.threshold(mask, 25, 255, cv2.THRESH_BINARY)

            # Find contours
            contours, _ = cv2.findContours(
                mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            # Find largest contour
            largest_contour = None
            largest_area = 0
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 200 and area > largest_area:
                    largest_area = area
                    largest_contour = cnt

            if largest_contour is not None:
                x, y, w, h = cv2.boundingRect(largest_contour)
                center_x = float(x + w/2)
                center_y = float(y + h/2)

                # Calculate normalized position (0-100)
                norm_x = (center_x / frame.shape[1]) * 100
                norm_y = (center_y / frame.shape[0]) * 100

                return {
                    "success": True,
                    "motion_detected": True,
                    "center_x": norm_x,
                    "center_y": norm_y,
                    "width": w,
                    "height": h,
                    "area": largest_area
                }

            return {"success": True, "motion_detected": False}

        except Exception as e:
            logger.error(f"Motion detection error: {e}")
            return {"success": False, "error": str(e)}

    def update_settings(self, width: int, height: int) -> Dict[str, Any]:
        """Update camera resolution settings.
        
        Args:
            width: New frame width
            height: New frame height
            
        Returns:
            dict: Updated settings status
        """
        self.width = width
        self.height = height
        if self.initialize():
            return {
                "success": True,
                "width": self.width,
                "height": self.height
            }
        return {"success": False, "error": "Failed to update camera settings"}

    def start_head_tracking(self, servo_id: int) -> Dict[str, Any]:
        """Start head tracking with specified servo.
        
        Args:
            servo_id: ID of servo to use for tracking
            
        Returns:
            dict: Head tracking start status
        """
        try:
            # Kill any existing head tracking process
            self.stop_head_tracking()

            # Start the head tracking script
            script_path = 'scripts/head_track.py'
            self.head_tracking_process = subprocess.Popen(
                ['python3', script_path, 'start', str(servo_id)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait briefly to check if process started successfully
            time.sleep(2)
            if self.head_tracking_process.poll() is not None:
                # Process has already terminated
                stdout, stderr = self.head_tracking_process.communicate()
                error_msg = stderr.decode() if stderr else stdout.decode() if stdout else "Unknown error"
                return {"success": False, "error": f"Head tracking failed to start: {error_msg}"}
                
            return {"success": True, "message": "Head tracking started"}
        except Exception as e:
            logger.error(f"Head tracking error: {e}")
            return {"success": False, "error": str(e)}

    def stop_head_tracking(self) -> Dict[str, Any]:
        """Stop head tracking.
        
        Returns:
            dict: Head tracking stop status
        """
        try:
            if self.head_tracking_process:
                # Try graceful termination first
                self.head_tracking_process.terminate()
                try:
                    self.head_tracking_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if not terminated
                    logger.warning("Force killing head tracking process")
                    self.head_tracking_process.kill()
                    self.head_tracking_process.wait()
                
                # Check for any error output
                stdout, stderr = self.head_tracking_process.communicate()
                if stderr:
                    logger.warning(f"Head tracking stderr: {stderr.decode()}")
                
                self.head_tracking_process = None
                
            return {"success": True, "message": "Head tracking stopped"}
        except Exception as e:
            logger.error(f"Error stopping head tracking: {e}")
            return {"success": False, "error": str(e)}

def main():
    """Main entry point for camera control script."""
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Camera Control Script')
    parser.add_argument('command', choices=['capture', 'motion', 'settings', 'head_track'],
                       help='Command to execute')
    parser.add_argument('--width', type=int, default=160,
                       help='Frame width (default: 160)')
    parser.add_argument('--height', type=int, default=120,
                       help='Frame height (default: 120)')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    parser.add_argument('--servo-id', type=int,
                       help='Servo ID for head tracking')
    parser.add_argument('--action', choices=['start', 'stop'],
                       help='Action for head tracking')
    
    args = parser.parse_args()
    controller = CameraController(args.camera_id, args.width, args.height)

    try:
        result = None
        if args.command == 'capture':
            result = controller.capture_frame()
        elif args.command == 'motion':
            result = controller.detect_motion()
        elif args.command == 'settings':
            result = controller.update_settings(args.width, args.height)
        elif args.command == 'head_track':
            if args.action == 'start' and args.servo_id is not None:
                result = controller.start_head_tracking(args.servo_id)
            elif args.action == 'stop':
                result = controller.stop_head_tracking()
            else:
                result = {"success": False, "error": "Invalid head tracking parameters"}

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
    finally:
        controller.release()

if __name__ == "__main__":
    main()
