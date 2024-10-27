#!/usr/bin/env python3

import cv2
import sys
import time
import json
import logging
import argparse
import re
from typing import Optional, Dict, Any, List
import numpy as np
import subprocess

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CameraInfo:
    """Stores and parses camera device information."""
    
    @staticmethod
    def parse_v4l2_devices(output: str) -> List[Dict[str, Any]]:
        """Parse v4l2-ctl --list-devices output."""
        devices = []
        current_device = None
        
        for line in output.split('\n'):
            if not line.strip():
                continue
                
            if not line.startswith('\t'):
                # This is a device name line
                name_match = re.match(r'^(.*?)((?:\s*\(.*\))*):$', line)
                if name_match:
                    current_device = {
                        'name': name_match.group(1).strip(),
                        'type': 'USB' if 'USB' in line else 'Platform',
                        'devices': [],
                        'is_capture': False
                    }
                    # Extract USB location if present
                    usb_match = re.search(r'usb-([^)]+)', line)
                    if usb_match:
                        current_device['usb_path'] = usb_match.group(1)
            elif current_device:
                # This is a device path line
                device_path = line.strip()
                if 'video' in device_path:
                    current_device['devices'].append(device_path)
                    # Mark as capture device if it's video0 or video1
                    if device_path in ['/dev/video0', '/dev/video1']:
                        current_device['is_capture'] = True
                if current_device not in devices:
                    devices.append(current_device)
        
        return devices

class CameraStream:
    """Handles camera streaming operations with error recovery and status monitoring."""
    
    def __init__(self, camera_id: int = 0, width: int = 160, height: int = 120):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.cap: Optional[cv2.VideoCapture] = None
        self.retries = 3
        self.retry_delay = 2
        self.frame_count = 0
        self.start_time = time.time()
        self.last_frame_time = 0
        self.fps = 0
        self.is_initialized = False

    def get_camera_info(self) -> Dict[str, Any]:
        """Get information about available cameras."""
        try:
            # Get camera info using v4l2-ctl
            result = subprocess.run(['v4l2-ctl', '--list-devices'], 
                                 capture_output=True, text=True)
            if result.returncode == 0:
                devices = CameraInfo.parse_v4l2_devices(result.stdout)
                
                # Get capabilities for each camera device
                for device in devices:
                    if device['is_capture']:
                        for dev_path in device['devices']:
                            try:
                                cap = cv2.VideoCapture(int(dev_path.replace('/dev/video', '')))
                                if cap.isOpened():
                                    device['capabilities'] = {
                                        'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                                        'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                                        'fps': int(cap.get(cv2.CAP_PROP_FPS))
                                    }
                                cap.release()
                            except Exception as e:
                                logger.warning(f"Failed to get capabilities for {dev_path}: {e}")
                
                return {
                    "status": "success",
                    "cameras": [d for d in devices if d['is_capture']],
                    "other_devices": [d for d in devices if not d['is_capture']]
                }
                
        except FileNotFoundError:
            logger.warning("v4l2-ctl not found, falling back to OpenCV detection")
        except Exception as e:
            logger.error(f"Error getting camera info: {e}")

        # Fallback to OpenCV detection
        cameras = []
        for i in range(5):
            try:
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    cameras.append({
                        "name": f"Camera {i}",
                        "type": "Unknown",
                        "devices": [f"/dev/video{i}"],
                        "is_capture": True,
                        "capabilities": {
                            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                            "fps": int(cap.get(cv2.CAP_PROP_FPS))
                        }
                    })
                cap.release()
            except Exception:
                continue

        return {
            "status": "success",
            "cameras": cameras,
            "other_devices": []
        }

    def initialize_camera(self) -> bool:
        """Initialize the camera with multiple retry attempts."""
        for attempt in range(self.retries):
            try:
                logger.info(f"Camera initialization attempt {attempt + 1}/{self.retries}")
                
                # Try different backend APIs
                backends = [
                    (cv2.CAP_V4L2, "V4L2"),
                    (cv2.CAP_V4L, "V4L"),
                    (cv2.CAP_GSTREAMER, "GStreamer"),
                    (cv2.CAP_ANY, "Auto")
                ]
                
                for backend, name in backends:
                    if self.try_camera_backend(backend, name):
                        self.is_initialized = True
                        self.start_time = time.time()
                        return True

                logger.error(f"Attempt {attempt + 1} failed, waiting {self.retry_delay}s...")
                time.sleep(self.retry_delay)
                
            except Exception as e:
                logger.error(f"Initialization error: {str(e)}")
                self.release()
                time.sleep(self.retry_delay)

        logger.error("Camera initialization failed after all attempts")
        return False

    def try_camera_backend(self, backend: int, name: str) -> bool:
        """Attempt to initialize camera with specific backend."""
        try:
            logger.info(f"Trying camera backend: {name}")
            
            self.cap = cv2.VideoCapture(self.camera_id + backend)
            if not self.cap.isOpened():
                logger.warning(f"Failed to open camera with {name}")
                return False

            # Configure camera properties
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FPS, 30)

            # Verify camera is working
            ret, frame = self.cap.read()
            if not ret or frame is None:
                logger.warning(f"{name} backend failed to capture test frame")
                self.release()
                return False

            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))
            
            logger.info(f"Camera initialized: {actual_width}x{actual_height} @{actual_fps}fps using {name}")
            return True

        except Exception as e:
            logger.error(f"Error with {name} backend: {str(e)}")
            self.release()
            return False

    def get_frame(self) -> Optional[bytes]:
        """Capture and encode a frame from the camera."""
        if not self.cap or not self.cap.isOpened():
            return None

        try:
            # Update FPS calculation
            current_time = time.time()
            if current_time - self.start_time >= 1:
                self.fps = self.frame_count / (current_time - self.start_time)
                self.start_time = current_time
                self.frame_count = 0

            # Capture frame
            ret, frame = self.cap.read()
            if not ret or frame is None:
                logger.error("Failed to capture frame")
                return None

            # Resize if necessary
            actual_size = (frame.shape[1], frame.shape[0])
            if actual_size != (self.width, self.height):
                frame = cv2.resize(frame, (self.width, self.height))

            # Add timestamp
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, f"FPS: {self.fps:.1f}", (10, 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            cv2.putText(frame, timestamp, (10, frame.shape[0] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

            # Encode frame
            ret, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ret:
                logger.error("Failed to encode frame")
                return None

            self.frame_count += 1
            self.last_frame_time = current_time
            return jpeg.tobytes()

        except Exception as e:
            logger.error(f"Frame capture error: {str(e)}")
            return None

    def release(self):
        """Release camera resources."""
        if self.cap:
            self.cap.release()
            self.cap = None
        self.is_initialized = False

def stream_camera(args):
    """Main camera streaming function."""
    camera = CameraStream(args.camera_id, args.width, args.height)
    
    try:
        if not camera.initialize_camera():
            logger.error("Failed to initialize camera")
            sys.exit(1)

        while True:
            frame_data = camera.get_frame()
            if frame_data is None:
                if not camera.initialize_camera():
                    logger.error("Failed to reinitialize camera")
                    break
                continue

            # Write frame data to stdout
            sys.stdout.buffer.write(b'--frame\r\n')
            sys.stdout.buffer.write(b'Content-Type: image/jpeg\r\n\r\n')
            sys.stdout.buffer.write(frame_data)
            sys.stdout.buffer.write(b'\r\n')
            sys.stdout.buffer.flush()

            # Rate limiting
            time.sleep(0.033)  # ~30 FPS

    except KeyboardInterrupt:
        logger.info("Stream stopped by user")
    except BrokenPipeError:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"Streaming error: {str(e)}")
    finally:
        camera.release()

def main():
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(description='Camera Streaming Script')
    parser.add_argument('--width', type=int, default=160,
                       help='Stream width (default: 160)')
    parser.add_argument('--height', type=int, default=120,
                       help='Stream height (default: 120)')
    parser.add_argument('--camera-id', type=int, default=0,
                       help='Camera device ID (default: 0)')
    parser.add_argument('--info', action='store_true',
                       help='Print camera information and exit')
    parser.add_argument('--json', action='store_true',
                       help='Print camera information in raw JSON format')
    args = parser.parse_args()

    if args.info:
        camera = CameraStream(args.camera_id)
        info = camera.get_camera_info()
        
        if args.json:
            print(json.dumps(info, indent=2))
        else:
            print("\nAvailable Cameras:")
            print("==================")
            for cam in info['cameras']:
                print(f"\nName: {cam['name']}")
                print(f"Type: {cam['type']}")
                print(f"Devices: {', '.join(cam['devices'])}")
                if 'capabilities' in cam:
                    print(f"Capabilities: {cam['capabilities']}")
                if 'usb_path' in cam:
                    print(f"USB Path: {cam['usb_path']}")
            
            if info['other_devices']:
                print("\nOther Video Devices:")
                print("===================")
                for dev in info['other_devices']:
                    print(f"\nName: {dev['name']}")
                    print(f"Type: {dev['type']}")
                    print(f"Devices: {', '.join(dev['devices'])}")
        return

    stream_camera(args)

if __name__ == "__main__":
    main()
