#!/usr/bin/env python3
"""
Motion tracking implementation using OpenCV
Detects motion and calculates center points for future servo control
"""

import cv2
import numpy as np
import json
import time
import argparse
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MotionTracker:
    def __init__(self, device_id=0, sensitivity=50, min_area=500):
        """
        Initialize motion tracker
        
        Args:
            device_id: Camera device ID
            sensitivity: Motion detection sensitivity (0-100)
            min_area: Minimum contour area to consider as motion
        """
        self.device_id = device_id
        self.sensitivity = sensitivity
        self.min_area = min_area
        self.cap = None
        self.background_subtractor = None
        self.motion_data = {
            'enabled': False,
            'last_motion': None,
            'motion_center': None,
            'motion_area': 0,
            'frame_count': 0
        }
        
    def initialize(self):
        """Initialize camera and background subtractor"""
        try:
            # Initialize camera
            self.cap = cv2.VideoCapture(self.device_id)
            if not self.cap.isOpened():
                raise Exception(f"Cannot open camera {self.device_id}")
            
            # Set camera properties for better performance
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 15)
            
            # Initialize background subtractor
            self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
                detectShadows=True,
                varThreshold=self.sensitivity
            )
            
            logger.info(f"Motion tracker initialized for device {self.device_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize motion tracker: {e}")
            return False
    
    def detect_motion(self, frame):
        """
        Detect motion in frame and return motion data
        
        Args:
            frame: Input frame from camera
            
        Returns:
            dict: Motion detection results
        """
        if self.background_subtractor is None:
            return None
        
        # Apply background subtraction
        fg_mask = self.background_subtractor.apply(frame)
        
        # Remove noise
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        motion_detected = False
        motion_center = None
        total_area = 0
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > self.min_area:
                motion_detected = True
                total_area += area
                
                # Calculate center of motion
                M = cv2.moments(contour)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    
                    if motion_center is None:
                        motion_center = [cx, cy]
                    else:
                        # Average multiple motion centers
                        motion_center[0] = (motion_center[0] + cx) // 2
                        motion_center[1] = (motion_center[1] + cy) // 2
        
        # Update motion data
        if motion_detected:
            self.motion_data.update({
                'last_motion': datetime.now().isoformat(),
                'motion_center': motion_center,
                'motion_area': total_area,
                'frame_count': self.motion_data['frame_count'] + 1
            })
        
        return {
            'motion_detected': motion_detected,
            'motion_center': motion_center,
            'motion_area': total_area,
            'frame_shape': frame.shape[:2]  # height, width
        }
    
    def get_motion_data(self):
        """Get current motion tracking data"""
        return self.motion_data.copy()
    
    def set_sensitivity(self, sensitivity):
        """Update motion detection sensitivity"""
        self.sensitivity = max(0, min(100, sensitivity))
        if self.background_subtractor:
            self.background_subtractor.setVarThreshold(self.sensitivity)
    
    def cleanup(self):
        """Clean up resources"""
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()

def main():
    """Test motion tracking functionality"""
    parser = argparse.ArgumentParser(description='Motion Tracker Test')
    parser.add_argument('--device', type=int, default=0, help='Camera device ID')
    parser.add_argument('--sensitivity', type=int, default=50, help='Motion sensitivity (0-100)')
    parser.add_argument('--duration', type=int, default=30, help='Test duration in seconds')
    args = parser.parse_args()
    
    tracker = MotionTracker(device_id=args.device, sensitivity=args.sensitivity)
    
    if not tracker.initialize():
        logger.error("Failed to initialize motion tracker")
        return
    
    logger.info(f"Starting motion tracking test for {args.duration} seconds...")
    start_time = time.time()
    
    try:
        while time.time() - start_time < args.duration:
            ret, frame = tracker.cap.read()
            if not ret:
                logger.error("Failed to read frame")
                break
            
            # Detect motion
            motion_result = tracker.detect_motion(frame)
            
            if motion_result and motion_result['motion_detected']:
                center = motion_result['motion_center']
                area = motion_result['motion_area']
                logger.info(f"Motion detected at ({center[0]}, {center[1]}) with area {area}")
            
            time.sleep(0.1)  # Limit processing rate
            
    except KeyboardInterrupt:
        logger.info("Motion tracking stopped by user")
    
    finally:
        tracker.cleanup()
        logger.info("Motion tracking test completed")

if __name__ == "__main__":
    main()
