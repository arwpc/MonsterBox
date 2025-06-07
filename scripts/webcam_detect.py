#!/usr/bin/env python3
"""
Webcam Detection Script for MonsterBox
Detects available camera devices on the system and returns their information.
"""

import json
import sys
import os
import cv2
import subprocess
import logging
from typing import List, Dict, Any

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_v4l2_devices() -> List[Dict[str, Any]]:
    """Get video devices using v4l2-ctl command."""
    devices = []
    try:
        # Run v4l2-ctl to list devices
        result = subprocess.run(['v4l2-ctl', '--list-devices'], 
                              capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            current_device = None
            
            for line in lines:
                line = line.strip()
                if line and not line.startswith('\t') and not line.startswith(' '):
                    # This is a device name line
                    current_device = {
                        'name': line.split('(')[0].strip(),
                        'paths': []
                    }
                elif line.startswith('\t/dev/video') or line.startswith(' /dev/video'):
                    # This is a device path
                    if current_device:
                        device_path = line.strip()
                        current_device['paths'].append(device_path)
                        
                        # Extract device ID from path
                        try:
                            device_id = int(device_path.split('video')[1])
                            device_info = {
                                'id': device_id,
                                'name': current_device['name'],
                                'path': device_path,
                                'available': True
                            }
                            devices.append(device_info)
                        except (ValueError, IndexError):
                            logger.warning(f"Could not parse device ID from {device_path}")
                            
    except subprocess.TimeoutExpired:
        logger.error("v4l2-ctl command timed out")
    except FileNotFoundError:
        logger.warning("v4l2-ctl not found, falling back to basic detection")
    except Exception as e:
        logger.error(f"Error running v4l2-ctl: {e}")
    
    return devices

def get_opencv_devices() -> List[Dict[str, Any]]:
    """Get video devices using OpenCV detection."""
    devices = []

    # Test device IDs 0-9 (most systems won't have more than 10 cameras)
    for device_id in range(10):
        device_path = f'/dev/video{device_id}'

        # Check if device file exists
        if not os.path.exists(device_path):
            continue

        # Check if device is in use
        device_in_use = is_device_in_use(device_path)

        try:
            cap = cv2.VideoCapture(device_id, cv2.CAP_V4L2)
            if cap.isOpened():
                # Try to read a frame to verify the camera works
                ret, frame = cap.read()
                if ret and frame is not None:
                    # Get camera properties
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = int(cap.get(cv2.CAP_PROP_FPS))

                    device_info = {
                        'id': device_id,
                        'name': f'Camera {device_id}',
                        'path': device_path,
                        'available': True,
                        'in_use': device_in_use,
                        'width': width,
                        'height': height,
                        'fps': fps
                    }
                    devices.append(device_info)
                    logger.info(f"Detected camera {device_id}: {width}x{height} @ {fps}fps")

                cap.release()
            elif device_in_use:
                # Device exists but is in use - still report it
                device_info = {
                    'id': device_id,
                    'name': f'Camera {device_id} (In Use)',
                    'path': device_path,
                    'available': False,
                    'in_use': True,
                    'width': 640,  # Default values
                    'height': 480,
                    'fps': 30,
                    'note': 'Device currently in use by another process'
                }
                devices.append(device_info)
                logger.info(f"Found camera {device_id} (currently in use)")
            else:
                logger.debug(f"Device {device_id} not available")

        except Exception as e:
            if device_in_use:
                # Device exists but is in use - still report it
                device_info = {
                    'id': device_id,
                    'name': f'Camera {device_id} (In Use)',
                    'path': device_path,
                    'available': False,
                    'in_use': True,
                    'width': 640,  # Default values
                    'height': 480,
                    'fps': 30,
                    'note': 'Device currently in use by another process'
                }
                devices.append(device_info)
                logger.info(f"Found camera {device_id} (currently in use)")
            else:
                logger.debug(f"Error testing device {device_id}: {e}")
            continue

    return devices

def is_device_in_use(device_path: str) -> bool:
    """Check if a device is currently in use by another process."""
    try:
        result = subprocess.run(['lsof', device_path],
                              capture_output=True, text=True, timeout=5)
        return result.returncode == 0 and len(result.stdout.strip()) > 0
    except Exception:
        return False

def verify_device_access(device_path: str) -> bool:
    """Verify that we can access the device file."""
    try:
        return os.path.exists(device_path) and os.access(device_path, os.R_OK)
    except Exception:
        return False

def get_device_capabilities(device_id: int) -> Dict[str, Any]:
    """Get detailed capabilities for a specific device."""
    capabilities = {
        'resolutions': [],
        'formats': [],
        'controls': []
    }
    
    try:
        # Use v4l2-ctl to get device capabilities
        result = subprocess.run(['v4l2-ctl', '-d', f'/dev/video{device_id}', '--list-formats-ext'], 
                              capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            current_format = None
            
            for line in lines:
                line = line.strip()
                if 'Pixel Format:' in line:
                    # Extract format info
                    format_info = line.split("'")[1] if "'" in line else 'Unknown'
                    capabilities['formats'].append(format_info)
                elif 'Size:' in line and 'Discrete' in line:
                    # Extract resolution info
                    try:
                        size_part = line.split('Size: Discrete ')[1]
                        resolution = size_part.split()[0]
                        if 'x' in resolution:
                            capabilities['resolutions'].append(resolution)
                    except (IndexError, ValueError):
                        pass
                        
    except Exception as e:
        logger.debug(f"Could not get capabilities for device {device_id}: {e}")
    
    return capabilities

def detect_cameras() -> Dict[str, Any]:
    """Main camera detection function."""
    logger.info("Starting camera detection...")
    
    # Try v4l2 detection first (more detailed)
    v4l2_devices = get_v4l2_devices()
    
    # Fall back to OpenCV detection
    opencv_devices = get_opencv_devices()
    
    # Merge results, preferring v4l2 data when available
    detected_cameras = {}
    
    # Add v4l2 devices
    for device in v4l2_devices:
        device_id = device['id']
        detected_cameras[device_id] = device
        
        # Verify device access
        device['accessible'] = verify_device_access(device['path'])
        
        # Get capabilities
        device['capabilities'] = get_device_capabilities(device_id)
    
    # Add OpenCV devices not found by v4l2
    for device in opencv_devices:
        device_id = device['id']
        if device_id not in detected_cameras:
            detected_cameras[device_id] = device
            device['accessible'] = verify_device_access(device['path'])
            device['capabilities'] = get_device_capabilities(device_id)
    
    # Convert to sorted list
    cameras = [detected_cameras[device_id] for device_id in sorted(detected_cameras.keys())]

    # Include all cameras (accessible and in-use)
    all_cameras = cameras
    accessible_cameras = [cam for cam in cameras if cam.get('accessible', False)]
    in_use_cameras = [cam for cam in cameras if cam.get('in_use', False)]

    result = {
        'success': True,
        'cameras': all_cameras,  # Return all cameras, not just accessible ones
        'total_detected': len(cameras),
        'accessible_count': len(accessible_cameras),
        'in_use_count': len(in_use_cameras),
        'message': f'Found {len(cameras)} camera(s): {len(accessible_cameras)} accessible, {len(in_use_cameras)} in use'
    }
    
    logger.info(f"Camera detection complete: {result['message']}")
    return result

def main():
    """Main entry point."""
    try:
        result = detect_cameras()
        print(json.dumps(result, indent=2))
        sys.exit(0)
    except Exception as e:
        error_result = {
            'success': False,
            'cameras': [],
            'error': str(e),
            'message': f'Camera detection failed: {e}'
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == '__main__':
    main()
