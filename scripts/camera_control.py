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

class HeadTracker:
    """Manages head tracking subprocess."""
    
    def __init__(self, camera_id: int = 0):
        self.camera_id = camera_id
        self.process = None
        self.script_path = os.path.join(os.path.dirname(__file__), 'head_track.py')

    def start(self, servo_id: int = 0) -> bool:
        """Start head tracking process."""
        try:
            if self.process:
                self.stop()
            
            # Kill any existing head tracking processes
            subprocess.run(['pkill', '-f', 'head_track.py'], capture_output=True)
            time.sleep(1)  # Wait for processes to die
            
            self.process = subprocess.Popen(
                ['python3', self.script_path, 'start', str(servo_id)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            return True
        except Exception as e:
            logger.error(f"Failed to start head tracking: {e}")
            return False

    def stop(self) -> bool:
        """Stop head tracking process."""
        try:
            if self.process:
                self.process.terminate()
                self.process.wait(timeout=5)
                self.process = None
            
            # Ensure all head tracking processes are killed
            subprocess.run(['pkill', '-f', 'head_track.py'], capture_output=True)
            return True
        except Exception as e:
            logger.error(f"Failed to stop head tracking: {e}")
            return False

class MotionDetector:
    """Handles motion detection and visualization."""
    
    def __init__(self, camera_id: int = 0, width: int = 640, height: int = 480):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50,  # Shorter history for faster adaptation
            varThreshold=16,  # Lower threshold for more sensitive detection
            detectShadows=False  # Disable shadow detection for better performance
        )
        self.camera_lock = CameraLock(self.camera_id)
        self.prev_frame = None
        self.min_area = 100  # Minimum area for motion detection

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

            # Convert to grayscale and apply blur
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            # Initialize previous frame if needed
            if self.prev_frame is None:
                self.prev_frame = gray
                return {
                    "success": True,
                    "motion_detected": False,
                    "frame": self._encode_frame(display_frame)
                }

            # Calculate absolute difference between frames
            frame_delta = cv2.absdiff(self.prev_frame, gray)
            thresh = cv2.threshold(frame_delta, 25, 255, cv2.THRESH_BINARY)[1]

            # Apply background subtraction
            mask = self.background_subtractor.apply(gray)
            
            # Combine frame difference and background subtraction
            combined_mask = cv2.bitwise_or(thresh, mask)
            
            # Clean up the mask
            combined_mask = cv2.erode(combined_mask, None, iterations=2)
            combined_mask = cv2.dilate(combined_mask, None, iterations=2)

            # Find contours
            contours, _ = cv2.findContours(
                combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            # Update previous frame
            self.prev_frame = gray

            # Find largest contour
            largest_contour = None
            largest_area = 0
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > self.min_area and area > largest_area:
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

                return {
                    "success": True,
                    "motion_detected": True,
                    "center_x": norm_x,
                    "center_y": norm_y,
                    "width": w,
                    "height": h,
                    "area": largest_area,
                    "frame": self._encode_frame(display_frame)
                }

            # If no motion, just return the frame with timestamp
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(display_frame, timestamp, (10, frame.shape[0] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(display_frame, "No Motion", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            return {
                "success": True,
                "motion_detected": False,
                "frame": self._encode_frame(display_frame)
            }

        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            self.release()

    def _encode_frame(self, frame: np.ndarray) -> str:
        """Encode frame to base64 JPEG."""
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return base64.b64encode(buffer).decode('utf-8')

def main():
    """Main entry point for camera control script."""
    parser = argparse.ArgumentParser(description='Camera Control Script')
    parser.add_argument('command', choices=['motion', 'head_track'],
                       help='Command to execute')
    parser.add_argument('--width', type=int, default=640,
                       help='Frame width (default: 640)')
    parser.add_argument('--height', type=int, default=480,
                       help='Frame height (default: 480)')
    parser.add_argument('--camera-id', type=int, required=True,
                       help='Camera device ID')
    parser.add_argument('--action', choices=['start', 'stop'],
                       help='Action for head tracking')
    parser.add_argument('--servo-id', type=int,
                       help='Servo ID for head tracking')
    
    args = parser.parse_args()
    
    try:
        if args.command == 'motion':
            detector = MotionDetector(args.camera_id, args.width, args.height)
            result = detector.detect_motion()
            print(json.dumps(result))
            
        elif args.command == 'head_track':
            tracker = HeadTracker(args.camera_id)
            if args.action == 'start':
                if args.servo_id is None:
                    print(json.dumps({
                        "success": False,
                        "error": "Servo ID is required for head tracking"
                    }))
                else:
                    success = tracker.start(args.servo_id)
                    print(json.dumps({
                        "success": success,
                        "error": None if success else "Failed to start head tracking"
                    }))
            elif args.action == 'stop':
                success = tracker.stop()
                print(json.dumps({
                    "success": success,
                    "error": None if success else "Failed to stop head tracking"
                }))
            else:
                print(json.dumps({
                    "success": False,
                    "error": "Invalid action for head tracking"
                }))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
