#!/usr/bin/env python3

import sys
import cv2
import argparse
import logging
import time
import os
import subprocess
from typing import Optional, List

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

class HeadTracker:
    """Handles head tracking and servo control."""
    
    def __init__(self, camera_id: int = 0, width: int = 320, height: int = 240):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
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
            time.sleep(0.1)  # Add delay after release
        except Exception as e:
            logger.warning(f"Error releasing camera: {e}")

    def track_head(self, servo_id: int):
        """Track head movement and control servo."""
        if not self.initialize():
            logger.error("Failed to initialize camera")
            return

        try:
            while True:
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    break

                # Resize frame if necessary
                actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                if actual_width != self.width or actual_height != self.height:
                    frame = cv2.resize(frame, (self.width, self.height))

                # TODO: Add head tracking logic here
                # For now, just display the frame
                cv2.imshow('Head Tracking', frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

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
            # TODO: Implement stop command
            pass
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
