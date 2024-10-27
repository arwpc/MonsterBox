#!/usr/bin/env python3

import sys
import json
import argparse
import logging
import subprocess
import time
import os
import fcntl
import errno
import glob
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import OpenCV after numpy is properly initialized
try:
    import numpy as np
    import cv2
except ImportError as e:
    logger.error(f"Failed to import required libraries: {e}")
    sys.exit(1)

def find_usb_camera():
    """Find the USB camera device."""
    try:
        # Run v4l2-ctl to list devices
        result = subprocess.run(['v4l2-ctl', '--list-devices'], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            output = result.stdout
            # Look for USB camera section
            if 'USB 2.0 Camera' in output:
                # Get the first video device listed under USB camera
                lines = output.split('\n')
                for i, line in enumerate(lines):
                    if 'USB 2.0 Camera' in line:
                        # Next line should contain the video device
                        for j in range(i + 1, min(i + 4, len(lines))):
                            if 'video' in lines[j]:
                                device = lines[j].strip()
                                device_num = int(device.replace('/dev/video', ''))
                                return device_num
        
        # Fallback to checking common video devices
        devices = ['/dev/video0', '/dev/video1']
        for device in devices:
            if os.path.exists(device) and os.access(device, os.R_OK):
                try:
                    cap = cv2.VideoCapture(int(device.replace('/dev/video', '')), cv2.CAP_V4L2)
                    if cap.isOpened():
                        ret, frame = cap.read()
                        if ret and frame is not None and frame.size > 0:
                            cap.release()
                            return int(device.replace('/dev/video', ''))
                    cap.release()
                except Exception:
                    continue

        logger.error("No USB camera found")
        return None
    except Exception as e:
        logger.error(f"Error finding camera: {e}")
        return None

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_path="/dev/video0"):
        self.device_path = device_path
        self.lock_path = f"/tmp/camera_{os.path.basename(device_path)}.lock"
        self.lock_file = None

    def acquire(self) -> bool:
        """Acquire lock on camera device."""
        try:
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

class CameraController:
    """Handles camera operations and head tracking control."""
    
    def __init__(self, camera_id: Optional[int] = None, width: int = 640, height: int = 480):
        self.camera_id = camera_id if camera_id is not None else find_usb_camera()
        if self.camera_id is None:
            raise RuntimeError("No USB camera found")
            
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=100,
            varThreshold=10
        )
        self.head_tracking_process = None
        self.last_frame_time = 0
        self.frame_count = 0
        self.camera_lock = CameraLock(f"/dev/video{self.camera_id}")

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        if not self.camera_lock.acquire():
            return False

        try:
            # Release any existing camera instance
            self.release()
            
            # Try V4L2 backend
            self.cap = cv2.VideoCapture(self.camera_id, cv2.CAP_V4L2)
            
            if not self.cap.isOpened():
                return False

            # Configure camera settings
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FPS, 30)

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

    def capture_frame(self) -> Dict[str, Any]:
        """Capture a single frame and return its properties."""
        if not self.initialize():
            return {"success": False, "error": "Failed to initialize camera"}

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None or frame.size == 0:
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
            return {"success": False, "error": str(e)}
        finally:
            self.release()

    def detect_motion(self) -> Dict[str, Any]:
        """Detect motion in current frame."""
        if not self.initialize():
            return {"success": False, "error": "Failed to initialize camera"}

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None or frame.size == 0:
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
            return {"success": False, "error": str(e)}
        finally:
            self.release()

    def update_settings(self, width: int, height: int) -> Dict[str, Any]:
        """Update camera resolution settings."""
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
        """Start head tracking with specified servo."""
        try:
            # Kill any existing head tracking process
            self.stop_head_tracking()

            script_path = os.path.join(os.path.dirname(__file__), 'head_track.py')
            self.head_tracking_process = subprocess.Popen(
                ['python3', script_path, 'start', str(servo_id)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            time.sleep(1)  # Brief wait to check process started
            if self.head_tracking_process.poll() is not None:
                stdout, stderr = self.head_tracking_process.communicate()
                error_msg = stderr.decode() if stderr else stdout.decode()
                return {"success": False, "error": error_msg}
                
            return {"success": True, "message": "Head tracking started"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def stop_head_tracking(self) -> Dict[str, Any]:
        """Stop head tracking."""
        try:
            if self.head_tracking_process:
                self.head_tracking_process.terminate()
                try:
                    self.head_tracking_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.head_tracking_process.kill()
                    self.head_tracking_process.wait()
                
                self.head_tracking_process = None
                
            return {"success": True, "message": "Head tracking stopped"}
        except Exception as e:
            return {"success": False, "error": str(e)}

def main():
    """Main entry point for camera control script."""
    parser = argparse.ArgumentParser(description='Camera Control Script')
    parser.add_argument('command', choices=['capture', 'motion', 'settings', 'head_track'],
                       help='Command to execute')
    parser.add_argument('--width', type=int, default=640,
                       help='Frame width (default: 640)')
    parser.add_argument('--height', type=int, default=480,
                       help='Frame height (default: 480)')
    parser.add_argument('--camera-id', type=int, default=None,
                       help='Camera device ID (default: auto-detect)')
    parser.add_argument('--servo-id', type=int,
                       help='Servo ID for head tracking')
    parser.add_argument('--action', choices=['start', 'stop'],
                       help='Action for head tracking')
    
    args = parser.parse_args()
    
    try:
        controller = CameraController(args.camera_id, args.width, args.height)
    except RuntimeError as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

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
