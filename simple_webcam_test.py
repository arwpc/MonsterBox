#!/usr/bin/env python3
"""
Simple webcam test for RPI4b
"""
import cv2
import sys

def test_camera():
    print("Testing camera access...")
    
    try:
        # Test camera opening
        cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
        
        if not cap.isOpened():
            print("FAIL: Could not open camera")
            return False
        
        print("SUCCESS: Camera opened")
        
        # Test frame capture
        ret, frame = cap.read()
        
        if not ret or frame is None:
            print("FAIL: Could not capture frame")
            cap.release()
            return False
        
        print(f"SUCCESS: Frame captured - {frame.shape}")
        
        # Get camera properties
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        
        print(f"Camera properties: {width}x{height} @ {fps}fps")
        
        cap.release()
        print("SUCCESS: All camera tests passed")
        return True
        
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    success = test_camera()
    sys.exit(0 if success else 1)
