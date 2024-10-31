#!/usr/bin/env python3

import sys
import cv2
import argparse
import logging
import time
import os
import fcntl
import subprocess
import json
from typing import Optional, List, Dict

# Configure logging
logging.basicConfig(
    level=logging.INFO,  # Changed to INFO for better debugging
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Force V4L2 backend before importing OpenCV
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_GSTREAMER"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"
os.environ["OPENCV_VIDEOIO_BACKEND"] = "v4l2"

def get_supported_formats(device_id: int) -> List[str]:
    """Get list of supported formats for the camera."""
    formats = []
    try:
        result = subprocess.run(['v4l2-ctl', '-d', f'/dev/video{device_id}', '--list-formats'],
                              capture_output=True, text=True)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if '[' in line and ']' in line:
                    fmt = line.split('[')[1].split(']')[0]
                    formats.append(fmt)
        logger.info(f"Supported formats for camera {device_id}: {formats}")
    except Exception as e:
        logger.warning(f"Failed to get supported formats: {e}")
    return formats or ['MJPG', 'YUYV']  # Default formats if query fails

def verify_camera_access(device_id: int, retries: int = 3) -> bool:
    """Verify camera device exists and is accessible."""
    device_path = f"/dev/video{device_id}"
    alt_device_path = f"/dev/video{1 if device_id == 0 else 0}"  # Try alternate device
    
    # Check if device exists
    if not os.path.exists(device_path):
        logger.warning(f"Camera device {device_path} does not exist")
        return False
    
    # Check device permissions
    try:
        st = os.stat(device_path)
        logger.info(f"Device permissions: {oct(st.st_mode)}")
    except Exception as e:
        logger.warning(f"Failed to check device permissions: {e}")

    # Get supported formats
    formats = get_supported_formats(device_id)
    logger.info(f"Attempting formats: {formats}")

    # Try to open the camera multiple times
    for attempt in range(retries):
        try:
            logger.info(f"Attempting to open camera {device_id} (attempt {attempt + 1}/{retries})")
            
            # Try to kill any existing processes using both devices
            try:
                subprocess.run(['fuser', '-k', device_path], capture_output=True)
                subprocess.run(['fuser', '-k', alt_device_path], capture_output=True)
                time.sleep(1.0)  # Increased delay after killing processes
            except Exception as e:
                logger.info(f"Failed to kill existing processes: {e}")

            # Try each supported format
            for fmt in formats:
                fourcc = cv2.VideoWriter_fourcc(*fmt)
                cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FOURCC, fourcc)
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 320)  # Start with low resolution
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
                    cap.set(cv2.CAP_PROP_FPS, 15)
                    
                    ret, frame = cap.read()
                    cap.release()
                    
                    if ret and frame is not None and frame.size > 0:
                        logger.info(f"Successfully opened camera {device_id} with format {fmt}")
                        return True
            
            logger.warning(f"Failed to open camera {device_id} with any format")
            time.sleep(1.0)  # Increased delay between attempts
            
        except Exception as e:
            logger.warning(f"Camera access attempt {attempt + 1} failed: {e}")
            time.sleep(1.0)  # Increased delay after error
    
    logger.warning(f"Failed to access camera after {retries} attempts")
    return False

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
            # Kill any existing camera processes
            try:
                subprocess.run(['fuser', '-k', self.device_path], capture_output=True)
                time.sleep(0.5)
            except Exception as e:
                logger.info(f"Failed to kill existing processes: {e}")

            # Check and clean up stale lock file
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
    """Handles camera streaming in MJPEG format."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):  # Default resolution reduced
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.camera_lock = CameraLock(self.camera_id)

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        # First verify camera is accessible
        if not verify_camera_access(self.camera_id):
            return False

        if not self.camera_lock.acquire():
            logger.warning("Camera is currently in use by another process")
            return False

        try:
            # Release any existing camera instance
            self.release()
            
            # Wait for camera to be fully released
            time.sleep(1.0)  # Increased delay
            
            # Get supported formats
            formats = get_supported_formats(self.camera_id)
            logger.info(f"Attempting formats: {formats}")
            
            # Try each supported format
            for fmt in formats:
                logger.info(f"Trying format: {fmt}")
                
                # Create capture with explicit backend
                self.cap = cv2.VideoCapture(self.camera_id, cv2.CAP_V4L2)
                
                if not self.cap.isOpened():
                    logger.warning(f"Failed to open camera {self.camera_id}")
                    continue

                # Configure camera properties
                fourcc = cv2.VideoWriter_fourcc(*fmt)
                self.cap.set(cv2.CAP_PROP_FOURCC, fourcc)
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self.cap.set(cv2.CAP_PROP_FPS, 15)

                # Verify camera is working with multiple attempts
                for attempt in range(3):
                    ret, frame = self.cap.read()
                    if ret and frame is not None and frame.size > 0:
                        # Resize frame if necessary
                        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        if actual_width != self.width or actual_height != self.height:
                            frame = cv2.resize(frame, (self.width, self.height))
                        logger.info(f"Successfully initialized camera with format {fmt}")
                        return True
                    time.sleep(0.5)  # Increased delay between attempts

                # If we get here, this format didn't work
                self.cap.release()
                self.cap = None
                time.sleep(0.5)  # Delay before trying next format

            logger.warning("Failed to initialize camera with any format")
            return False

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
            # Add delay after release
            time.sleep(0.1)
        except Exception as e:
            logger.warning(f"Error releasing camera: {e}")

    def stream(self):
        """Stream camera frames in MJPEG format."""
        if not self.initialize():
            sys.stderr.write("Failed to initialize camera\n")
            return

        try:
            frame_count = 0
            last_frame_time = time.time()
            target_frame_time = 1.0 / 15  # Target 15 FPS

            while True:
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    break

                # Resize frame if necessary
                actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                if actual_width != self.width or actual_height != self.height:
                    frame = cv2.resize(frame, (self.width, self.height))

                # Add timestamp (smaller font for lower resolutions)
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                font = cv2.FONT_HERSHEY_SIMPLEX
                # Draw timestamp with glow effect
                cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                           0.5, (0, 255, 0), 2)
                cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                           0.5, (255, 255, 255), 1)

                # Encode frame as JPEG with reduced quality
                _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                
                # Write MJPEG frame
                sys.stdout.buffer.write(b'--frame\r\n')
                sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
                sys.stdout.buffer.write(jpeg.tobytes())
                sys.stdout.buffer.write(b'\r\n')
                sys.stdout.buffer.flush()

                # Frame rate control
                frame_count += 1
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < target_frame_time:
                    time.sleep(target_frame_time - elapsed)
                last_frame_time = time.time()

                # Periodically verify camera is still working
                if frame_count % 30 == 0:  # Check every 30 frames
                    if not verify_camera_access(self.camera_id, retries=1):
                        logger.warning("Camera became inaccessible")
                        break

        except BrokenPipeError:
            # Client disconnected
            pass
        except KeyboardInterrupt:
            # Ctrl+C pressed
            pass
        except Exception as e:
            sys.stderr.write(f"Streaming error: {str(e)}\n")
        finally:
            self.release()

def main():
    """Main entry point for camera streaming script."""
    parser = argparse.ArgumentParser(description='Camera Streaming Script')
    parser.add_argument('--camera-id', type=int, required=True,
                       help='Camera device ID')
    parser.add_argument('--width', type=int, default=320,  # Default reduced
                       help='Frame width (default: 320)')
    parser.add_argument('--height', type=int, default=240,  # Default reduced
                       help='Frame height (default: 240)')
    
    args = parser.parse_args()
    
    try:
        # First verify camera is accessible
        if not verify_camera_access(args.camera_id):
            sys.stderr.write(f"Camera {args.camera_id} is not accessible\n")
            sys.exit(1)

        streamer = CameraStream(args.camera_id, args.width, args.height)
        streamer.stream()
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
