#!/usr/bin/env python3

import sys
import logging
import time
import os
import argparse
import signal
import cv2
import numpy as np
import json
import requests
from typing import Optional, Dict, Any

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

def check_motion_tracking_active(character_id: int) -> bool:
    """Check if motion tracking is active for the character"""
    try:
        response = requests.get(f'http://localhost:80/api/motion-tracking/status/{character_id}', timeout=2)
        if response.status_code == 200:
            data = response.json()
            return data.get('success', False) and data.get('isActive', False)
    except Exception as e:
        logger.debug(f"Could not check motion tracking status: {e}")
    return False

class MotionDetector:
    """Handles motion detection and visualization for camera stream."""
    
    def __init__(self, min_area: int = 500):
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50,
            varThreshold=16,
            detectShadows=False
        )
        self.prev_frame = None
        self.min_area = min_area
        
    def detect_and_draw_motion(self, frame: np.ndarray) -> np.ndarray:
        """Detect motion and draw overlay on frame"""
        try:
            if frame is None or frame.size == 0:
                return frame
                
            display_frame = frame.copy()
            
            # Convert to grayscale and apply blur
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)
            
            # Initialize previous frame if needed
            if self.prev_frame is None:
                self.prev_frame = gray
                # Add "Initializing Motion Detection" text
                font = cv2.FONT_HERSHEY_SIMPLEX
                cv2.putText(display_frame, "Initializing Motion Detection...", (5, 20), font,
                           0.5, (0, 255, 255), 2)
                cv2.putText(display_frame, "Initializing Motion Detection...", (5, 20), font,
                           0.5, (255, 255, 255), 1)
                return display_frame
            
            # Calculate absolute difference between frames
            frame_delta = cv2.absdiff(self.prev_frame, gray)
            thresh = cv2.threshold(frame_delta, 25, 255, cv2.THRESH_BINARY)[1]
            
            # Apply background subtraction
            mask = self.background_subtractor.apply(gray)
            
            # Combine frame difference and background subtraction
            combined_mask = cv2.bitwise_or(thresh, mask)
            
            # Clean up the mask
            combined_mask = cv2.erode(combined_mask, None, iterations=2)
            combined_mask = cv2.dilate(combined_mask, None, iterations=2)
            
            # Find contours
            contours, _ = cv2.findContours(
                combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            
            # Find largest contour above minimum area
            largest_contour = None
            largest_area = 0
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > self.min_area and area > largest_area:
                    largest_area = area
                    largest_contour = contour
            
            # Update previous frame
            self.prev_frame = gray
            
            # Draw motion indicators on frame
            if largest_contour is not None:
                x, y, w, h = cv2.boundingRect(largest_contour)
                center_x = int(x + w/2)
                center_y = int(y + h/2)

                # Draw motion box with glow effect
                cv2.rectangle(display_frame, (x-2, y-2), (x+w+2, y+h+2), (0, 255, 0), 4)
                cv2.rectangle(display_frame, (x, y), (x+w, y+h), (255, 255, 255), 2)

                # Draw crosshair with glow effect
                cv2.line(display_frame, (center_x-15, center_y), (center_x+15, center_y),
                        (0, 255, 0), 3)
                cv2.line(display_frame, (center_x, center_y-15), (center_x, center_y+15),
                        (0, 255, 0), 3)
                cv2.line(display_frame, (center_x-10, center_y), (center_x+10, center_y),
                        (255, 255, 255), 1)
                cv2.line(display_frame, (center_x, center_y-10), (center_x, center_y+10),
                        (255, 255, 255), 1)

                # Calculate normalized position (0-100)
                norm_x = (center_x / frame.shape[1]) * 100
                norm_y = (center_y / frame.shape[0]) * 100

                # Add motion info with glow effect
                timestamp = time.strftime("%H:%M:%S")
                motion_text = f"Motion Detected"
                coords_text = f"Position: ({int(norm_x)}, {int(norm_y)})"
                area_text = f"Area: {int(largest_area)}"

                font = cv2.FONT_HERSHEY_SIMPLEX
                # Motion detected text
                cv2.putText(display_frame, motion_text, (5, 20), font,
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, motion_text, (5, 20), font,
                           0.5, (255, 255, 255), 1)
                # Coordinates
                cv2.putText(display_frame, coords_text, (5, 40), font,
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, coords_text, (5, 40), font,
                           0.5, (255, 255, 255), 1)
                # Area
                cv2.putText(display_frame, area_text, (5, 60), font,
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, area_text, (5, 60), font,
                           0.5, (255, 255, 255), 1)
                # Timestamp
                cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font,
                           0.5, (0, 255, 0), 2)
                cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font,
                           0.5, (255, 255, 255), 1)
            else:
                # No motion detected
                timestamp = time.strftime("%H:%M:%S")
                font = cv2.FONT_HERSHEY_SIMPLEX
                cv2.putText(display_frame, "No Motion", (5, 20), font,
                           0.5, (0, 255, 255), 2)
                cv2.putText(display_frame, "No Motion", (5, 20), font,
                           0.5, (255, 255, 255), 1)
                cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font,
                           0.5, (0, 255, 255), 2)
                cv2.putText(display_frame, timestamp, (5, frame.shape[0]-5), font,
                           0.5, (255, 255, 255), 1)

            return display_frame
            
        except Exception as e:
            logger.warning(f"Motion detection error: {e}")
            return frame

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
        logger.error(f"Failed to initialize camera: {e}")
        return None

def stream_mjpeg(cap, character_id: int, boundary: str = 'frame'):
    """Stream MJPEG with optional motion detection overlay"""
    global running

    frame_count = 0
    start_time = time.time()
    motion_detector = MotionDetector()
    last_motion_check = 0
    motion_tracking_active = False

    logger.info(f"Starting MJPEG stream for character {character_id}")

    try:
        while running:
            ret, frame = cap.read()

            if not ret:
                logger.warning("Failed to read frame from camera")
                time.sleep(0.1)
                continue

            # Check motion tracking status every 5 seconds
            current_time = time.time()
            if current_time - last_motion_check > 5.0:
                motion_tracking_active = check_motion_tracking_active(character_id)
                last_motion_check = current_time
                if motion_tracking_active:
                    logger.debug(f"Motion tracking active for character {character_id}")

            # Apply motion detection overlay if active
            if motion_tracking_active:
                frame = motion_detector.detect_and_draw_motion(frame)

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
                status = "with motion detection" if motion_tracking_active else "standard"
                logger.info(f"Streamed {frame_count} frames ({status}), avg FPS: {fps:.2f}")

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

    parser = argparse.ArgumentParser(description='Camera MJPEG Streaming with Motion Detection')
    parser.add_argument('--camera-id', type=int, default=0, help='Camera device ID')
    parser.add_argument('--character-id', type=int, required=True, help='Character ID for motion tracking')
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
        stream_mjpeg(cap, args.character_id)

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
