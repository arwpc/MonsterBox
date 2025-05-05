#!/usr/bin/env python3

import sys
import cv2
import numpy as np
import argparse
import logging
import time
import os
import json
import subprocess
from typing import Optional, Dict, Any
from camera_lock import CameraLock

# Configure logging - only show errors by default
logging.basicConfig(
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
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
        time.sleep(0.5)
        
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
            return cap

        # If MJPG fails, try other formats
        for fmt in ['YUYV', 'H264']:
            cap.release()
            time.sleep(0.5)
            
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
                return cap

        return None

    except Exception as e:
        logger.error(f"Camera initialization error: {e}")
        return None

def move_servo(servo_id: str, angle: float, duration: float = 0.5) -> bool:
    """Control servo movement using servo_control.py."""
    try:
        # Get servo configuration
        with open('data/parts.json', 'r') as f:
            parts = json.load(f)
            servo = next((part for part in parts if str(part['id']) == str(servo_id)), None)
            if not servo:
                logger.error(f"Servo {servo_id} not found")
                return False

        # Prepare servo control command
        script_path = os.path.join('scripts', 'servo_control.py')
        control_type = 'pca9685' if servo.get('usePCA9685', False) else 'gpio'
        pin_or_channel = str(servo.get('channel' if control_type == 'pca9685' else 'pin', 0))
        
        # Redirect stderr to suppress debug output
        with open(os.devnull, 'w') as devnull:
            command = [
                'python3',
                script_path,
                'test',
                control_type,
                pin_or_channel,
                str(angle),
                str(duration),
                servo.get('servoType', 'Standard'),
                str(servo_id)
            ]
            
            result = subprocess.run(command, capture_output=True, text=True, stderr=devnull)
        
        return result.returncode == 0

    except Exception as e:
        logger.error(f"Error controlling servo: {e}")
        return False

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
        self.servo_angle = 90  # Current servo angle
        self.min_angle = 0
        self.max_angle = 180
        self.angle_threshold = 5  # Minimum angle change to move servo
        self.running = True

    def initialize(self) -> bool:
        """Initialize camera with specified settings."""
        if not self.camera_lock.acquire():
            return False

        self.cap = initialize_camera(self.camera_id, self.width, self.height)
        if not self.cap:
            self.camera_lock.release()
            return False
        return True

    def release(self):
        """Release camera resources."""
        try:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.camera_lock.release()
        except Exception as e:
            logger.error(f"Error releasing camera: {e}")

    def calculate_servo_angle(self, face_x: float) -> float:
        """Calculate servo angle based on face position."""
        x_adjustment = (face_x - 50) * 0.9
        new_angle = max(self.min_angle, min(self.max_angle, self.servo_angle - x_adjustment))
        return new_angle if abs(new_angle - self.servo_angle) > self.angle_threshold else self.servo_angle

    def track_head(self, servo_id: str):
        """Track head movement and control servo."""
        if not self.initialize():
            print(json.dumps({
                "success": False,
                "error": "Failed to initialize camera"
            }))
            sys.stdout.flush()
            return

        try:
            frame_count = 0
            last_frame_time = time.time()
            target_frame_time = 1.0 / 15  # Target 15 FPS

            # Warm up the camera
            for _ in range(5):
                ret, _ = self.cap.read()
                if ret:
                    break
                time.sleep(1.0)

            # Print initialization success
            print(json.dumps({
                "success": True,
                "message": "Head tracking initialized",
                "servo_angle": self.servo_angle
            }))
            sys.stdout.flush()

            while self.running:
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    break

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
                    
                    # Calculate normalized position (0-100)
                    norm_x = (center_x / frame.shape[1]) * 100
                    
                    # Calculate new servo angle
                    new_angle = self.calculate_servo_angle(norm_x)
                    
                    # Move servo if significant change
                    if new_angle != self.servo_angle:
                        if move_servo(servo_id, new_angle):
                            self.servo_angle = new_angle
                    
                    # Send tracking data
                    print(json.dumps({
                        "success": True,
                        "face_detected": True,
                        "position": {
                            "x": norm_x
                        },
                        "servo_angle": self.servo_angle
                    }))
                    sys.stdout.flush()
                else:
                    # Send no face detected status
                    print(json.dumps({
                        "success": True,
                        "face_detected": False,
                        "servo_angle": self.servo_angle
                    }))
                    sys.stdout.flush()

                # Frame rate control
                frame_count += 1
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < target_frame_time:
                    time.sleep(target_frame_time - elapsed)
                last_frame_time = time.time()

        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": str(e)
            }))
            sys.stdout.flush()
        finally:
            self.release()

    def stop(self):
        """Stop head tracking."""
        self.running = False

def main():
    """Main entry point for head tracking script."""
    parser = argparse.ArgumentParser(description='Head Tracking Script')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    parser.add_argument('--servo-id', type=str, required=True,
                       help='ID of the servo')
    parser.add_argument('--width', type=int, default=320,
                       help='Frame width (default: 320)')
    parser.add_argument('--height', type=int, default=240,
                       help='Frame height (default: 240)')
    
    args = parser.parse_args()
    
    try:
        tracker = HeadTracker(args.camera_id, args.width, args.height)
        tracker.track_head(args.servo_id)
    except KeyboardInterrupt:
        if 'tracker' in locals():
            tracker.stop()
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
