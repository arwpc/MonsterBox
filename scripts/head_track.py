#!/usr/bin/env python3

import sys
import cv2
import numpy as np
import argparse
import logging
import time
import os
import fcntl
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Force V4L2 backend before importing OpenCV
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_GSTREAMER"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"
os.environ["OPENCV_VIDEOIO_BACKEND"] = "v4l2"

def initialize_camera(device_id: int, width: int = 320, height: int = 240) -> Optional[cv2.VideoCapture]:
    """Initialize camera with MJPG format first, fallback to others if needed."""
    try:
        # Add delay before opening camera
        time.sleep(0.5)
        
        # Try MJPG format first as it's most likely to work
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        if not cap.isOpened():
            return None

        # Try MJPG first
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        cap.set(cv2.CAP_PROP_FOURCC, fourcc)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_FPS, 15)

        ret, frame = cap.read()
        if ret and frame is not None and frame.size > 0:
            logger.info("Successfully initialized camera with MJPG format")
            return cap

        # If MJPG fails, try other formats
        for fmt in ['YUYV', 'H264']:
            cap.release()
            time.sleep(0.5)  # Add delay between format attempts
            
            cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
            if not cap.isOpened():
                continue

            fourcc = cv2.VideoWriter_fourcc(*fmt)
            cap.set(cv2.CAP_PROP_FOURCC, fourcc)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_FPS, 15)

            ret, frame = cap.read()
            if ret and frame is not None and frame.size > 0:
                logger.info(f"Successfully initialized camera with {fmt} format")
                return cap

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
            time.sleep(0.5)

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
                time.sleep(0.5)
        except Exception:
            pass

class HeadTracker:
    """Handles head tracking and servo control."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap = None
        self.camera_lock = CameraLock(self.camera_id)
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        self.prev_center_x = None
        self.prev_center_y = None

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

    def track_head(self, servo_id: int):
        """Track head movement and control servo."""
        if not self.initialize():
            logger.error("Failed to initialize camera")
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

                # Convert to grayscale for face detection
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(
                    gray, 
                    scaleFactor=1.1, 
                    minNeighbors=5,
                    minSize=(30, 30)
                )

                # Process detected faces
                if len(faces) > 0:
                    # Get the largest face
                    largest_face = max(faces, key=lambda x: x[2] * x[3])
                    x, y, w, h = largest_face
                    
                    # Calculate face center
                    center_x = x + w//2
                    center_y = y + h//2
                    
                    # Draw face rectangle with glow effect
                    cv2.rectangle(frame, (x-2, y-2), (x+w+2, y+h+2), (0, 255, 0), 4)
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 255, 255), 2)
                    
                    # Draw crosshair on face
                    cv2.line(frame, (center_x-15, center_y), (center_x+15, center_y), 
                            (0, 255, 0), 3)
                    cv2.line(frame, (center_x, center_y-15), (center_x, center_y+15), 
                            (0, 255, 0), 3)
                    cv2.line(frame, (center_x-10, center_y), (center_x+10, center_y), 
                            (255, 255, 255), 1)
                    cv2.line(frame, (center_x, center_y-10), (center_x, center_y+10), 
                            (255, 255, 255), 1)
                    
                    # Calculate normalized position (0-100)
                    norm_x = (center_x / frame.shape[1]) * 100
                    norm_y = (center_y / frame.shape[0]) * 100
                    
                    # Draw tracking info
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    tracking_text = f"Face Detected: ({int(norm_x)}, {int(norm_y)})"
                    cv2.putText(frame, tracking_text, (5, 20), font, 
                               0.5, (0, 255, 0), 2)
                    cv2.putText(frame, tracking_text, (5, 20), font, 
                               0.5, (255, 255, 255), 1)
                    
                    # TODO: Add servo control logic here using norm_x and norm_y
                    
                    self.prev_center_x = center_x
                    self.prev_center_y = center_y
                else:
                    # Draw "No Face Detected" message
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    cv2.putText(frame, "No Face Detected", (5, 20), font, 
                               0.5, (0, 255, 0), 2)
                    cv2.putText(frame, "No Face Detected", (5, 20), font, 
                               0.5, (255, 255, 255), 1)

                # Add timestamp
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                           0.5, (0, 255, 0), 2)
                cv2.putText(frame, timestamp, (5, frame.shape[0]-5), font, 
                           0.5, (255, 255, 255), 1)

                # Display frame
                cv2.imshow('Head Tracking', frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

                # Frame rate control
                frame_count += 1
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < target_frame_time:
                    time.sleep(target_frame_time - elapsed)
                last_frame_time = time.time()

        except Exception as e:
            logger.error(f"Head tracking error: {e}")
        finally:
            self.release()
            cv2.destroyAllWindows()

def main():
    """Main entry point for head tracking script."""
    parser = argparse.ArgumentParser(description='Head Tracking Script')
    parser.add_argument('command', choices=['start', 'stop'],
                       help='Command to execute')
    parser.add_argument('servo_id', type=int,
                       help='Servo ID for head tracking')
    
    args = parser.parse_args()
    
    try:
        if args.command == 'start':
            tracker = HeadTracker()
            tracker.track_head(args.servo_id)
        elif args.command == 'stop':
            # Stop command handled by parent process
            pass
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
