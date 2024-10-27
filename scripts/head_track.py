#!/usr/bin/env python3

import sys
import time
import logging
import os
import fcntl
import errno
import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import required libraries
try:
    import numpy as np
    import cv2
    import busio
    import board
    from adafruit_servokit import ServoKit
except ImportError as e:
    logger.error(f"Failed to import required libraries: {e}")
    sys.exit(1)

def remap(x, in_min, in_max, out_min, out_max):
    """Map value from one range to another with bounds checking."""
    try:
        x_diff = float(x - in_min)
        out_range = float(out_max - out_min)
        in_range = float(in_max - in_min)
        if in_range == 0:
            return out_min
        temp_out = x_diff * out_range / in_range + out_min
        
        # Ensure output is within bounds
        return max(min(out_max, out_min), min(max(out_max, out_min), temp_out))
    except Exception:
        return (out_max + out_min) / 2  # Return center position if calculation fails

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_path="/dev/video0"):
        self.device_path = device_path
        self.lock_path = f"/tmp/camera_{os.path.basename(device_path)}.lock"
        self.lock_file = None

    def acquire(self) -> bool:
        """Acquire lock on camera device."""
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

class HeadTracker:
    def __init__(self, pca_channel=0):
        # Reduced servo range for safety
        self.IN_MIN = 40.0
        self.IN_MAX = 150.0
        self.OUT_MIN = 150.0
        self.OUT_MAX = 40.0
        
        # More aggressive smoothing
        self.head_angle = 90.0
        self.head_angle_ave = 90.0
        self.head_angle_alpha = 0.1  # Reduced from 0.25 for smoother movement
        
        # Minimum change threshold to prevent tiny adjustments
        self.min_angle_change = 2.0
        
        # Rate limiting
        self.last_servo_update = time.time()
        self.min_update_interval = 0.05  # Maximum 20 updates per second
        
        # Initialize servo
        try:
            self.kit = ServoKit(channels=16, i2c=busio.I2C(board.SCL, board.SDA))
            self.pca_channel = pca_channel
            
            # Configure servo with reduced range
            self.kit.servo[self.pca_channel].set_pulse_width_range(1000, 2000)  # Microseconds
            self.kit.servo[self.pca_channel].actuation_range = 180
            
            # Move to center position slowly
            self.smooth_move_to(90)
            
        except Exception as e:
            raise RuntimeError(f"Failed to initialize servo: {str(e)}")
            
        self.cap = None
        self.running = False
        self.camera_lock = CameraLock()

    def smooth_move_to(self, target_angle, steps=10):
        """Gradually move servo to position."""
        start_angle = self.head_angle_ave
        for i in range(steps):
            angle = start_angle + (target_angle - start_angle) * (i + 1) / steps
            self.kit.servo[self.pca_channel].angle = int(angle)
            time.sleep(0.05)

    def setup_camera(self):
        """Initialize the camera with specified resolution."""
        if not self.camera_lock.acquire():
            raise RuntimeError("Camera is currently in use by another process")

        try:
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                raise RuntimeError("Failed to open camera")
                
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 160)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 120)
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            time.sleep(2)  # Allow camera to stabilize
        except Exception as e:
            self.release_camera()
            raise RuntimeError(f"Failed to setup camera: {str(e)}")

    def update_servo(self, new_angle):
        """Safely update servo position with rate limiting."""
        current_time = time.time()
        
        # Check if enough time has passed since last update
        if current_time - self.last_servo_update < self.min_update_interval:
            return

        # Check if change is significant enough
        if abs(new_angle - self.head_angle_ave) < self.min_angle_change:
            return

        try:
            # Ensure angle is within safe bounds
            clamped_angle = max(self.OUT_MAX, min(self.OUT_MIN, new_angle))
            self.kit.servo[self.pca_channel].angle = int(clamped_angle)
            self.last_servo_update = current_time
        except Exception as e:
            logger.error(f"Servo update failed: {str(e)}")

    def track(self):
        """Main tracking loop."""
        if not self.cap:
            raise RuntimeError("Camera not initialized. Call setup_camera() first.")
            
        object_detector = cv2.createBackgroundSubtractorMOG2(history=100, varThreshold=10)
        self.running = True
        
        try:
            while self.running:
                ret, frame = self.cap.read()
                if not ret:
                    logger.error("Failed to grab frame")
                    break
                    
                # Use full frame as ROI
                height, width = frame.shape[:2]
                roi = frame[0:height, 0:width]
                
                # Apply background subtraction
                mask = object_detector.apply(roi)
                
                # Add some noise reduction
                mask = cv2.erode(mask, None, iterations=2)
                mask = cv2.dilate(mask, None, iterations=2)
                
                # Find contours
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                # Find largest contour
                largest_contour = None
                largest_area = 0
                
                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if area > 200 and area > largest_area:  # Increased minimum area
                        largest_area = area
                        largest_contour = cnt
                
                if largest_contour is not None:
                    x, y, w, h = cv2.boundingRect(largest_contour)
                    center_x = x + (w / 2.0)
                    
                    # Update head angle with more smoothing
                    new_angle = remap(float(center_x), self.IN_MIN, self.IN_MAX, 
                                    self.OUT_MIN, self.OUT_MAX)
                    
                    # Double smoothing for extra stability
                    self.head_angle = (new_angle * self.head_angle_alpha + 
                                     self.head_angle * (1.0 - self.head_angle_alpha))
                    self.head_angle_ave = (self.head_angle * self.head_angle_alpha + 
                                         self.head_angle_ave * (1.0 - self.head_angle_alpha))
                    
                    # Update servo with safety checks
                    self.update_servo(self.head_angle_ave)
                    
                    logger.info(f'x: {center_x:.1f}, angle: {self.head_angle_ave:.1f}')
                
                # Add a small delay to prevent CPU overload
                time.sleep(0.01)
                
        except KeyboardInterrupt:
            logger.info("\nTracking stopped by user")
        except Exception as e:
            logger.error(f"Tracking error: {str(e)}")
        finally:
            self.running = False

    def release_camera(self):
        """Release camera resources."""
        if self.cap:
            self.cap.release()
            self.cap = None
        self.camera_lock.release()

    def stop_tracking(self):
        """Clean up resources."""
        self.running = False
        self.release_camera()
        cv2.destroyAllWindows()
        
        # Return to center position smoothly
        try:
            self.smooth_move_to(90)
        except Exception:
            pass
            
        logger.info("Tracking stopped.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python head_track.py <command> [pca_channel]")
        sys.exit(1)

    command = sys.argv[1]
    pca_channel = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    
    tracker = HeadTracker(pca_channel)
    
    try:
        if command == "start":
            tracker.setup_camera()
            tracker.track()
        elif command == "stop":
            tracker.stop_tracking()
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Error occurred: {str(e)}")
        sys.exit(1)
    finally:
        tracker.stop_tracking()
