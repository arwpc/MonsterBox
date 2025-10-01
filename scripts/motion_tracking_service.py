#!/usr/bin/env python3
"""
Motion Tracking Service for MonsterBox
Provides real-time motion detection and tracking using OpenCV
Outputs JSON status updates for integration with Node.js controller
"""

import cv2
import numpy as np
import json
import sys
import time
import signal
import argparse
import logging
import urllib.request
import socket
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MotionTracker:
    """OpenCV-based motion tracking for MonsterBox"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.cap = None
        self.bg_subtractor = None
        self.running = False
        self.frame_count = 0
        self.last_fps_time = time.time()
        self.fps = 0

        # Tracking state
        self.target_detected = False
        self.target_position = (50.0, 50.0)  # Normalized percentage
        self.target_size = 0.0
        self.last_detection_time = None

        # Performance tracking

        # MJPEG stream state
        self.stream_url = config.get('stream_url') if isinstance(config, dict) else None
        self.stream_conn = None
        self.frame_buffer = b''
        self.last_stream_connect = 0.0

        # Last bbox (normalized %)
        self.last_bbox = None

        self.frame_times = []

    def initialize(self) -> bool:
        """Initialize camera and OpenCV components"""
        try:
            # Initialize background subtractor
            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                detectShadows=True,
                varThreshold=16,
                history=500
            )

            # If a stream URL is provided, prefer MJPEG HTTP stream
            if self.stream_url:
                self._connect_stream()
                logger.info(f"Motion tracker initialized for stream: {self.stream_url}")
                return True

            # Fallback: initialize camera device
            device_path = self.config['device']
            if device_path.startswith('/dev/video'):
                device_id = int(device_path.replace('/dev/video', ''))
            else:
                device_id = 0

            self.cap = cv2.VideoCapture(device_id)
            if not self.cap.isOpened():
                logger.error(f"Failed to open camera device: {device_path}")
                return False

            # Set camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 15)

            logger.info(f"Motion tracker initialized for device: {device_path}")
            return True

        except Exception as e:
            logger.error(f"Motion tracker initialization failed: {e}")
            return False

    def _connect_stream(self) -> bool:
        try:
            if self.stream_conn:
                try:
                    self.stream_conn.close()
                except Exception:
                    pass
                self.stream_conn = None
            req = urllib.request.Request(self.stream_url, headers={'User-Agent': 'MonsterBox/4.0'})
            # Reduced timeout to 3 seconds to prevent long hangs
            old_timeout = socket.getdefaulttimeout(); socket.setdefaulttimeout(3)
            try:
                self.stream_conn = urllib.request.urlopen(req)
            finally:
                socket.setdefaulttimeout(old_timeout)
            self.frame_buffer = b''
            self.last_stream_connect = time.time()
            return True
        except Exception as e:
            # Only log connection errors occasionally to reduce noise
            if time.time() - getattr(self, '_last_error_log', 0) > 30:
                logger.warning(f"Stream connect failed: {e}")
                self._last_error_log = time.time()
            self.stream_conn = None
            return False

    def _read_mjpeg_frame(self) -> Optional[np.ndarray]:
        if not self.stream_conn:
            # Exponential backoff for reconnection attempts
            backoff_time = getattr(self, '_reconnect_backoff', 1.0)
            if time.time() - self.last_stream_connect > backoff_time:
                if self._connect_stream():
                    self._reconnect_backoff = 1.0  # Reset backoff on success
                else:
                    # Increase backoff time, max 30 seconds
                    self._reconnect_backoff = min(backoff_time * 2, 30.0)
            return None
        try:
            # Read larger chunks for better performance and lower latency
            chunk = self.stream_conn.read(32768)  # Increased from 4096 to 32KB
            if not chunk:
                try:
                    self.stream_conn.close()
                except Exception:
                    pass
                self.stream_conn = None
                return None
            self.frame_buffer += chunk

            # Find the most recent complete frame to reduce latency
            last_frame = None
            while True:
                soi = self.frame_buffer.find(b'\xff\xd8')
                if soi == -1:
                    break
                eoi = self.frame_buffer.find(b'\xff\xd9', soi+2)
                if eoi == -1:
                    break

                # Extract frame
                jpeg = self.frame_buffer[soi:eoi+2]
                self.frame_buffer = self.frame_buffer[eoi+2:]
                last_frame = jpeg

            # Aggressively trim buffer to prevent buildup
            if len(self.frame_buffer) > 512*1024:  # Reduced from 1MB to 512KB
                self.frame_buffer = self.frame_buffer[-32768:]  # Keep only last 32KB

            if last_frame:
                arr = np.frombuffer(last_frame, dtype=np.uint8)
                return cv2.imdecode(arr, cv2.IMREAD_COLOR)
            return None
        except Exception as e:
            # Only log read errors occasionally to reduce noise
            if time.time() - getattr(self, '_last_read_error_log', 0) > 30:
                logger.warning(f"Stream read error: {e}")
                self._last_read_error_log = time.time()
            try:
                if self.stream_conn:
                    self.stream_conn.close()
            except Exception:
                pass
            self.stream_conn = None
            return None

    def _read_frame(self) -> Optional[np.ndarray]:
        if self.stream_url:
            return self._read_mjpeg_frame()
        if not self.cap:
            return None
        ret, frame = self.cap.read()
        if not ret:
            return None
        return frame

    def process_frame(self) -> Optional[Dict[str, Any]]:
        """Process a single frame and return tracking status"""
        try:
            # Read frame from MJPEG stream or camera
            frame = self._read_frame()
            if frame is None:
                return None

            frame_start = time.time()
            self.frame_count += 1

            # Convert to grayscale for processing
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Apply background subtraction
            fg_mask = self.bg_subtractor.apply(
                gray,
                learningRate=self.config['background_learning_rate']
            )

            # Noise reduction
            kernel_size = self.config['noise_kernel_size']
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)

            # Find contours
            contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            # Filter contours by area
            min_area = self.config['min_contour_area']
            max_area = self.config['max_contour_area']
            valid_contours = [c for c in contours if min_area <= cv2.contourArea(c) <= max_area]

            # Process largest contour
            bbox = None
            if valid_contours:
                largest_contour = max(valid_contours, key=cv2.contourArea)
                x, y, w, h = cv2.boundingRect(largest_contour)

                # Calculate center and normalized position
                center_x = x + w // 2
                center_y = y + h // 2

                norm_x = (center_x / frame.shape[1]) * 100
                norm_y = (center_y / frame.shape[0]) * 100

                # Calculate normalized bounding box (percentages)
                bbox = {
                    'x': (x / frame.shape[1]) * 100,
                    'y': (y / frame.shape[0]) * 100,
                    'w': (w / frame.shape[1]) * 100,
                    'h': (h / frame.shape[0]) * 100
                }

                # Update tracking state
                self.target_detected = True
                self.target_position = (norm_x, norm_y)
                self.target_size = (cv2.contourArea(largest_contour) / (frame.shape[0] * frame.shape[1])) * 100
                self.last_detection_time = time.time()
                self.last_bbox = bbox

            else:
                self.target_detected = False
                self.last_bbox = None

            # Calculate FPS
            frame_time = time.time() - frame_start
            self.frame_times.append(frame_time)
            if len(self.frame_times) > 30:
                self.frame_times.pop(0)

            current_time = time.time()
            if current_time - self.last_fps_time >= 1.0:
                self.fps = self.frame_count / (current_time - self.last_fps_time)
                self.frame_count = 0
                self.last_fps_time = current_time

            # Return status with bbox
            status = {
                'initialized': True,
                'active': True,
                'target_detected': self.target_detected,
                'target_position': list(self.target_position),
                'target_size': self.target_size,
                'last_detection_time': self.last_detection_time,
                'fps': round(self.fps, 1),
                'frame_count': self.frame_count,
                'avg_frame_time': sum(self.frame_times) / len(self.frame_times) if self.frame_times else 0,
                'timestamp': time.time()
            }

            # Add bbox if target detected
            if self.last_bbox:
                status['bbox'] = self.last_bbox

            return status

        except Exception as e:
            logger.error(f"Frame processing error: {e}")
            return None

    def update_config(self, new_config: Dict[str, Any]):
        """Update tracking configuration"""
        self.config.update(new_config)
        logger.info(f"Configuration updated: {new_config}")

    def run(self):
        """Main tracking loop"""
        if not self.initialize():
            return False

        self.running = True
        last_output_time = 0
        output_interval = 1.0 / 25.0  # ~25 FPS output for responsive tracking

        # Send initialization status
        init_status = {
            'initialized': True,
            'device': self.config.get('device', 'stream'),
            'stream_url': self.config.get('stream_url'),
            'config': self.config,
            'timestamp': time.time()
        }
        print(json.dumps(init_status), flush=True)

        try:
            while self.running:
                status = self.process_frame()
                if status:
                    # Throttle output to prevent overwhelming the Pi
                    current_time = time.time()
                    if current_time - last_output_time >= output_interval:
                        print(json.dumps(status), flush=True)
                        last_output_time = current_time

                # Minimal delay for responsive tracking
                time.sleep(0.01)

        except KeyboardInterrupt:
            logger.info("Motion tracking stopped by user")
        except Exception as e:
            logger.error(f"Motion tracking error: {e}")
        finally:
            self.cleanup()

        return True

    def stop(self):
        """Stop the tracking loop"""
        self.running = False

    def cleanup(self):
        """Clean up resources"""
        if self.cap:
            self.cap.release()
        if self.stream_conn:
            try:
                self.stream_conn.close()
            except Exception:
                pass
        logger.info("Motion tracker cleanup complete")

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    sys.exit(0)

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='MonsterBox Motion Tracking Service')
    parser.add_argument('--device', default='/dev/video0', help='Camera device path')
    parser.add_argument('--stream-url', help='MJPEG stream URL (e.g., http://localhost:8090/?action=stream)')
    parser.add_argument('--motion-threshold', type=int, default=25, help='Motion detection threshold')
    parser.add_argument('--min-contour-area', type=int, default=500, help='Minimum contour area')
    parser.add_argument('--max-contour-area', type=int, default=50000, help='Maximum contour area')
    parser.add_argument('--tracking-smoothing', type=float, default=0.3, help='Tracking smoothing factor')
    parser.add_argument('--tracking-deadzone', type=float, default=5.0, help='Tracking deadzone percentage')
    parser.add_argument('--background-learning-rate', type=float, default=0.01, help='Background learning rate')
    parser.add_argument('--noise-kernel-size', type=int, default=3, help='Noise reduction kernel size')

    args = parser.parse_args()

    # Set up signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Configuration
    config = {
        'device': args.device,
        'stream_url': args.stream_url,
        'motion_threshold': args.motion_threshold,
        'min_contour_area': args.min_contour_area,
        'max_contour_area': args.max_contour_area,
        'tracking_smoothing': args.tracking_smoothing,
        'tracking_deadzone': args.tracking_deadzone,
        'background_learning_rate': args.background_learning_rate,
        'noise_kernel_size': args.noise_kernel_size
    }

    # Create and run tracker
    tracker = MotionTracker(config)

    try:
        success = tracker.run()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Motion tracking service failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
