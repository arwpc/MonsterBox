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
    def __init__(self, camera_id: int = 0, width: int = 160, height: int = 120):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=100,
            varThreshold=10
        )
        self.head_tracking_process = None

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        try:
            # Try V4L2 backend first
            self.cap = cv2.VideoCapture(self.camera_id + cv2.CAP_V4L2)
            if not self.cap.isOpened():
                logger.warning("V4L2 failed, trying default backend")
                self.cap = cv2.VideoCapture(self.camera_id)
                if not self.cap.isOpened():
                    raise RuntimeError("Failed to open camera with any backend")

            # Set resolution first
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            
            # Set MJPG format
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            
            # Minimize buffer size
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Verify settings
            ret, frame = self.cap.read()
            if not ret or frame is None:
                raise RuntimeError("Failed to capture test frame")

            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            logger.info(f"Camera initialized: {actual_width}x{actual_height}")
            
            # Update internal dimensions to match actual camera output
            self.width = actual_width
            self.height = actual_height

            return True

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
        """Capture a single frame and return its properties."""
        if not self.initialize():
            return {"success": False, "error": "Failed to initialize camera"}

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                return {"success": False, "error": "Failed to capture frame"}

            # Get frame properties
            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))

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
        """Detect motion in current frame."""
        if not self.cap or not self.cap.isOpened():
            if not self.initialize():
                return {"success": False, "error": "Failed to initialize camera"}

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None:
                return {"success": False, "error": "Failed to capture frame"}

            # Apply background subtraction
            mask = self.background_subtractor.apply(frame)
            mask = cv2.erode(mask, None, iterations=2)
            mask = cv2.dilate(mask, None, iterations=2)

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
        """Update camera settings."""
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
        """Start head tracking with the specified servo."""
        try:
            # Kill any existing head tracking process
            if self.head_tracking_process:
                self.head_tracking_process.terminate()
                self.head_tracking_process = None

            # Start the head tracking script
            script_path = 'scripts/hd3.py'
            self.head_tracking_process = subprocess.Popen(
                ['python3', script_path, 'start', str(servo_id)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            return {"success": True, "message": "Head tracking started"}
        except Exception as e:
            logger.error(f"Head tracking error: {e}")
            return {"success": False, "error": str(e)}

    def stop_head_tracking(self) -> Dict[str, Any]:
        """Stop head tracking."""
        try:
            if self.head_tracking_process:
                self.head_tracking_process.terminate()
                self.head_tracking_process = None
            return {"success": True, "message": "Head tracking stopped"}
        except Exception as e:
            logger.error(f"Error stopping head tracking: {e}")
            return {"success": False, "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description='Camera Control Script')
    parser.add_argument('command', choices=['capture', 'motion', 'settings', 'head_track'])
    parser.add_argument('--width', type=int, default=160)
    parser.add_argument('--height', type=int, default=120)
    parser.add_argument('--camera-id', type=int, default=0)
    parser.add_argument('--servo-id', type=int)
    parser.add_argument('--action', choices=['start', 'stop'])
    
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
