#!/usr/bin/env python3

import sys
import time
import json
import logging
import argparse
import os
import fcntl
import errno
from typing import Optional, Dict, Any, List

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

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_id=0):
        self.device_path = f"/dev/video{device_id}"
        self.lock_path = f"/tmp/camera_{device_id}.lock"
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

class CameraStream:
    """Handles camera streaming operations with error recovery and status monitoring."""
    
    def __init__(self, camera_id: int = 0, width: int = 640, height: int = 480):
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
        self.camera_lock = CameraLock(self.camera_id)

    def initialize_camera(self) -> bool:
        """Initialize the camera with multiple retry attempts."""
        if not self.camera_lock.acquire():
            logger.warning("Camera is currently in use by another process")
            return False

        for attempt in range(self.retries):
            try:
                # Release any existing camera instance
                self.release()
                
                # Try V4L2 backend
                self.cap = cv2.VideoCapture(self.camera_id, cv2.CAP_V4L2)
                
                if not self.cap.isOpened():
                    if attempt < self.retries - 1:
                        time.sleep(self.retry_delay)
                        continue
                    return False

                # Configure camera properties
                self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self.cap.set(cv2.CAP_PROP_FPS, 30)

                # Verify camera is working
                ret, frame = self.cap.read()
                if not ret or frame is None or frame.size == 0:
                    if attempt < self.retries - 1:
                        time.sleep(self.retry_delay)
                        continue
                    return False

                self.is_initialized = True
                self.start_time = time.time()
                return True

            except Exception as e:
                logger.warning(f"Initialization attempt {attempt + 1} failed: {str(e)}")
                self.release()
                if attempt < self.retries - 1:
                    time.sleep(self.retry_delay)

        return False

    def get_frame(self) -> Optional[bytes]:
        """Capture and encode a frame from the camera."""
        if not self.cap or not self.cap.isOpened():
            return None

        try:
            ret, frame = self.cap.read()
            if not ret or frame is None or frame.size == 0:
                return None

            # Update FPS calculation
            current_time = time.time()
            if current_time - self.start_time >= 1:
                self.fps = self.frame_count / (current_time - self.start_time)
                self.start_time = current_time
                self.frame_count = 0

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

            # Encode frame
            ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                self.frame_count += 1
                self.last_frame_time = current_time
                return jpeg.tobytes()

            return None

        except Exception as e:
            logger.warning(f"Frame capture error: {str(e)}")
            return None

    def release(self):
        """Release camera resources."""
        try:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.camera_lock.release()
            self.is_initialized = False
        except Exception:
            pass

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
                    break
                continue

            sys.stdout.buffer.write(b'--frame\r\n')
            sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
            sys.stdout.buffer.write(frame_data)
            sys.stdout.buffer.write(b'\r\n')
            sys.stdout.buffer.flush()

            time.sleep(0.033)  # ~30 FPS

    except KeyboardInterrupt:
        pass
    except BrokenPipeError:
        pass
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
    finally:
        camera.release()

def main():
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(description='Camera Streaming Script')
    parser.add_argument('--width', type=int, default=640,
                       help='Stream width (default: 640)')
    parser.add_argument('--height', type=int, default=480,
                       help='Stream height (default: 480)')
    parser.add_argument('--camera-id', type=int, required=True,
                       help='Camera device ID')
    
    args = parser.parse_args()
    stream_camera(args)

if __name__ == "__main__":
    main()
