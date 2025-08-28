#!/usr/bin/env python3
"""
Webcam Persistent Stream Script for MonsterBox
Provides a persistent MJPEG stream for webcam streaming service.
"""

import cv2
import sys
import time
import argparse
import logging
import signal
import os
import threading
from typing import Optional

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class WebcamPersistentStream:
    """Handles persistent streaming for webcam service."""
    
    def __init__(self, device_id: int = 0, width: int = 640, height: int = 480, fps: int = 30, quality: int = 85):
        self.device_id = device_id
        self.width = width
        self.height = height
        self.fps = fps
        self.quality = quality
        self.cap = None
        self.running = False
        self.frame_count = 0
        self.start_time = None
        
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self.signal_handler)
        signal.signal(signal.SIGINT, self.signal_handler)
        
    def signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
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
            
            # Set buffer size to reduce latency
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
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
            
            logger.info("Camera initialization successful")
            return True
            
        except Exception as e:
            logger.error(f"Camera initialization error: {e}")
            return False
    
    def cleanup(self):
        """Clean up camera resources."""
        self.running = False
        if self.cap:
            self.cap.release()
            logger.info("Camera resources released")
    
    def start_persistent_stream(self):
        """Start the persistent MJPEG stream."""
        if not self.initialize_camera():
            logger.error("Failed to initialize camera")
            sys.exit(1)
        
        self.running = True
        self.start_time = time.time()
        
        # Write MJPEG headers
        sys.stdout.buffer.write(b'HTTP/1.1 200 OK\r\n')
        sys.stdout.buffer.write(b'Content-Type: multipart/x-mixed-replace; boundary=frame\r\n')
        sys.stdout.buffer.write(b'Cache-Control: no-cache\r\n')
        sys.stdout.buffer.write(b'Connection: keep-alive\r\n')
        sys.stdout.buffer.write(b'\r\n')
        sys.stdout.buffer.flush()
        
        logger.info(f"Starting persistent stream: {self.width}x{self.height} @ {self.fps}fps, quality={self.quality}")
        
        target_frame_time = 1.0 / self.fps
        
        try:
            while self.running:
                frame_start = time.time()
                
                # Capture frame
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    logger.warning("Failed to capture frame, retrying...")
                    time.sleep(0.1)
                    continue
                
                # Resize frame if needed
                if frame.shape[1] != self.width or frame.shape[0] != self.height:
                    frame = cv2.resize(frame, (self.width, self.height))
                
                # Encode frame as JPEG
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, self.quality]
                _, jpeg = cv2.imencode('.jpg', frame, encode_params)
                
                # Write MJPEG frame
                sys.stdout.buffer.write(b'--frame\r\n')
                sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n')
                sys.stdout.buffer.write(f'Content-Length: {len(jpeg)}\r\n\r\n'.encode())
                sys.stdout.buffer.write(jpeg.tobytes())
                sys.stdout.buffer.write(b'\r\n')
                sys.stdout.buffer.flush()
                
                self.frame_count += 1
                
                # Log statistics every 100 frames
                if self.frame_count % 100 == 0:
                    elapsed = time.time() - self.start_time
                    avg_fps = self.frame_count / elapsed
                    logger.info(f"Frames: {self.frame_count}, Avg FPS: {avg_fps:.2f}")
                
                # Frame rate control
                elapsed = time.time() - frame_start
                if elapsed < target_frame_time:
                    time.sleep(target_frame_time - elapsed)
                
        except KeyboardInterrupt:
            logger.info("Stream interrupted by user")
        except BrokenPipeError:
            logger.info("Stream client disconnected")
        except Exception as e:
            logger.error(f"Stream error: {e}")
        finally:
            self.cleanup()
            
        # Final statistics
        if self.start_time:
            total_time = time.time() - self.start_time
            avg_fps = self.frame_count / total_time if total_time > 0 else 0
            logger.info(f"Stream ended. Total frames: {self.frame_count}, Average FPS: {avg_fps:.2f}")

def main():
    """Main function to parse arguments and start streaming."""
    parser = argparse.ArgumentParser(description='MonsterBox Persistent Webcam Stream')
    parser.add_argument('--device-id', type=int, default=0, help='Camera device ID (default: 0)')
    parser.add_argument('--width', type=int, default=640, help='Frame width (default: 640)')
    parser.add_argument('--height', type=int, default=480, help='Frame height (default: 480)')
    parser.add_argument('--fps', type=int, default=30, help='Frames per second (default: 30)')
    parser.add_argument('--quality', type=int, default=85, help='JPEG quality 1-100 (default: 85)')
    parser.add_argument('--persistent', action='store_true', help='Run in persistent mode')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Validate arguments
    if args.device_id < 0:
        logger.error("Device ID must be non-negative")
        sys.exit(1)
    
    if args.width < 320 or args.height < 240:
        logger.error("Minimum resolution is 320x240")
        sys.exit(1)
    
    if args.fps < 1 or args.fps > 60:
        logger.error("FPS must be between 1 and 60")
        sys.exit(1)
    
    if args.quality < 1 or args.quality > 100:
        logger.error("Quality must be between 1 and 100")
        sys.exit(1)
    
    # Create and start stream
    stream = WebcamPersistentStream(
        device_id=args.device_id,
        width=args.width,
        height=args.height,
        fps=args.fps,
        quality=args.quality
    )
    
    logger.info(f"Starting webcam stream: device={args.device_id}, resolution={args.width}x{args.height}, fps={args.fps}, quality={args.quality}")
    
    try:
        stream.start_persistent_stream()
    except Exception as e:
        logger.error(f"Failed to start stream: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
