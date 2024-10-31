#!/usr/bin/env python3

import sys
import logging
import time
import os
import base64
import subprocess
import json
import argparse
import signal
from typing import Dict, Any, Optional, List, Tuple, Generator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to keep stdout clean for JSON output
)
logger = logging.getLogger(__name__)

# Force V4L2 backend and disable others
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"
os.environ["OPENCV_VIDEOIO_PRIORITY_GSTREAMER"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"

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

# Global flag for graceful shutdown
running = True

def signal_handler(signum, frame):
    """Handle shutdown signals."""
    global running
    running = False
    logger.info("Received shutdown signal")

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def verify_camera_device(device_id: int) -> bool:
    """Verify if the camera device exists and has proper permissions."""
    device_path = f"/dev/video{device_id}"
    try:
        if not os.path.exists(device_path):
            logger.error(f"Camera device {device_path} does not exist")
            return False
        
        # Check if device is readable and writable
        if not os.access(device_path, os.R_OK | os.W_OK):
            logger.error(f"Insufficient permissions for {device_path}")
            return False
            
        # Check device capabilities with v4l2-ctl
        try:
            # List supported formats
            formats = subprocess.check_output(['v4l2-ctl', '-d', device_path, '--list-formats-ext']).decode()
            logger.info(f"Supported formats:\n{formats}")
            
            # Get current settings
            settings = subprocess.check_output(['v4l2-ctl', '-d', device_path, '--all']).decode()
            logger.info(f"Current settings:\n{settings}")
            
            return True
        except subprocess.CalledProcessError as e:
            logger.warning(f"v4l2-ctl error: {e}")
            return True  # Continue even if v4l2-ctl fails
            
    except Exception as e:
        logger.error(f"Error verifying camera device: {e}")
        return False

def set_camera_controls(device_id: int):
    """Set optimal camera controls using v4l2-ctl."""
    device_path = f"/dev/video{device_id}"
    try:
        # Set power line frequency to 50Hz
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=power_line_frequency=1'])
        
        # Set auto exposure to manual mode
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=auto_exposure=1'])
        
        # Set exposure time
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=exposure_time_absolute=157'])
        
        # Enable auto white balance
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=white_balance_automatic=1'])
        
        # Set additional controls from v4l2-ctl output
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=brightness=0'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=contrast=0'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=saturation=64'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=hue=0'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=gamma=100'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=gain=0'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=sharpness=9'])
        subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=backlight_compensation=1'])
        
        logger.info("Camera controls configured")
    except Exception as e:
        logger.warning(f"Error setting camera controls: {e}")

def initialize_camera(device_id: int, width: int = 320, height: int = 240, fps: int = 15) -> Optional[cv2.VideoCapture]:
    """Initialize camera with optimized settings."""
    try:
        # Verify camera device first
        if not verify_camera_device(device_id):
            return None

        # Set camera controls
        set_camera_controls(device_id)

        # Add delay before opening camera
        time.sleep(2.0)
        
        # Open camera with V4L2 backend
        logger.info(f"Opening camera {device_id} with V4L2 backend")
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        if not cap.isOpened():
            logger.error("Failed to open camera")
            return None

        # Configure camera properties
        logger.info("Setting camera properties...")
        
        # Set MJPG format
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
        
        # Set resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        
        # Set FPS and buffer size
        cap.set(cv2.CAP_PROP_FPS, fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        # Add delay after setting properties
        time.sleep(1.0)

        # Test frame capture with increased retries
        for attempt in range(5):
            ret, frame = cap.read()
            if ret and frame is not None and frame.size > 0:
                # Log actual camera settings
                actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                actual_fps = int(cap.get(cv2.CAP_PROP_FPS))
                
                logger.info(f"Successfully initialized camera - Width: {actual_width}, Height: {actual_height}, FPS: {actual_fps}")
                return cap
            
            logger.warning(f"Frame capture attempt {attempt + 1} failed")
            time.sleep(1.0)

        logger.error("Failed to capture test frame")
        return None

    except Exception as e:
        logger.error(f"Camera initialization error: {e}")
        return None

class CameraSettings:
    """Handles camera settings configuration."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240, fps: int = 15):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps = fps

    def apply_settings(self) -> Dict[str, Any]:
        """Apply camera settings."""
        try:
            cap = initialize_camera(self.camera_id, self.width, self.height, self.fps)
            if not cap:
                return {
                    "success": False,
                    "error": "Failed to initialize camera with new settings"
                }

            # Verify settings were applied
            actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(cap.get(cv2.CAP_PROP_FPS))
            
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
                "height": actual_height,
                "fps": actual_fps
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
        finally:
            if 'cap' in locals() and cap is not None:
                cap.release()
                time.sleep(1.0)

class MotionDetector:
    """Handles motion detection and visualization."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240, fps: int = 15):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps = fps
        self.cap = None
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50,
            varThreshold=16,
            detectShadows=False
        )
        self.prev_frame = None
        self.min_area = 50
        self.frame_count = 0

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        self.cap = initialize_camera(self.camera_id, self.width, self.height, self.fps)
        if self.cap is not None:
            time.sleep(2.0)
            return True
        return False

    def release(self):
        """Release camera resources."""
        try:
            if self.cap:
                self.cap.release()
                self.cap = None
            logger.info("Camera resources released")
            time.sleep(1.0)
        except Exception as e:
            logger.warning(f"Error releasing camera: {e}")

    def _encode_frame(self, frame: np.ndarray) -> str:
        """Encode frame to base64 JPEG."""
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buffer).decode('utf-8')

    def process_frame(self) -> Optional[Dict[str, Any]]:
        """Process a single frame for motion detection."""
        try:
            ret, frame = self.cap.read()
            if not ret or frame is None or frame.size == 0:
                return None

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
            else:
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
            logger.warning(f"Frame processing error: {e}")
            return None

    def detect_motion(self):
        """Detect motion in camera feed."""
        if not self.initialize():
            print(json.dumps({
                "success": False,
                "error": "Failed to initialize camera"
            }))
            sys.stdout.flush()
            return

        try:
            # Warm up the camera
            for _ in range(5):
                ret, _ = self.cap.read()
                if ret:
                    logger.info("Camera warmed up successfully")
                    break
                time.sleep(1.0)

            # Process frames until shutdown
            last_frame_time = time.time()
            while running:
                result = self.process_frame()
                if result:
                    print(json.dumps(result))
                    sys.stdout.flush()

                # Control frame rate
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < 1.0 / self.fps:
                    time.sleep((1.0 / self.fps) - elapsed)
                last_frame_time = time.time()

        except Exception as e:
            logger.warning(f"Motion detection error: {e}")
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
            sys.stdout.flush()
        finally:
            self.release()

def main():
    """Main entry point for camera control script."""
    parser = argparse.ArgumentParser(description='Camera Control Script')
    parser.add_argument('command', choices=['motion', 'settings'],
                       help='Command to execute')
    parser.add_argument('--width', type=int, default=320,
                       help='Frame width (default: 320)')
    parser.add_argument('--height', type=int, default=240,
                       help='Frame height (default: 240)')
    parser.add_argument('--fps', type=int, default=15,
                       help='Frames per second (default: 15)')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    
    args = parser.parse_args()
    
    try:
        if args.command == 'settings':
            settings = CameraSettings(args.camera_id, args.width, args.height, args.fps)
            result = settings.apply_settings()
            print(json.dumps(result))
            sys.stdout.flush()
            sys.exit(0 if result["success"] else 1)
        elif args.command == 'motion':
            detector = MotionDetector(args.camera_id, args.width, args.height, args.fps)
            detector.detect_motion()
            sys.exit(0)
            
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
