import numpy as np
import cv2
import busio
import board
from adafruit_servokit import ServoKit
import sys
import datetime

def remap(x, in_min, in_max, out_min, out_max):
    """Map value from one range to another."""
    x_diff = x - in_min
    out_range = out_max - out_min
    in_range = in_max - in_min
    temp_out = x_diff * out_range / in_range + out_min
    
    # Ensure correct order of min/max
    if out_max < out_min:
        out_max, out_min = out_min, out_max
        
    # Clamp output to range
    return max(out_min, min(out_max, temp_out))

class HeadTracker:
    def __init__(self, pca_channel=0):
        self.IN_MIN = 30.0
        self.IN_MAX = 160.0
        self.OUT_MIN = 160.0
        self.OUT_MAX = 30.0
        self.head_angle = 90.0
        self.head_angle_ave = 90.0
        self.head_angle_alpha = 0.25  # Smoothing factor
        
        # Initialize servo controller
        self.kit = ServoKit(channels=16, i2c=busio.I2C(board.SCL, board.SDA))
        self.pca_channel = pca_channel
        self.cap = None

    def setup_camera(self):
        """Initialize the camera with specified resolution."""
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            raise RuntimeError("Failed to open camera")
            
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 160)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 120)
        
        # Verify settings were applied
        actual_width = self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        actual_height = self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        print(f"Camera initialized with resolution: {actual_width}x{actual_height}")

    def track(self):
        """Main tracking loop."""
        if not self.cap:
            raise RuntimeError("Camera not initialized. Call setup_camera() first.")
            
        object_detector = cv2.createBackgroundSubtractorMOG2(history=10, varThreshold=5)
        
        while True:
            ret, frame = self.cap.read()
            if not ret:
                print("Failed to grab frame")
                break
                
            # Use full frame as ROI
            height, width = frame.shape[:2]
            roi = frame[0:height, 0:width]
            
            # Apply background subtraction
            mask = object_detector.apply(roi)
            
            # Find contours
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Find largest contour
            largest_contour = None
            largest_area = 0
            
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 150 and area > largest_area:
                    largest_area = area
                    largest_contour = cnt
            
            if largest_contour is not None:
                x, y, w, h = cv2.boundingRect(largest_contour)
                center_x = x + (w / 2.0)
                
                # Update head angle
                self.head_angle = remap(float(center_x), self.IN_MIN, self.IN_MAX, 
                                      self.OUT_MIN, self.OUT_MAX)
                self.head_angle_ave = (self.head_angle * self.head_angle_alpha + 
                                     self.head_angle_ave * (1.0 - self.head_angle_alpha))
                
                # Update servo position
                self.kit.servo[self.pca_channel].angle = int(self.head_angle_ave)
                
                print(f'x: {center_x:.1f}, head_angle: {self.head_angle:.1f}, '
                      f'average: {self.head_angle_ave:.1f}')

    def stop_tracking(self):
        """Clean up resources."""
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()
        print("Tracking stopped.")

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
        print(f"Error occurred: {str(e)}")
        sys.exit(1)
    finally:
        tracker.stop_tracking()
