#!/usr/bin/env python3

import sys
import logging
import time
import os
import subprocess
import argparse
import json
from typing import Optional, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to keep stdout clean
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
    sys.stdout.flush()
    sys.exit(1)

try:
    import cv2
except ImportError as e:
    logger.error(f"Failed to import cv2: {e}")
    print(json.dumps({
        "success": False,
        "error": "Required module opencv-python is not available. Please install it with: pip install opencv-python"
    }))
    sys.stdout.flush()
    sys.exit(1)

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
            # Redirect stderr to devnull to suppress debug output
            with open(os.devnull, 'w') as devnull:
                # List supported formats
                formats = subprocess.check_output(
                    ['v4l2-ctl', '-d', device_path, '--list-formats-ext'],
                    stderr=devnull
                ).decode()
                
                # Get current settings
                settings = subprocess.check_output(
                    ['v4l2-ctl', '-d', device_path, '--all'],
                    stderr=devnull
                ).decode()
            
            # Log device info to stderr
            logger.info(f"Device {device_path} capabilities:")
            logger.info(f"Supported formats:\n{formats}")
            logger.info(f"Current settings:\n{settings}")
            
            # Check if MJPG format is supported
            if 'MJPG' not in formats:
                logger.error("Camera does not support MJPG format")
                return False
                
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
        # Redirect stderr to devnull to suppress debug output
        with open(os.devnull, 'w') as devnull:
            # Reset all controls to default
            subprocess.run(['v4l2-ctl', '-d', device_path, '--all'], stderr=devnull)
            
            # Set power line frequency to 50Hz
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=power_line_frequency=1'], stderr=devnull)
            
            # Set auto exposure to manual mode
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=auto_exposure=1'], stderr=devnull)
            
            # Set exposure time
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=exposure_time_absolute=157'], stderr=devnull)
            
            # Enable auto white balance
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=white_balance_automatic=1'], stderr=devnull)
            
            # Set additional controls from v4l2-ctl output
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=brightness=0'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=contrast=32'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=saturation=64'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=hue=0'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=gamma=100'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=gain=0'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=sharpness=9'], stderr=devnull)
            subprocess.run(['v4l2-ctl', '-d', device_path, '--set-ctrl=backlight_compensation=1'], stderr=devnull)
        
        logger.info("Camera controls configured")
    except Exception as e:
        logger.warning(f"Error setting camera controls: {e}")

def initialize_camera(device_id: int, width: int = 1280, height: int = 720, fps: int = 30) -> Tuple[Optional[cv2.VideoCapture], bool]:
    """Initialize camera with optimized settings."""
    try:
        # Verify camera device first
        if not verify_camera_device(device_id):
            return None, False

        # Set camera controls
        set_camera_controls(device_id)

        # Add delay before opening camera
        time.sleep(2.0)
        
        # Open camera with V4L2 backend
        logger.info(f"Opening camera {device_id} with V4L2 backend")
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        if not cap.isOpened():
            logger.error("Failed to open camera")
            return None, False

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
                
                # Print success JSON to stdout
                print(json.dumps({
                    "success": True,
                    "width": actual_width,
                    "height": actual_height,
                    "fps": actual_fps
                }))
                sys.stdout.flush()
                
                return cap, True
            
            logger.warning(f"Frame capture attempt {attempt + 1} failed")
            time.sleep(1.0)

        logger.error("Failed to capture test frame")
        return None, False

    except Exception as e:
        logger.error(f"Camera initialization error: {e}")
        return None, False

class CameraStream:
    """Handles camera streaming in MJPEG format."""
    
    def __init__(self, camera_id: int = 0, width: int = 1280, height: int = 720, fps: int = 30):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps = fps
        self.cap = None
        self.frame_count = 0
        self.error_count = 0
        self.max_errors = 5

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        cap, success = initialize_camera(self.camera_id, self.width, self.height, self.fps)
        if success:
            self.cap = cap
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

    def stream(self):
        """Stream camera frames in MJPEG format."""
        if not self.initialize():
            return

        try:
            last_frame_time = time.time()
            target_frame_time = 1.0 / self.fps

            # Warm up the camera
            for _ in range(5):
                ret, _ = self.cap.read()
                if ret:
                    logger.info("Camera warmed up successfully")
                    break
                time.sleep(1.0)

            # Print initialization success
            print(json.dumps({
                "success": True,
                "message": "Stream initialized"
            }))
            sys.stdout.flush()

            # Start MJPEG stream
            print("--frame")  # Start of MJPEG stream marker
            sys.stdout.flush()

            while True:
                try:
                    ret, frame = self.cap.read()
                    if not ret or frame is None:
                        self.error_count += 1
                        logger.warning(f"Failed to read frame (attempt {self.error_count}/{self.max_errors})")
                        if self.error_count >= self.max_errors:
                            break
                        time.sleep(1.0)
                        continue

                    # Reset error count on successful frame
                    self.error_count = 0
                    self.frame_count += 1

                    # Log periodic status
                    if self.frame_count % 30 == 0:
                        logger.info(f"Streaming frame {self.frame_count}")

                    # Add timestamp
                    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                               0.5, (0, 255, 0), 2)
                    cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                               0.5, (255, 255, 255), 1)

                    # Encode frame as JPEG
                    _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    
                    # Write MJPEG frame
                    sys.stdout.buffer.write(b'--frame\r\n')
                    sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
                    sys.stdout.buffer.write(jpeg.tobytes())
                    sys.stdout.buffer.write(b'\r\n')
                    sys.stdout.buffer.flush()

                    # Frame rate control
                    current_time = time.time()
                    elapsed = current_time - last_frame_time
                    if elapsed < target_frame_time:
                        time.sleep(target_frame_time - elapsed)
                    last_frame_time = time.time()

                except Exception as e:
                    self.error_count += 1
                    logger.error(f"Frame processing error: {e}")
                    if self.error_count >= self.max_errors:
                        break
                    time.sleep(1.0)

        except BrokenPipeError:
            logger.info("Client disconnected")
        except KeyboardInterrupt:
            logger.info("Stream interrupted")
        except Exception as e:
            logger.error(f"Streaming error: {str(e)}")
        finally:
            self.release()

def main():
    """Main entry point for camera streaming script."""
    parser = argparse.ArgumentParser(description='Camera Streaming Script')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    parser.add_argument('--width', type=int, default=1280,
                       help='Frame width (default: 1280)')
    parser.add_argument('--height', type=int, default=720,
                       help='Frame height (default: 720)')
    parser.add_argument('--fps', type=int, default=30,
                       help='Frames per second (default: 30)')
    
    args = parser.parse_args()
    
    try:
        streamer = CameraStream(args.camera_id, args.width, args.height, args.fps)
        streamer.stream()
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
