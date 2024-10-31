#!/usr/bin/env python3

import sys
import logging
import time
import os
import fcntl
import subprocess
import argparse
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Force V4L2 backend
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"

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

class CameraStream:
    """Handles camera streaming in MJPEG format."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap = None
        self.camera_lock = CameraLock(self.camera_id)
        self.frame_count = 0
        self.error_count = 0
        self.max_errors = 3

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        if not self.camera_lock.acquire():
            logger.warning("Camera is currently in use by another process")
            return False

        self.cap = initialize_camera(self.camera_id, self.width, self.height)
        if self.cap is not None:
            # Reset counters on successful initialization
            self.frame_count = 0
            self.error_count = 0
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

    def stream(self):
        """Stream camera frames in MJPEG format."""
        if not self.initialize():
            sys.stderr.write("Failed to initialize camera\n")
            return

        try:
            last_frame_time = time.time()
            target_frame_time = 1.0 / 15  # Target 15 FPS

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

                    # Resize frame if necessary
                    actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    if actual_width != self.width or actual_height != self.height:
                        frame = cv2.resize(frame, (self.width, self.height))

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
