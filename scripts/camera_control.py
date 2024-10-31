#!/usr/bin/env python3

import sys
import logging
import time
import os
import fcntl
import base64
import subprocess
import json
import argparse
from typing import Dict, Any, Optional, List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to keep stdout clean for JSON output
)
logger = logging.getLogger(__name__)

# Force V4L2 backend
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"

try:
    import numpy as np
except ImportError as e:
    logger.error(f"Failed to import numpy: {e}")
    print(json.dumps({
        "success": False,
        "error": "Required module numpy is not available. Please install it with: pip install numpy"
    }))
    sys.exit(1)

try:
    import cv2
except ImportError as e:
    logger.error(f"Failed to import cv2: {e}")
    print(json.dumps({
        "success": False,
        "error": "Required module opencv-python is not available. Please install it with: pip install opencv-python"
    }))
    sys.exit(1)

def verify_camera_device(device_id: int) -> bool:
    """Verify if the camera device exists and has proper permissions."""
    device_path = f"/dev/video{device_id}"
    try:
        if not os.path.exists(device_path):
            logger.error(f"Camera device {device_path} does not exist")
            return False
        
        # Check if device is readable
        if not os.access(device_path, os.R_OK):
            logger.error(f"No read permission for {device_path}")
            return False
            
        # Check if device is writable
        if not os.access(device_path, os.W_OK):
            logger.error(f"No write permission for {device_path}")
            return False
            
        # Check if it's a USB camera device
        try:
            output = subprocess.check_output(['v4l2-ctl', '--list-devices']).decode()
            if 'Streaming Camera' in output and f'/dev/video{device_id}' in output:
                logger.info(f"Verified USB camera device: {device_path}")
                return True
            else:
                logger.error(f"Device {device_path} is not a USB camera")
                return False
        except subprocess.CalledProcessError:
            logger.warning("Could not verify USB camera with v4l2-ctl")
            # Fall back to basic verification
            return True
            
    except Exception as e:
        logger.error(f"Error verifying camera device: {e}")
        return False

def initialize_camera(device_id: int, width: int = 320, height: int = 240) -> Optional[cv2.VideoCapture]:
    """Initialize camera with optimized settings for Raspberry Pi."""
    try:
        # Verify camera device first
        if not verify_camera_device(device_id):
            return None

        # Add delay before opening camera
        time.sleep(1.0)
        
        # Try opening with V4L2 backend
        logger.info(f"Attempting to open camera {device_id} with V4L2 backend")
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        if not cap.isOpened():
            logger.error(f"Failed to open camera {device_id} with V4L2 backend")
            return None

        # Configure camera properties
        logger.info("Setting camera properties...")
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer for lower latency
        cap.set(cv2.CAP_PROP_FPS, 15)        # Stable FPS for Pi
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        # Try MJPG format first
        logger.info("Trying MJPG format...")
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
        
        # Camera quality settings
        if hasattr(cv2, 'CAP_PROP_AUTO_EXPOSURE'):
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)  # Auto exposure
        if hasattr(cv2, 'CAP_PROP_BRIGHTNESS'):
            cap.set(cv2.CAP_PROP_BRIGHTNESS, 0.5)   # Mid brightness
        if hasattr(cv2, 'CAP_PROP_CONTRAST'):
            cap.set(cv2.CAP_PROP_CONTRAST, 0.5)     # Mid contrast

        # Test frame capture
        ret, frame = cap.read()
        if ret and frame is not None and frame.size > 0:
            logger.info("Successfully initialized camera with MJPG format")
            # Log actual camera settings
            actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(cap.get(cv2.CAP_PROP_FPS))
            logger.info(f"Camera settings - Width: {actual_width}, Height: {actual_height}, FPS: {actual_fps}")
            return cap

        # If MJPG fails, try YUYV
        logger.info("MJPG failed, trying YUYV format...")
        cap.release()
        time.sleep(1.0)
        
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        if not cap.isOpened():
            logger.error("Failed to reopen camera for YUYV format")
            return None

        fourcc = cv2.VideoWriter_fourcc(*'YUYV')
        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_FPS, 15)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        if hasattr(cv2, 'CAP_PROP_AUTO_EXPOSURE'):
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)
        if hasattr(cv2, 'CAP_PROP_BRIGHTNESS'):
            cap.set(cv2.CAP_PROP_BRIGHTNESS, 0.5)
        if hasattr(cv2, 'CAP_PROP_CONTRAST'):
            cap.set(cv2.CAP_PROP_CONTRAST, 0.5)

        ret, frame = cap.read()
        if ret and frame is not None and frame.size > 0:
            logger.info("Successfully initialized camera with YUYV format")
            # Log actual camera settings
            actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(cap.get(cv2.CAP_PROP_FPS))
            logger.info(f"Camera settings - Width: {actual_width}, Height: {actual_height}, FPS: {actual_fps}")
            return cap

        logger.error("Failed to initialize camera with any format")
        return None

    except Exception as e:
        logger.error(f"Camera initialization error: {e}")
        return None

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_id=0):
        self.device_id = device_id
        self.device_path = f"/dev/video{device_id}"
        self.lock_path = f"/tmp/camera_{device_id}.lock"
        self.lock_file = None

    def acquire(self) -> bool:
        """Acquire lock on camera device."""
        try:
            # Clean up stale lock file
            if os.path.exists(self.lock_path):
                try:
                    with open(self.lock_path, 'r') as f:
                        pid = int(f.read().strip())
                        try:
                            os.kill(pid, 0)
                        except OSError:
                            os.remove(self.lock_path)
                except (OSError, ValueError):
                    try:
                        os.remove(self.lock_path)
                    except OSError:
                        pass

            # Add delay before acquiring lock
            time.sleep(1.0)

            self.lock_file = open(self.lock_path, 'w')
            fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
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
                # Add delay after releasing lock
                time.sleep(1.0)
        except Exception:
            pass

class CameraSettings:
    """Handles camera settings configuration."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.camera_lock = CameraLock(self.camera_id)

    def apply_settings(self) -> Dict[str, Any]:
        """Apply camera settings."""
        if not self.camera_lock.acquire():
            return {
                "success": False,
                "error": "Camera is currently in use by another process"
            }

        try:
            cap = initialize_camera(self.camera_id, self.width, self.height)
            if not cap:
                return {
                    "success": False,
                    "error": "Failed to initialize camera with new settings"
                }

            # Verify settings were applied
            actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            # Test frame capture
            ret, frame = cap.read()
            if not ret or frame is None or frame.size == 0:
                return {
                    "success": False,
                    "error": "Failed to capture test frame"
                }
            
            return {
                "success": True,
                "width": actual_width,
                "height": actual_height
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
        finally:
            if 'cap' in locals():
                cap.release()
            self.camera_lock.release()

class MotionDetector:
    """Handles motion detection and visualization."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50,
            varThreshold=16,
            detectShadows=False
        )
        self.camera_lock = CameraLock(self.camera_id)
        self.prev_frame = None
        self.min_area = 50

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        if not self.camera_lock.acquire():
            logger.warning("Camera is currently in use by another process")
            return False

        self.cap = initialize_camera(self.camera_id, self.width, self.height)
        return self.cap is not None

    def release(self):
        """Release camera resources."""
        try:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.camera_lock.release()
        except Exception as e:
            logger.warning(f"Error releasing camera: {e}")

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

                # Draw motion box with glow effect
                cv2.rectangle(display_frame, (x-2, y-2), (x+w+2, y+h+2), (0, 255, 0), 4)
                cv2.rectangle(display_frame, (x, y), (x+w, y+h), (255, 255, 255), 2)
                
                # Draw crosshair with glow effect
                cv2.line(display_frame, (center_x-15, center_y), (center_x+15, center_y), 
                        (0, 255, 0), 3)
                cv2.line(display_frame, (center_x, center_y-15), (center_x, center_y+15), 
                        (0, 255, 0), 3)
                cv2.line(display_frame, (center_x-10, center_y), (center_x+10, center_y), 
                        (255, 255, 255), 1)
                cv2.line(display_frame, (center_x, center_y-10), (center_x, center_y+10), 
                        (255, 255, 255), 1)

                # Calculate normalized position (0-100)
                norm_x = (center_x / frame.shape[1]) * 100
                norm_y = (center_y / frame.shape[0]) * 100

                # Add motion info with glow effect
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                motion_text = f"Motion Detected"
                coords_text = f"Position: ({int(norm_x)}, {int(norm_y)})"
                
                font = cv2.FONT_HERSHEY_SIMPLEX
                cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font, 
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font, 
                           0.5, (255, 255, 255), 1)
                cv2.putText(display_frame, motion_text, (5, 20), font, 
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, motion_text, (5, 20), font, 
                           0.5, (255, 255, 255), 1)
                cv2.putText(display_frame, coords_text, (5, 40), font, 
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, coords_text, (5, 40), font, 
                           0.5, (255, 255, 255), 1)

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
            font = cv2.FONT_HERSHEY_SIMPLEX
            cv2.putText(display_frame, "No Motion", (5, 20), font, 
                       0.5, (0, 255, 0), 2)
            cv2.putText(display_frame, "No Motion", (5, 20), font, 
                       0.5, (255, 255, 255), 1)
            cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font, 
                       0.5, (0, 255, 0), 2)
            cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font, 
                       0.5, (255, 255, 255), 1)

            return {
                "success": True,
                "motion_detected": False,
                "frame": self._encode_frame(display_frame)
            }

        except Exception as e:
            logger.warning(f"Motion detection error: {e}")
            return {"success": False, "error": str(e)}
        finally:
            self.release()

    def _encode_frame(self, frame: np.ndarray) -> str:
        """Encode frame to base64 JPEG."""
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buffer).decode('utf-8')

def main():
    """Main entry point for camera control script."""
    parser = argparse.ArgumentParser(description='Camera Control Script')
    parser.add_argument('command', choices=['motion', 'settings'],
                       help='Command to execute')
    parser.add_argument('--width', type=int, default=320,
                       help='Frame width (default: 320)')
    parser.add_argument('--height', type=int, default=240,
                       help='Frame height (default: 240)')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    
    args = parser.parse_args()
    
    try:
        if args.command == 'settings':
            settings = CameraSettings(args.camera_id, args.width, args.height)
            result = settings.apply_settings()
            print(json.dumps(result))  # Print JSON to stdout
            sys.exit(0 if result["success"] else 1)
        elif args.command == 'motion':
            detector = MotionDetector(args.camera_id, args.width, args.height)
            result = detector.detect_motion()
            print(json.dumps(result))  # Print JSON to stdout
            sys.exit(0 if result["success"] else 1)
            
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
