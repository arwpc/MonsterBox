#!/usr/bin/env python3

import sys
import json
import argparse
import logging
import time
import os
import fcntl
import base64
import subprocess
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Force V4L2 backend before importing OpenCV
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_GSTREAMER"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"
os.environ["OPENCV_VIDEOIO_BACKEND"] = "v4l2"

# Import OpenCV after setting backend priorities
try:
    import numpy as np
    import cv2
except ImportError as e:
    logger.error(f"Failed to import required libraries: {e}")
    sys.exit(1)

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_id=0):
        self.device_path = f"/dev/video{device_id}"
        self.lock_path = f"/tmp/camera_{device_id}.lock"
        self.lock_file = None

    def acquire(self) -> bool:
        """Acquire lock on camera device."""
        try:
            # Kill any existing camera processes
            subprocess.run(['pkill', '-f', 'camera_stream.py'], capture_output=True)
            time.sleep(1)  # Wait for processes to die
            
            # First check if the lock file exists and is stale
            if os.path.exists(self.lock_path):
                try:
                    with open(self.lock_path, 'r') as f:
                        pid = int(f.read().strip())
                        # Check if process is still running
                        os.kill(pid, 0)
                except (OSError, ValueError):
                    # Process is not running or invalid PID, remove stale lock
                    try:
                        os.remove(self.lock_path)
                    except OSError:
                        pass

            self.lock_file = open(self.lock_path, 'w')
            fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            # Write current PID to lock file
            self.lock_file.write(str(os.getpid()))
            self.lock_file.flush()
            return True
        except (IOError, OSError):
            if self.lock_file:
                self.lock_file.close()
                self.lock_file = None
            return False

    def release(self):
        """Release lock on camera device."""
        try:
            if self.lock_file:
                fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_UN)
                self.lock_file.close()
                self.lock_file = None
                try:
                    os.remove(self.lock_path)
                except OSError:
                    pass
        except Exception:
            pass

class MotionDetector:
    """Handles motion detection and visualization."""
    
    def __init__(self, camera_id: int = 0, width: int = 640, height: int = 480):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=100,
            varThreshold=10
        )
        self.camera_lock = CameraLock(self.camera_id)

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        if not self.camera_lock.acquire():
            logger.warning("Camera is currently in use by another process")
            return False

        try:
            # Release any existing camera instance
            self.release()
            
            # Try V4L2 backend with specific settings
            self.cap = cv2.VideoCapture(self.camera_id)
            
            if not self.cap.isOpened():
                return False

            # Configure camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Verify camera is working
            ret, frame = self.cap.read()
            if not ret or frame is None or frame.size == 0:
                self.release()
                return False

            return True

        except Exception as e:
            logger.warning(f"Camera initialization error: {e}")
            self.release()
            return False

    def release(self):
        """Release camera resources."""
        try:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.camera_lock.release()
        except Exception:
            pass

    def detect_motion(self) -> Dict[str, Any]:
        """Detect motion in current frame."""
        if not self.initialize():
            return {"success": False, "error": "Failed to initialize camera"}

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None or frame.size == 0:
                return {"success": False, "error": "Failed to capture frame"}

            # Create a copy of the frame for drawing
            display_frame = frame.copy()

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

            # Draw motion indicators on frame
            if largest_contour is not None:
                x, y, w, h = cv2.boundingRect(largest_contour)
                center_x = int(x + w/2)
                center_y = int(y + h/2)

                # Draw rectangle around motion (thicker, brighter)
                cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 3)
                
                # Draw center point (larger, brighter)
                cv2.circle(display_frame, (center_x, center_y), 10, (0, 0, 255), -1)
                cv2.circle(display_frame, (center_x, center_y), 12, (255, 255, 255), 2)

                # Draw crosshair
                line_length = 20
                cv2.line(display_frame, (center_x - line_length, center_y),
                        (center_x + line_length, center_y), (255, 255, 255), 2)
                cv2.line(display_frame, (center_x, center_y - line_length),
                        (center_x, center_y + line_length), (255, 255, 255), 2)

                # Calculate normalized position (0-100)
                norm_x = (center_x / frame.shape[1]) * 100
                norm_y = (center_y / frame.shape[0]) * 100

                # Add timestamp and motion info
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                cv2.putText(display_frame, timestamp, (10, frame.shape[0] - 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                
                motion_text = f"Motion: ({int(norm_x)}, {int(norm_y)})"
                cv2.putText(display_frame, motion_text, (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                # Encode frame to JPEG with high quality
                _, buffer = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                frame_data = base64.b64encode(buffer).decode('utf-8')

                return {
                    "success": True,
                    "motion_detected": True,
                    "center_x": norm_x,
                    "center_y": norm_y,
                    "width": w,
                    "height": h,
                    "area": largest_area,
                    "frame": frame_data
                }

            # If no motion, just return the frame with timestamp
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(display_frame, timestamp, (10, frame.shape[0] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(display_frame, "No Motion", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            # Encode frame to JPEG with high quality
            _, buffer = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            frame_data = base64.b64encode(buffer).decode('utf-8')

            return {
                "success": True,
                "motion_detected": False,
                "frame": frame_data
            }

        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            self.release()

def main():
    """Main entry point for camera control script."""
    parser = argparse.ArgumentParser(description='Camera Motion Detection')
    parser.add_argument('command', choices=['motion'],
                       help='Command to execute')
    parser.add_argument('--width', type=int, default=640,
                       help='Frame width (default: 640)')
    parser.add_argument('--height', type=int, default=480,
                       help='Frame height (default: 480)')
    parser.add_argument('--camera-id', type=int, required=True,
                       help='Camera device ID')
    
    args = parser.parse_args()
    
    try:
        detector = MotionDetector(args.camera_id, args.width, args.height)
        result = detector.detect_motion()
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
