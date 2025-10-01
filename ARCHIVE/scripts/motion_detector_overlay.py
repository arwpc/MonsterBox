#!/usr/bin/env python3
"""
Motion Detection Overlay for MonsterBox Camera System
Processes frames from the existing camera stream and adds motion detection data
without disrupting the stream or showing visual overlays.
"""

import cv2
import numpy as np
import json
import sys
import time
import signal
import argparse
import logging
from typing import Dict, Any, Optional, Tuple
import requests
import threading
from queue import Queue, Empty

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global flag for graceful shutdown
running = True

def signal_handler(signum, frame):
    global running
    running = False
    logger.info("Received shutdown signal")

class StreamMotionDetector:
    """Motion detector that works with existing camera stream."""
    
    def __init__(self, stream_url: str, width: int = 1280, height: int = 720):
        self.stream_url = stream_url
        self.width = width
        self.height = height
        self.background_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50,
            varThreshold=16,
            detectShadows=False
        )
        self.prev_frame = None
        self.min_area = 500  # Minimum area for motion detection
        self.frame_queue = Queue(maxsize=5)
        self.motion_data_queue = Queue(maxsize=10)
        
    def fetch_stream_frames(self):
        """Fetch frames from the existing camera stream."""
        try:
            response = requests.get(self.stream_url, stream=True, timeout=10)
            if response.status_code != 200:
                logger.error(f"Failed to connect to stream: {response.status_code}")
                return
                
            buffer = b''
            for chunk in response.iter_content(chunk_size=1024):
                if not running:
                    break
                    
                buffer += chunk
                
                # Look for JPEG frame boundaries
                while b'\xff\xd8' in buffer and b'\xff\xd9' in buffer:
                    start = buffer.find(b'\xff\xd8')
                    end = buffer.find(b'\xff\xd9', start) + 2
                    
                    if start != -1 and end > start:
                        jpeg_data = buffer[start:end]
                        buffer = buffer[end:]
                        
                        # Decode JPEG frame
                        frame = cv2.imdecode(np.frombuffer(jpeg_data, dtype=np.uint8), cv2.IMREAD_COLOR)
                        if frame is not None:
                            # Add frame to queue (non-blocking)
                            try:
                                self.frame_queue.put_nowait(frame)
                            except:
                                # Queue full, skip frame
                                pass
                    else:
                        break
                        
        except Exception as e:
            logger.error(f"Error fetching stream frames: {e}")
    
    def process_motion(self):
        """Process frames for motion detection."""
        try:
            while running:
                try:
                    # Get frame from queue with timeout
                    frame = self.frame_queue.get(timeout=1.0)
                    
                    # Process frame for motion
                    motion_data = self.detect_motion_in_frame(frame)
                    if motion_data:
                        # Add to motion data queue
                        try:
                            self.motion_data_queue.put_nowait(motion_data)
                        except:
                            # Queue full, skip
                            pass
                            
                except Empty:
                    # No frame available, continue
                    continue
                except Exception as e:
                    logger.error(f"Error processing motion: {e}")
                    
        except Exception as e:
            logger.error(f"Motion processing error: {e}")
    
    def detect_motion_in_frame(self, frame: np.ndarray) -> Optional[Dict[str, Any]]:
        """Detect motion in a single frame without visual overlays."""
        try:
            if frame is None or frame.size == 0:
                return None
                
            # Convert to grayscale and apply blur
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)
            
            # Initialize previous frame if needed
            if self.prev_frame is None:
                self.prev_frame = gray
                return {
                    "success": True,
                    "motion_detected": False,
                    "timestamp": time.time()
                }
            
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
            
            # Find largest contour
            largest_contour = None
            largest_area = 0
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > self.min_area and area > largest_area:
                    largest_area = area
                    largest_contour = contour
            
            # Update previous frame
            self.prev_frame = gray
            
            if largest_contour is not None:
                x, y, w, h = cv2.boundingRect(largest_contour)
                center_x = int(x + w/2)
                center_y = int(y + h/2)
                
                # Calculate normalized position (0-100)
                norm_x = (center_x / frame.shape[1]) * 100
                norm_y = (center_y / frame.shape[0]) * 100
                
                return {
                    "success": True,
                    "motion_detected": True,
                    "center_x": norm_x,
                    "center_y": norm_y,
                    "width": w,
                    "height": h,
                    "area": largest_area,
                    "timestamp": time.time()
                }
            else:
                return {
                    "success": True,
                    "motion_detected": False,
                    "timestamp": time.time()
                }
                
        except Exception as e:
            logger.warning(f"Frame processing error: {e}")
            return None
    
    def start_detection(self):
        """Start motion detection with existing stream."""
        logger.info("Starting stream-based motion detection")
        
        # Print initialization success
        print(json.dumps({
            "success": True,
            "message": "Motion detection initialized"
        }))
        sys.stdout.flush()
        
        # Start frame fetching thread
        fetch_thread = threading.Thread(target=self.fetch_stream_frames, daemon=True)
        fetch_thread.start()
        
        # Start motion processing thread
        motion_thread = threading.Thread(target=self.process_motion, daemon=True)
        motion_thread.start()
        
        # Output motion data
        try:
            while running:
                try:
                    motion_data = self.motion_data_queue.get(timeout=0.1)
                    print(json.dumps(motion_data))
                    sys.stdout.flush()
                except Empty:
                    # No motion data, send heartbeat
                    print(json.dumps({
                        "success": True,
                        "motion_detected": False,
                        "timestamp": time.time()
                    }))
                    sys.stdout.flush()
                    time.sleep(0.1)
                except Exception as e:
                    logger.error(f"Error outputting motion data: {e}")
                    
        except KeyboardInterrupt:
            logger.info("Motion detection stopped by user")
        except Exception as e:
            logger.error(f"Motion detection error: {e}")

def main():
    global running
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    parser = argparse.ArgumentParser(description='Stream-based Motion Detection')
    parser.add_argument('--stream-url', required=True, help='Camera stream URL')
    parser.add_argument('--width', type=int, default=1280, help='Frame width')
    parser.add_argument('--height', type=int, default=720, help='Frame height')
    
    args = parser.parse_args()
    
    try:
        detector = StreamMotionDetector(args.stream_url, args.width, args.height)
        detector.start_detection()
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
