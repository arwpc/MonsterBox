#!/usr/bin/env python3

import sys
import logging
import time
import os
import argparse
import signal
import cv2
import numpy as np

# Configure logging to stderr to keep stdout clean for MJPEG stream
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Force V4L2 backend and disable others
os.environ["OPENCV_VIDEOIO_PRIORITY_V4L2"] = "100"
os.environ["OPENCV_VIDEOIO_PRIORITY_GSTREAMER"] = "0"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"

# Global flag for graceful shutdown
running = True

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global running
    logger.info(f"Received signal {signum}, shutting down...")
    running = False

def initialize_camera(device_id, width=1280, height=720, fps=30):
    """Initialize camera with specified settings"""
    try:
        logger.info(f"Initializing camera {device_id} with {width}x{height} @ {fps}fps")
        
        # Create VideoCapture object with V4L2 backend
        cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
        
        if not cap.isOpened():
            logger.error(f"Failed to open camera {device_id}")
            return None
            
        # Set camera properties
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        cap.set(cv2.CAP_PROP_FPS, fps)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))
        
        # Verify settings
        actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = cap.get(cv2.CAP_PROP_FPS)
        
        logger.info(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")
        
        return cap
        
    except Exception as e:
        logger.error(f"Error initializing camera: {e}")
        return None

def stream_mjpeg(cap):
    """Stream MJPEG frames to stdout"""
    global running

    logger.info("Starting MJPEG stream...")

    # Output initialization success message to stdout (expected by MonsterBox)
    print('{"success": true, "message": "Camera stream initialized"}', flush=True)

    # MJPEG boundary
    boundary = "frame"

    frame_count = 0
    start_time = time.time()

    try:
        while running:
            ret, frame = cap.read()
            
            if not ret:
                logger.warning("Failed to read frame from camera")
                time.sleep(0.1)
                continue
                
            # Encode frame as JPEG
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
            result, encoded_img = cv2.imencode('.jpg', frame, encode_param)
            
            if not result:
                logger.warning("Failed to encode frame")
                continue
                
            # Convert to bytes
            frame_bytes = encoded_img.tobytes()
            
            # Write MJPEG frame to stdout
            sys.stdout.buffer.write(b'--' + boundary.encode() + b'\r\n')
            sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n')
            sys.stdout.buffer.write(f'Content-Length: {len(frame_bytes)}\r\n\r\n'.encode())
            sys.stdout.buffer.write(frame_bytes)
            sys.stdout.buffer.write(b'\r\n')
            sys.stdout.buffer.flush()
            
            frame_count += 1
            
            # Log stats every 100 frames
            if frame_count % 100 == 0:
                elapsed = time.time() - start_time
                fps = frame_count / elapsed
                logger.info(f"Streamed {frame_count} frames, avg FPS: {fps:.2f}")
                
    except BrokenPipeError:
        logger.info("Client disconnected (broken pipe)")
    except KeyboardInterrupt:
        logger.info("Stream interrupted by user")
    except Exception as e:
        logger.error(f"Error during streaming: {e}")
    finally:
        logger.info(f"Stream ended. Total frames: {frame_count}")

def main():
    global running
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    parser = argparse.ArgumentParser(description='Camera MJPEG Streaming')
    parser.add_argument('--camera-id', type=int, default=0, help='Camera device ID')
    parser.add_argument('--width', type=int, default=1280, help='Frame width')
    parser.add_argument('--height', type=int, default=720, help='Frame height')
    parser.add_argument('--fps', type=int, default=30, help='Frames per second')
    
    args = parser.parse_args()
    
    try:
        # Initialize camera
        cap = initialize_camera(args.camera_id, args.width, args.height, args.fps)
        
        if cap is None:
            logger.error("Failed to initialize camera")
            sys.exit(1)
            
        # Start streaming
        stream_mjpeg(cap)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)
    finally:
        # Cleanup
        if 'cap' in locals() and cap is not None:
            cap.release()
            logger.info("Camera released")

if __name__ == "__main__":
    main()
