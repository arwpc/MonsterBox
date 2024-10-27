#!/usr/bin/env python3

import sys
import time
import json
import logging
import argparse
import re
import os
import fcntl
import errno
from typing import Optional, Dict, Any, List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
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

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_path="/dev/video0"):
        self.device_path = device_path
        self.lock_path = f"/tmp/camera_{os.path.basename(device_path)}.lock"
        self.lock_file = None

    def acquire(self) -> bool:
        """Acquire lock on camera device.
        
        Returns:
            bool: True if lock acquired, False otherwise
        """
        try:
            self.lock_file = open(self.lock_path, 'w')
            fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except IOError as e:
            if e.errno == errno.EACCES or e.errno == errno.EAGAIN:
                return False
            raise
        except Exception as e:
            logger.error(f"Failed to acquire camera lock: {e}")
            return False

    def release(self):
        """Release lock on camera device."""
        try:
            if self.lock_file:
                fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_UN)
                self.lock_file.close()
                self.lock_file = None
        except Exception as e:
            logger.error(f"Failed to release camera lock: {e}")

class CameraStream:
    """Handles camera streaming operations with error recovery and status monitoring."""
    
    def __init__(self, camera_id: int = 0, width: int = 160, height: int = 120):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.retries = 3
        self.retry_delay = 2
        self.frame_count = 0
        self.start_time = time.time()
        self.last_frame_time = 0
        self.fps = 0
        self.is_initialized = False
        self.camera_lock = CameraLock()

    def initialize_camera(self) -> bool:
        """Initialize the camera with multiple retry attempts."""
        # First try to acquire camera lock
        if not self.camera_lock.acquire():
            logger.error("Camera is currently in use by another process")
            return False

        for attempt in range(self.retries):
            try:
                logger.info(f"Camera initialization attempt {attempt + 1}/{self.retries}")
                
                # Release any existing camera instance
                self.release()
                
                # Try different backend APIs
                backends = [
                    (cv2.CAP_V4L2, "V4L2"),
                    (cv2.CAP_V4L, "V4L"),
                    (cv2.CAP_GSTREAMER, "GStreamer"),
                    (cv2.CAP_ANY, "Auto")
                ]
                
                for backend, name in backends:
                    if self.try_camera_backend(backend, name):
                        self.is_initialized = True
                        self.start_time = time.time()
                        return True

                logger.error(f"Attempt {attempt + 1} failed, waiting {self.retry_delay}s...")
                time.sleep(self.retry_delay)
                
            except Exception as e:
                logger.error(f"Initialization error: {str(e)}")
                self.release()
                time.sleep(self.retry_delay)

        logger.error("Camera initialization failed after all attempts")
        return False

    def try_camera_backend(self, backend: int, name: str) -> bool:
        """Attempt to initialize camera with specific backend."""
        try:
            logger.info(f"Trying {name} backend...")
            
            self.cap = cv2.VideoCapture(self.camera_id)
            if not self.cap.isOpened():
                logger.warning(f"Failed to open camera with {name}")
                return False

            # Configure camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))

            # Multiple frame capture attempts
            success = False
            for _ in range(3):
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    success = True
                    break
                time.sleep(0.1)

            if not success:
                logger.warning(f"{name} backend failed to capture test frame")
                self.release()
                return False

            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))
            
            logger.info(f"Camera initialized: {actual_width}x{actual_height} @{actual_fps}fps using {name}")
            return True

        except Exception as e:
            logger.error(f"Error with {name} backend: {str(e)}")
            self.release()
            return False

    def get_frame(self) -> Optional[bytes]:
        """Capture and encode a frame from the camera."""
        if not self.cap or not self.cap.isOpened():
            return None

        try:
            # Update FPS calculation
            current_time = time.time()
            if current_time - self.start_time >= 1:
                self.fps = self.frame_count / (current_time - self.start_time)
                self.start_time = current_time
                self.frame_count = 0

            # Multiple frame capture attempts
            success = False
            for _ in range(3):
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    success = True
                    break
                time.sleep(0.1)

            if not success:
                logger.error("Failed to capture frame after multiple attempts")
                return None

            # Resize if necessary
            actual_size = (frame.shape[1], frame.shape[0])
            if actual_size != (self.width, self.height):
                frame = cv2.resize(frame, (self.width, self.height))

            # Add timestamp and FPS
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, f"FPS: {self.fps:.1f}", (10, 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            cv2.putText(frame, timestamp, (10, frame.shape[0] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

            # Encode frame with quality adjustment
            for quality in [85, 75, 65]:  # Try different compression levels
                ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
                if ret:
                    self.frame_count += 1
                    self.last_frame_time = current_time
                    return jpeg.tobytes()

            logger.error("Failed to encode frame at any quality level")
            return None

        except Exception as e:
            logger.error(f"Frame capture error: {str(e)}")
            return None

    def release(self):
        """Release camera resources."""
        try:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.camera_lock.release()
            self.is_initialized = False
        except Exception as e:
            logger.error(f"Error releasing camera: {e}")

def stream_camera(args):
    """Main camera streaming function."""
    camera = CameraStream(args.camera_id, args.width, args.height)
    
    try:
        if not camera.initialize_camera():
            logger.error("Failed to initialize camera")
            sys.exit(1)

        while True:
            frame_data = camera.get_frame()
            if frame_data is None:
                if not camera.initialize_camera():
                    logger.error("Failed to reinitialize camera")
                    break
                continue

            # Write frame data to stdout
            sys.stdout.buffer.write(b'--frame\r\n')
            sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
            sys.stdout.buffer.write(frame_data)
            sys.stdout.buffer.write(b'\r\n')
            sys.stdout.buffer.flush()

            # Rate limiting
            time.sleep(0.033)  # ~30 FPS

    except KeyboardInterrupt:
        logger.info("Stream stopped by user")
    except BrokenPipeError:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
    finally:
        camera.release()

def main():
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(description='Camera Streaming Script')
    parser.add_argument('--width', type=int, default=160,
                       help='Stream width (default: 160)')
    parser.add_argument('--height', type=int, default=120,
                       help='Stream height (default: 120)')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    
    args = parser.parse_args()
    stream_camera(args)

if __name__ == "__main__":
    main()
