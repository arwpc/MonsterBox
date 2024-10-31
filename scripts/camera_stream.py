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
    stream=sys.stderr  # Log to stderr to keep stdout clean for MJPEG stream
)
logger = logging.getLogger(__name__)

# Force V4L2 backend and disable GStreamer
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"
os.environ["OPENCV_VIDEOIO_PRIORITY_GSTREAMER"] = "0"

try:
    import numpy as np
except ImportError as e:
    logger.error(f"Failed to import numpy: {e}")
    sys.exit(1)

try:
    import cv2
except ImportError as e:
    logger.error(f"Failed to import cv2: {e}")
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

def initialize_camera(device_id: int, width: int = 320, height: int = 240) -> Tuple[Optional[cv2.VideoCapture], bool]:
    """Initialize camera with optimized settings for Raspberry Pi."""
    try:
        # Verify camera device first
        if not verify_camera_device(device_id):
            return None, False

        # Add delay before opening camera
        time.sleep(2.0)  # Increased delay
        
        # Try opening with V4L2 backend
        logger.info(f"Attempting to open camera {device_id} with V4L2 backend")
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        if not cap.isOpened():
            logger.error(f"Failed to open camera {device_id} with V4L2 backend")
            return None, False

        # Configure camera properties
        logger.info("Setting camera properties...")
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer for lower latency
        cap.set(cv2.CAP_PROP_FPS, 15)        # Stable FPS for Pi

        # Choose format based on resolution
        if width > 640 or height > 480:
            logger.info("Using MJPG format for high resolution")
            fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        else:
            logger.info("Using YUYV format for low resolution")
            fourcc = cv2.VideoWriter_fourcc(*'YUYV')

        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        
        # Camera quality settings
        if hasattr(cv2, 'CAP_PROP_AUTO_EXPOSURE'):
            cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 1)  # Auto exposure
        if hasattr(cv2, 'CAP_PROP_BRIGHTNESS'):
            cap.set(cv2.CAP_PROP_BRIGHTNESS, 0.5)   # Mid brightness
        if hasattr(cv2, 'CAP_PROP_CONTRAST'):
            cap.set(cv2.CAP_PROP_CONTRAST, 0.5)     # Mid contrast

        # Add delay after setting properties
        time.sleep(1.0)

        # Test frame capture
        for _ in range(3):  # Try up to 3 times
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
                    "height": actual_height
                }))
                sys.stdout.flush()  # Ensure JSON is sent immediately
                
                return cap, True
            time.sleep(0.5)  # Wait before retry

        logger.error("Failed to capture test frame")
        return None, False

    except Exception as e:
        logger.error(f"Camera initialization error: {e}")
        return None, False

class CameraStream:
    """Handles camera streaming in MJPEG format."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap = None
        self.frame_count = 0
        self.error_count = 0
        self.max_errors = 3

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        cap, success = initialize_camera(self.camera_id, self.width, self.height)
        if success:
            self.cap = cap
            # Add delay after successful initialization
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
            # Add delay after release
            time.sleep(1.0)
        except Exception as e:
            logger.warning(f"Error releasing camera: {e}")

    def stream(self):
        """Stream camera frames in MJPEG format."""
        if not self.initialize():
            logger.error("Failed to initialize camera")
            return

        try:
            last_frame_time = time.time()
            target_frame_time = 1.0 / 15  # Target 15 FPS

            # Warm up the camera
            for _ in range(5):
                ret, _ = self.cap.read()
                if ret:
                    logger.info("Camera warmed up successfully")
                    break
                time.sleep(0.5)

            while True:
                try:
                    ret, frame = self.cap.read()
                    if not ret or frame is None:
                        self.error_count += 1
                        logger.warning(f"Failed to read frame (attempt {self.error_count}/{self.max_errors})")
                        if self.error_count >= self.max_errors:
                            break
                        time.sleep(1.0)  # Wait before retry
                        continue

                    # Reset error count on successful frame
                    self.error_count = 0
                    self.frame_count += 1

                    # Log periodic status
                    if self.frame_count % 30 == 0:  # Every 30 frames
                        logger.info(f"Streaming frame {self.frame_count}")

                    # Add timestamp
                    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                               0.5, (0, 255, 0), 2)
                    cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                               0.5, (255, 255, 255), 1)

                    # Encode frame as JPEG with moderate quality
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
                    time.sleep(1.0)  # Wait before retry

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
    parser.add_argument('--width', type=int, default=320,
                       help='Frame width (default: 320)')
    parser.add_argument('--height', type=int, default=240,
                       help='Frame height (default: 240)')
    
    args = parser.parse_args()
    
    try:
        streamer = CameraStream(args.camera_id, args.width, args.height)
        streamer.stream()
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
