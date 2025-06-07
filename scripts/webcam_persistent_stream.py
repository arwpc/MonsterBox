#!/usr/bin/env python3
"""
Persistent Webcam Stream Script for MonsterBox
Provides continuous MJPEG streaming with automatic recovery and monitoring.
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

class PersistentWebcamStream:
    """Handles persistent webcam streaming with automatic recovery."""
    
    def __init__(self, device_id: int = 0, width: int = 640, height: int = 480, 
                 fps: int = 30, quality: int = 85, persistent: bool = True):
        self.device_id = device_id
        self.width = width
        self.height = height
        self.fps = fps
        self.quality = quality
        self.persistent = persistent
        self.cap = None
        self.running = False
        self.error_count = 0
        self.max_errors = 10
        self.recovery_delay = 2.0
        self.frame_count = 0
        self.last_frame_time = 0
        self.heartbeat_interval = 5.0
        self.last_heartbeat = time.time()
        
    def initialize_camera(self) -> bool:
        """Initialize camera with optimized settings."""
        try:
            # Verify device exists
            device_path = f"/dev/video{self.device_id}"
            if not os.path.exists(device_path):
                logger.error(f"Camera device {device_path} does not exist")
                return False
            
            # Release any existing camera
            if self.cap:
                self.cap.release()
                time.sleep(1.0)
            
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
            self.error_count = 0
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
    
    def recover_camera(self) -> bool:
        """Attempt to recover camera after error."""
        logger.info("Attempting camera recovery...")
        self.cleanup()
        time.sleep(self.recovery_delay)
        return self.initialize_camera()
    
    def send_heartbeat(self):
        """Send heartbeat signal to indicate stream is alive."""
        current_time = time.time()
        if current_time - self.last_heartbeat >= self.heartbeat_interval:
            # Send heartbeat as a comment in MJPEG stream
            try:
                heartbeat_msg = f"# HEARTBEAT {current_time} frames={self.frame_count}\r\n"
                sys.stdout.buffer.write(heartbeat_msg.encode())
                sys.stdout.buffer.flush()
                self.last_heartbeat = current_time
            except Exception as e:
                logger.debug(f"Heartbeat error: {e}")
    
    def stream(self):
        """Start the persistent stream."""
        if not self.initialize_camera():
            logger.error("Failed to initialize camera")
            return False
        
        self.running = True
        target_frame_time = 1.0 / self.fps
        
        logger.info(f"Starting persistent stream: {self.width}x{self.height} @ {self.fps}fps")
        
        # Start heartbeat thread
        if self.persistent:
            heartbeat_thread = threading.Thread(target=self.heartbeat_worker, daemon=True)
            heartbeat_thread.start()
        
        try:
            while self.running:
                frame_start = time.time()
                
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    self.error_count += 1
                    logger.warning(f"Frame capture failed (error {self.error_count}/{self.max_errors})")
                    
                    if self.error_count >= self.max_errors:
                        if self.persistent:
                            logger.info("Max errors reached, attempting recovery...")
                            if self.recover_camera():
                                continue
                            else:
                                logger.error("Camera recovery failed")
                                break
                        else:
                            logger.error("Max errors reached, stopping stream")
                            break
                    
                    time.sleep(0.1)
                    continue
                
                # Reset error count on successful frame
                if self.error_count > 0:
                    self.error_count = 0
                    logger.info("Frame capture recovered")
                
                # Add stream information overlay
                if self.persistent:
                    cv2.putText(frame, f"PERSISTENT STREAM - Frame {self.frame_count}", 
                               (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    cv2.putText(frame, f"Device: /dev/video{self.device_id}", 
                               (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
                    cv2.putText(frame, f"Resolution: {self.width}x{self.height}", 
                               (10, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
                    cv2.putText(frame, f"FPS: {self.fps}", 
                               (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
                    
                    # Add timestamp
                    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                    cv2.putText(frame, timestamp, 
                               (10, frame.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
                
                # Encode frame as JPEG
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, self.quality]
                _, jpeg = cv2.imencode('.jpg', frame, encode_params)
                
                # Write MJPEG frame
                try:
                    sys.stdout.buffer.write(b'--frame\r\n')
                    sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
                    sys.stdout.buffer.write(jpeg.tobytes())
                    sys.stdout.buffer.write(b'\r\n')
                    sys.stdout.buffer.flush()
                except BrokenPipeError:
                    logger.info("Client disconnected")
                    if not self.persistent:
                        break
                except Exception as e:
                    logger.error(f"Stream output error: {e}")
                    if not self.persistent:
                        break
                
                self.frame_count += 1
                self.last_frame_time = time.time()
                
                # Frame rate control
                elapsed = time.time() - frame_start
                if elapsed < target_frame_time:
                    time.sleep(target_frame_time - elapsed)
                
        except KeyboardInterrupt:
            logger.info("Stream interrupted by user")
        except Exception as e:
            logger.error(f"Stream error: {e}")
        finally:
            self.cleanup()
        
        logger.info(f"Stream completed. Total frames: {self.frame_count}")
        return True
    
    def heartbeat_worker(self):
        """Worker thread for sending heartbeats."""
        while self.running:
            try:
                self.send_heartbeat()
                time.sleep(1.0)
            except Exception as e:
                logger.debug(f"Heartbeat worker error: {e}")
                break

def signal_handler(signum, frame):
    """Handle shutdown signals."""
    logger.info(f"Received signal {signum}, shutting down...")
    sys.exit(0)

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='MonsterBox Persistent Webcam Stream')
    parser.add_argument('--device-id', type=int, default=0, help='Camera device ID')
    parser.add_argument('--width', type=int, default=640, help='Frame width')
    parser.add_argument('--height', type=int, default=480, help='Frame height')
    parser.add_argument('--fps', type=int, default=30, help='Frames per second')
    parser.add_argument('--quality', type=int, default=85, help='JPEG quality (1-100)')
    parser.add_argument('--persistent', action='store_true', help='Enable persistent mode with auto-recovery')
    
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
    
    if args.quality < 1 or args.quality > 100:
        logger.error("Quality must be between 1 and 100")
        sys.exit(1)
    
    # Create and start persistent stream
    try:
        stream = PersistentWebcamStream(
            device_id=args.device_id,
            width=args.width,
            height=args.height,
            fps=args.fps,
            quality=args.quality,
            persistent=args.persistent
        )
        
        success = stream.stream()
        sys.exit(0 if success else 1)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
