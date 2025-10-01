#!/usr/bin/env python3
"""
Webcam Test Stream Script for MonsterBox
Provides a temporary test stream for webcam configuration and validation.
"""

import cv2
import sys
import time
import argparse
import logging
import signal
import os
from typing import Optional

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class WebcamTestStream:
    """Handles test streaming for webcam configuration."""
    
    def __init__(self, device_id: int = 0, width: int = 640, height: int = 480, fps: int = 30, duration: int = 30):
        self.device_id = device_id
        self.width = width
        self.height = height
        self.fps = fps
        self.duration = duration
        self.cap = None
        self.running = False
        
    def initialize_camera(self) -> bool:
        """Initialize camera with specified settings."""
        try:
            # Verify device exists
            device_path = f"/dev/video{self.device_id}"
            if not os.path.exists(device_path):
                logger.error(f"Camera device {device_path} does not exist")
                return False
            
            # Open camera with V4L2 backend
            logger.info(f"Opening camera {self.device_id} with V4L2 backend")
            self.cap = cv2.VideoCapture(self.device_id, cv2.CAP_V4L2)
            
            if not self.cap.isOpened():
                logger.error("Failed to open camera")
                return False
            
            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_FPS, self.fps)
            
            # Verify settings
            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))
            
            logger.info(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")
            
            # Test frame capture
            ret, frame = self.cap.read()
            if not ret or frame is None:
                logger.error("Failed to capture test frame")
                return False
            
            logger.info("Camera test successful")
            return True
            
        except Exception as e:
            logger.error(f"Camera initialization error: {e}")
            return False
    
    def cleanup(self):
        """Clean up camera resources."""
        if self.cap:
            try:
                self.cap.release()
                logger.info("Camera released")
            except Exception as e:
                logger.error(f"Error releasing camera: {e}")
        self.running = False
    
    def stream(self):
        """Start the test stream."""
        if not self.initialize_camera():
            return False
        
        self.running = True
        start_time = time.time()
        frame_count = 0
        target_frame_time = 1.0 / self.fps
        
        logger.info(f"Starting test stream for {self.duration} seconds")
        
        try:
            while self.running and (time.time() - start_time) < self.duration:
                frame_start = time.time()
                
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    logger.error("Failed to capture frame")
                    break
                
                # Add test overlay
                cv2.putText(frame, f"TEST STREAM - Frame {frame_count}", 
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(frame, f"Device: /dev/video{self.device_id}", 
                           (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                cv2.putText(frame, f"Resolution: {self.width}x{self.height}", 
                           (10, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                cv2.putText(frame, f"FPS: {self.fps}", 
                           (10, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
                # Encode frame as JPEG
                _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                
                # Write MJPEG frame
                sys.stdout.buffer.write(b'--frame\r\n')
                sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
                sys.stdout.buffer.write(jpeg.tobytes())
                sys.stdout.buffer.write(b'\r\n')
                sys.stdout.buffer.flush()
                
                frame_count += 1
                
                # Frame rate control
                elapsed = time.time() - frame_start
                if elapsed < target_frame_time:
                    time.sleep(target_frame_time - elapsed)
                
        except KeyboardInterrupt:
            logger.info("Test stream interrupted by user")
        except BrokenPipeError:
            logger.info("Test stream client disconnected")
        except Exception as e:
            logger.error(f"Test stream error: {e}")
        finally:
            self.cleanup()
        
        logger.info(f"Test stream completed. Frames streamed: {frame_count}")
        return True

def signal_handler(signum, frame):
    """Handle shutdown signals."""
    logger.info(f"Received signal {signum}, shutting down...")
    sys.exit(0)

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='MonsterBox Webcam Test Stream')
    parser.add_argument('--device-id', type=int, default=0, help='Camera device ID')
    parser.add_argument('--width', type=int, default=640, help='Frame width')
    parser.add_argument('--height', type=int, default=480, help='Frame height')
    parser.add_argument('--fps', type=int, default=30, help='Frames per second')
    parser.add_argument('--duration', type=int, default=30, help='Test duration in seconds')
    
    args = parser.parse_args()
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Validate arguments
    if args.device_id < 0 or args.device_id > 9:
        logger.error("Device ID must be between 0 and 9")
        sys.exit(1)
    
    if args.width < 320 or args.height < 240:
        logger.error("Minimum resolution is 320x240")
        sys.exit(1)
    
    if args.fps < 1 or args.fps > 60:
        logger.error("FPS must be between 1 and 60")
        sys.exit(1)
    
    if args.duration < 1 or args.duration > 300:
        logger.error("Duration must be between 1 and 300 seconds")
        sys.exit(1)
    
    # Create and start test stream
    try:
        stream = WebcamTestStream(
            device_id=args.device_id,
            width=args.width,
            height=args.height,
            fps=args.fps,
            duration=args.duration
        )
        
        success = stream.stream()
        sys.exit(0 if success else 1)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
