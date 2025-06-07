#!/usr/bin/env python3
"""
Test OpenCV installation and motion tracking capabilities
"""

import cv2
import sys

def test_opencv_installation():
    """Test basic OpenCV functionality"""
    print(f"OpenCV version: {cv2.__version__}")
    
    # Test background subtractor availability
    try:
        mog2 = cv2.createBackgroundSubtractorMOG2()
        print("✅ MOG2 background subtractor available")
    except Exception as e:
        print(f"❌ MOG2 not available: {e}")
    
    try:
        knn = cv2.createBackgroundSubtractorKNN()
        print("✅ KNN background subtractor available")
    except Exception as e:
        print(f"❌ KNN not available: {e}")
    
    # Test video capture
    try:
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            print("✅ Camera access working")
            ret, frame = cap.read()
            if ret:
                print(f"✅ Frame capture working - Shape: {frame.shape}")
            else:
                print("❌ Frame capture failed")
            cap.release()
        else:
            print("❌ Camera access failed")
    except Exception as e:
        print(f"❌ Camera test failed: {e}")

if __name__ == "__main__":
    test_opencv_installation()
