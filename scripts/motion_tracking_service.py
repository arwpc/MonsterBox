#!/usr/bin/env python3
"""
Motion Tracking Service for MonsterBox
Provides real-time motion detection and tracking using OpenCV
Outputs JSON status updates for integration with Node.js controller
Reads stdin for live config updates from the parent Node process.
"""

import cv2
import numpy as np
import json
import sys
import os
import time
import select
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

        # Detection mode: 'motion', 'face', 'face+hands', 'all'
        self.detection_mode = config.get('detection_mode', 'motion')

        # Face detection (Haar cascade)
        self.face_cascade = None
        if self.detection_mode in ('face', 'face+hands', 'all'):
            self._init_face_detector()

        # Manual target tracking
        self.manual_target = None  # {x, y, expires_at}

        # Tracking state
        self.target_detected = False
        self.target_position = (50.0, 50.0)  # Normalized percentage
        self.target_size = 0.0
        self.last_detection_time = None

        # Temporal smoothing — exponential moving average of target position
        self.smoothed_x = 50.0
        self.smoothed_y = 50.0
        self.position_smoothing = config.get('tracking_smoothing', 0.3)

        # Target persistence — keep reporting last position briefly after lost
        self.target_lost_time = None
        self.persistence_sec = 0.5  # report last pos for 0.5s after losing target

        # Multi-frame tracking state
        self.tracked_objects = []  # list of tracked contour objects
        self.next_track_id = 1
        self.locked_target_id = None  # ID of currently locked target
        self.target_lock_strength = config.get('target_lock_strength', 5)
        self.confirm_frames = config.get('confirm_frames', 3)

        # MJPEG stream state
        self.stream_url = config.get('stream_url') if isinstance(config, dict) else None
        self.stream_conn = None
        self.frame_buffer = b''
        self.last_stream_connect = 0.0

        # Last bbox (normalized %)
        self.last_bbox = None

        self.frame_times = []

        # Stdin buffer for config updates
        self._stdin_buf = ''

    def _init_face_detector(self):
        """Initialize Haar cascade face detector."""
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
            if self.face_cascade.empty():
                logger.warning("Failed to load face cascade, falling back to motion mode")
                self.face_cascade = None
            else:
                logger.info("Face detection initialized (Haar cascade)")
        except Exception as e:
            logger.warning(f"Face detection init failed: {e}, falling back to motion mode")
            self.face_cascade = None

    def _detect_faces(self, gray):
        """Detect faces using Haar cascade. Returns list of (x,y,w,h) bounding rects."""
        if self.face_cascade is None:
            return []
        try:
            faces = self.face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            )
            return list(faces) if len(faces) > 0 else []
        except Exception:
            return []

    def _detect_hands_hsv(self, frame):
        """Detect hands using HSV skin-color segmentation. Returns list of (x,y,w,h)."""
        try:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            lower_skin = np.array([0, 20, 70], dtype=np.uint8)
            upper_skin = np.array([20, 255, 255], dtype=np.uint8)
            mask = cv2.inRange(hsv, lower_skin, upper_skin)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            # Filter for hand-sized regions (larger than faces typically)
            min_area = self.config.get('min_contour_area', 3000) * 0.5
            max_area = self.config.get('max_contour_area', 100000) * 2
            rects = []
            for c in contours:
                area = cv2.contourArea(c)
                if min_area <= area <= max_area:
                    rects.append(cv2.boundingRect(c))
            return rects
        except Exception:
            return []

    def initialize(self) -> bool:
        """Initialize camera and OpenCV components"""
        try:
            # Initialize background subtractor with configurable params
            var_threshold = self.config.get('var_threshold', 16)
            history = self.config.get('history', 500)
            detect_shadows = self.config.get('detect_shadows', True)

            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                detectShadows=detect_shadows,
                varThreshold=var_threshold,
                history=history
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
            old_timeout = socket.getdefaulttimeout(); socket.setdefaulttimeout(3)
            try:
                self.stream_conn = urllib.request.urlopen(req)
            finally:
                socket.setdefaulttimeout(old_timeout)
            self.frame_buffer = b''
            self.last_stream_connect = time.time()
            return True
        except Exception as e:
            if time.time() - getattr(self, '_last_error_log', 0) > 30:
                logger.warning(f"Stream connect failed: {e}")
                self._last_error_log = time.time()
            self.stream_conn = None
            return False

    def _read_mjpeg_frame(self) -> Optional[np.ndarray]:
        if not self.stream_conn:
            backoff_time = getattr(self, '_reconnect_backoff', 1.0)
            if time.time() - self.last_stream_connect > backoff_time:
                if self._connect_stream():
                    self._reconnect_backoff = 1.0
                else:
                    self._reconnect_backoff = min(backoff_time * 2, 30.0)
            return None
        try:
            chunk = self.stream_conn.read(32768)
            if not chunk:
                try:
                    self.stream_conn.close()
                except Exception:
                    pass
                self.stream_conn = None
                return None
            self.frame_buffer += chunk

            last_frame = None
            while True:
                soi = self.frame_buffer.find(b'\xff\xd8')
                if soi == -1:
                    break
                eoi = self.frame_buffer.find(b'\xff\xd9', soi+2)
                if eoi == -1:
                    break
                jpeg = self.frame_buffer[soi:eoi+2]
                self.frame_buffer = self.frame_buffer[eoi+2:]
                last_frame = jpeg

            if len(self.frame_buffer) > 512*1024:
                self.frame_buffer = self.frame_buffer[-32768:]

            if last_frame:
                arr = np.frombuffer(last_frame, dtype=np.uint8)
                return cv2.imdecode(arr, cv2.IMREAD_COLOR)
            return None
        except Exception as e:
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

    def _check_stdin(self):
        """Non-blocking stdin read for config updates from Node parent."""
        try:
            while select.select([sys.stdin], [], [], 0)[0]:
                line = sys.stdin.readline()
                if not line:
                    return  # EOF
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if msg.get('type') == 'update_config':
                        new_cfg = msg.get('config', {})
                        self.update_config(new_cfg)
                    elif msg.get('type') == 'set_manual_target':
                        x = float(msg.get('x', 50))
                        y = float(msg.get('y', 50))
                        duration = float(msg.get('durationSec', 30))
                        self.manual_target = {
                            'x': x, 'y': y,
                            'expires_at': time.time() + duration
                        }
                        logger.info(f"Manual target set: ({x:.1f}%, {y:.1f}%) for {duration}s")
                    elif msg.get('type') == 'clear_manual_target':
                        self.manual_target = None
                        logger.info("Manual target cleared")
                except json.JSONDecodeError:
                    pass
        except Exception:
            pass  # stdin not selectable on some platforms

    def process_frame(self) -> Optional[Dict[str, Any]]:
        """Process a single frame and return tracking status"""
        try:
            frame = self._read_frame()
            if frame is None:
                return None

            frame_start = time.time()
            self.frame_count += 1

            # Convert to grayscale for processing
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Gaussian blur to reduce noise before background subtraction
            blur_size = self.config.get('blur_size', 5)
            if blur_size > 1:
                gray = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)

            # Apply background subtraction
            fg_mask = self.bg_subtractor.apply(
                gray,
                learningRate=self.config['background_learning_rate']
            )

            # Threshold to remove shadows (MOG2 marks shadows as 127)
            _, fg_mask = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)

            # Noise reduction — open removes small noise, close fills gaps in large objects
            kernel_size = self.config['noise_kernel_size']
            if kernel_size < 1:
                kernel_size = 3
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)

            # Dilate + close to merge nearby fragments into one big blob
            dilate_size = self.config.get('dilate_size', 7)
            if dilate_size > 1:
                dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_size, dilate_size))
                fg_mask = cv2.dilate(fg_mask, dilate_kernel, iterations=2)
                fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, dilate_kernel)

            # Find contours based on detection mode
            min_area = self.config['min_contour_area']
            max_area = self.config['max_contour_area']
            frame_h, frame_w = frame.shape[:2]

            new_detections = []
            mode = self.detection_mode

            # Motion detection (MOG2 background subtraction)
            motion_detections = []
            if mode in ('motion', 'all'):
                contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_contours = [c for c in contours if min_area <= cv2.contourArea(c) <= max_area]
                for c in valid_contours:
                    x, y, w, h = cv2.boundingRect(c)
                    cx = x + w // 2
                    cy = y + h // 2
                    motion_detections.append({
                        'center': (cx, cy), 'bbox': (x, y, w, h),
                        'area': cv2.contourArea(c), 'matched': False, 'source': 'motion'
                    })

            # Face detection (Haar cascade)
            face_detections = []
            if mode in ('face', 'face+hands', 'all'):
                face_rects = self._detect_faces(gray)
                for (x, y, w, h) in face_rects:
                    cx = x + w // 2
                    cy = y + h // 2
                    face_detections.append({
                        'center': (cx, cy), 'bbox': (x, y, w, h),
                        'area': w * h, 'matched': False, 'source': 'face'
                    })

            # Hand detection (HSV skin color)
            hand_detections = []
            if mode in ('face+hands', 'all'):
                hand_rects = self._detect_hands_hsv(frame)
                for (x, y, w, h) in hand_rects:
                    cx = x + w // 2
                    cy = y + h // 2
                    hand_detections.append({
                        'center': (cx, cy), 'bbox': (x, y, w, h),
                        'area': w * h, 'matched': False, 'source': 'hand'
                    })

            # Merge detections — prefer face over motion when overlapping
            if mode == 'motion':
                new_detections = motion_detections
            elif mode == 'face':
                new_detections = face_detections
            elif mode == 'face+hands':
                new_detections = face_detections + hand_detections
            elif mode == 'all':
                # Face results take priority; only add motion that doesn't overlap faces
                new_detections = list(face_detections)
                for md in motion_detections:
                    overlap = False
                    for fd in face_detections:
                        dx = abs(md['center'][0] - fd['center'][0])
                        dy = abs(md['center'][1] - fd['center'][1])
                        if dx < frame_w * 0.15 and dy < frame_h * 0.15:
                            overlap = True
                            break
                    if not overlap:
                        new_detections.append(md)
                new_detections.extend(hand_detections)
            else:
                # Fallback to motion
                contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                valid_contours = [c for c in contours if min_area <= cv2.contourArea(c) <= max_area]
                for c in valid_contours:
                    x, y, w, h = cv2.boundingRect(c)
                    cx = x + w // 2
                    cy = y + h // 2
                    new_detections.append({
                        'center': (cx, cy), 'bbox': (x, y, w, h),
                        'area': cv2.contourArea(c), 'matched': False, 'source': 'motion'
                    })

            # Check manual target expiry
            if self.manual_target and time.time() > self.manual_target['expires_at']:
                self.manual_target = None

            # Multi-frame tracking: match contours to tracked objects
            match_radius = max(frame_w, frame_h) * 0.20  # 20% of frame size

            # Match new detections to existing tracked objects (nearest center)
            for tobj in self.tracked_objects:
                best_dist = match_radius
                best_idx = -1
                for i, det in enumerate(new_detections):
                    if det['matched']:
                        continue
                    dx = tobj['center'][0] - det['center'][0]
                    dy = tobj['center'][1] - det['center'][1]
                    dist = (dx * dx + dy * dy) ** 0.5
                    if dist < best_dist:
                        best_dist = dist
                        best_idx = i

                if best_idx >= 0:
                    det = new_detections[best_idx]
                    det['matched'] = True
                    # Update tracked object with new detection
                    old_cx, old_cy = tobj['center']
                    new_cx, new_cy = det['center']
                    tobj['velocity'] = (new_cx - old_cx, new_cy - old_cy)
                    tobj['center'] = det['center']
                    tobj['bbox'] = det['bbox']
                    tobj['area'] = det['area']
                    tobj['age'] += 1
                    tobj['lost_count'] = 0
                else:
                    tobj['lost_count'] += 1

            # Create new tracked objects for unmatched detections
            for det in new_detections:
                if not det['matched']:
                    self.tracked_objects.append({
                        'id': self.next_track_id,
                        'center': det['center'],
                        'bbox': det['bbox'],
                        'area': det['area'],
                        'age': 1,
                        'lost_count': 0,
                        'velocity': (0, 0)
                    })
                    self.next_track_id += 1

            # Cleanup: remove objects lost for too long (>30 frames ~1s at 25fps)
            self.tracked_objects = [t for t in self.tracked_objects if t['lost_count'] <= 30]

            # Select target: manual target > locked target > largest confirmed object
            confirm_frames = self.confirm_frames
            lock_lost_limit = self.target_lock_strength * 3

            # Manual target: prefer detection closest to user-clicked position
            if self.manual_target and self.tracked_objects:
                mt_x = self.manual_target['x'] / 100.0 * frame_w
                mt_y = self.manual_target['y'] / 100.0 * frame_h
                active = [t for t in self.tracked_objects if t['lost_count'] == 0]
                if active:
                    closest = min(active, key=lambda t: ((t['center'][0] - mt_x)**2 + (t['center'][1] - mt_y)**2))
                    self.locked_target_id = closest['id']

            # Find the locked target if still alive
            locked_obj = None
            if self.locked_target_id is not None:
                for tobj in self.tracked_objects:
                    if tobj['id'] == self.locked_target_id:
                        locked_obj = tobj
                        break

            # Determine if locked target should be released
            if locked_obj is not None and locked_obj['lost_count'] > lock_lost_limit:
                locked_obj = None
                self.locked_target_id = None

            # If no locked target, pick the largest confirmed object
            target_obj = locked_obj
            if target_obj is None:
                confirmed = [t for t in self.tracked_objects
                             if t['age'] >= confirm_frames and t['lost_count'] == 0]
                if confirmed:
                    target_obj = max(confirmed, key=lambda t: t['area'])
                    self.locked_target_id = target_obj['id']

            # Generate output from selected target
            bbox = None
            if target_obj is not None and target_obj['lost_count'] == 0:
                tx, ty, tw, th = target_obj['bbox']
                cx, cy = target_obj['center']

                raw_x = (cx / frame_w) * 100
                raw_y = (cy / frame_h) * 100

                bbox = {
                    'x': (tx / frame_w) * 100,
                    'y': (ty / frame_h) * 100,
                    'w': (tw / frame_w) * 100,
                    'h': (th / frame_h) * 100
                }

                # Temporal smoothing — EMA toward new position
                alpha = self.position_smoothing
                self.smoothed_x = self.smoothed_x + (raw_x - self.smoothed_x) * alpha
                self.smoothed_y = self.smoothed_y + (raw_y - self.smoothed_y) * alpha

                self.target_detected = True
                self.target_position = (self.smoothed_x, self.smoothed_y)
                self.target_size = (target_obj['area'] / (frame_h * frame_w)) * 100
                self.last_detection_time = time.time()
                self.last_bbox = bbox
                self.target_lost_time = None

            else:
                # Target lost — persist briefly
                now = time.time()
                if self.target_lost_time is None:
                    self.target_lost_time = now

                if self.last_detection_time and (now - self.last_detection_time) < self.persistence_sec:
                    self.target_detected = True
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

            status = {
                'initialized': True,
                'active': True,
                'detection_mode': self.detection_mode,
                'target_detected': self.target_detected,
                'target_position': list(self.target_position),
                'target_size': self.target_size,
                'last_detection_time': self.last_detection_time,
                'manual_target_active': self.manual_target is not None,
                'manual_target_remaining': round(self.manual_target['expires_at'] - time.time(), 1) if self.manual_target else 0,
                'fps': round(self.fps, 1),
                'frame_count': self.frame_count,
                'avg_frame_time': sum(self.frame_times) / len(self.frame_times) if self.frame_times else 0,
                'timestamp': time.time()
            }

            if self.last_bbox:
                status['bbox'] = self.last_bbox

            return status

        except Exception as e:
            logger.error(f"Frame processing error: {e}")
            return None

    def update_config(self, new_config: Dict[str, Any]):
        """Update tracking configuration from hot-update message."""
        # Map Node param names to Python config keys
        key_map = {
            'motionThreshold': 'motion_threshold',
            'minContourArea': 'min_contour_area',
            'maxContourArea': 'max_contour_area',
            'trackingSmoothing': 'tracking_smoothing',
            'trackingDeadzone': 'tracking_deadzone',
            'backgroundLearningRate': 'background_learning_rate',
            'noiseReductionKernelSize': 'noise_kernel_size',
            'noiseKernelSize': 'noise_kernel_size',
            'blurSize': 'blur_size',
            'dilateSize': 'dilate_size',
            'varThreshold': 'var_threshold',
            'targetLockStrength': 'target_lock_strength',
            'confirmFrames': 'confirm_frames',
            'detectionMode': 'detection_mode',
        }

        mapped = {}
        for k, v in new_config.items():
            py_key = key_map.get(k, k)
            mapped[py_key] = v

        self.config.update(mapped)

        # Update position smoothing factor if changed
        if 'tracking_smoothing' in mapped:
            self.position_smoothing = float(mapped['tracking_smoothing'])

        # Update multi-frame tracking params if changed
        if 'target_lock_strength' in mapped:
            self.target_lock_strength = int(mapped['target_lock_strength'])
        if 'confirm_frames' in mapped:
            self.confirm_frames = int(mapped['confirm_frames'])

        # Update detection mode if changed
        if 'detection_mode' in mapped:
            new_mode = mapped['detection_mode']
            if new_mode != self.detection_mode:
                self.detection_mode = new_mode
                if new_mode in ('face', 'face+hands', 'all') and self.face_cascade is None:
                    self._init_face_detector()
                logger.info(f"Detection mode changed to: {new_mode}")

        logger.info(f"Config hot-updated: {list(mapped.keys())}")

    def run(self):
        """Main tracking loop"""
        if not self.initialize():
            return False

        self.running = True
        last_output_time = 0
        output_interval = 1.0 / 25.0  # ~25 FPS output

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
                # Check for config updates from Node parent (non-blocking)
                self._check_stdin()

                status = self.process_frame()
                if status:
                    current_time = time.time()
                    if current_time - last_output_time >= output_interval:
                        print(json.dumps(status), flush=True)
                        last_output_time = current_time

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
    parser.add_argument('--stream-url', help='MJPEG stream URL')
    parser.add_argument('--motion-threshold', type=int, default=25, help='Motion detection threshold')
    parser.add_argument('--min-contour-area', type=int, default=3000, help='Minimum contour area (px)')
    parser.add_argument('--max-contour-area', type=int, default=100000, help='Maximum contour area (px)')
    parser.add_argument('--tracking-smoothing', type=float, default=0.25, help='Position smoothing (0=frozen, 1=instant)')
    parser.add_argument('--tracking-deadzone', type=float, default=5.0, help='Tracking deadzone %%')
    parser.add_argument('--background-learning-rate', type=float, default=0.005, help='Background learning rate')
    parser.add_argument('--noise-kernel-size', type=int, default=5, help='Noise reduction kernel size')
    parser.add_argument('--blur-size', type=int, default=5, help='Gaussian blur kernel size')
    parser.add_argument('--dilate-size', type=int, default=9, help='Dilation kernel to merge fragments')
    parser.add_argument('--var-threshold', type=int, default=25, help='MOG2 variance threshold')
    parser.add_argument('--history', type=int, default=500, help='MOG2 history frames')
    parser.add_argument('--target-lock-strength', type=int, default=5, help='Target lock strength (1-10)')
    parser.add_argument('--confirm-frames', type=int, default=3, help='Frames before confirming target (1-10)')
    parser.add_argument('--detection-mode', default='motion', choices=['motion', 'face', 'face+hands', 'all'],
                        help='Detection mode: motion, face, face+hands, all')

    args = parser.parse_args()

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    config = {
        'device': args.device,
        'stream_url': args.stream_url,
        'motion_threshold': args.motion_threshold,
        'min_contour_area': args.min_contour_area,
        'max_contour_area': args.max_contour_area,
        'tracking_smoothing': args.tracking_smoothing,
        'tracking_deadzone': args.tracking_deadzone,
        'background_learning_rate': args.background_learning_rate,
        'noise_kernel_size': args.noise_kernel_size,
        'blur_size': args.blur_size,
        'dilate_size': args.dilate_size,
        'var_threshold': args.var_threshold,
        'history': args.history,
        'target_lock_strength': args.target_lock_strength,
        'confirm_frames': args.confirm_frames,
        'detect_shadows': True,
        'detection_mode': args.detection_mode,
    }

    tracker = MotionTracker(config)

    try:
        success = tracker.run()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Motion tracking service failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
