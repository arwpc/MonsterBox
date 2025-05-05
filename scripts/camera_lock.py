#!/usr/bin/env python3

import os
import sys
import time
import fcntl
import logging
import subprocess
import json
from typing import Optional, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to keep stdout clean
)
logger = logging.getLogger(__name__)

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_id: int = 0):
        self.device_id = device_id
        self.device_path = f"/dev/video{device_id}"
        self.lock_path = f"/tmp/camera_{device_id}.lock"
        self.lock_file: Optional[object] = None

    def verify_device(self) -> Dict[str, Any]:
        """Verify camera device and get capabilities."""
        try:
            if not os.path.exists(self.device_path):
                return {
                    "success": False,
                    "error": f"Camera device {self.device_path} does not exist"
                }
            
            if not os.access(self.device_path, os.R_OK | os.W_OK):
                return {
                    "success": False,
                    "error": f"Insufficient permissions for {self.device_path}"
                }
                
            # Check device capabilities with v4l2-ctl
            try:
                # Redirect stderr to suppress v4l2-ctl debug output
                with open(os.devnull, 'w') as devnull:
                    # List supported formats
                    formats = subprocess.check_output(
                        ['v4l2-ctl', '-d', self.device_path, '--list-formats-ext'],
                        stderr=devnull
                    ).decode()
                    
                    # Get current settings
                    settings = subprocess.check_output(
                        ['v4l2-ctl', '-d', self.device_path, '--all'],
                        stderr=devnull
                    ).decode()
                
                # Log device info to stderr
                logger.info(f"Device {self.device_path} capabilities:")
                logger.info(f"Supported formats:\n{formats}")
                logger.info(f"Current settings:\n{settings}")
                
                # Check if MJPG format is supported
                if 'MJPG' not in formats:
                    return {
                        "success": False,
                        "error": "Camera does not support MJPG format"
                    }
                    
                return {
                    "success": True,
                    "device": self.device_path,
                    "formats": ["MJPG" if "MJPG" in formats else None, 
                              "YUYV" if "YUYV" in formats else None,
                              "H264" if "H264" in formats else None],
                    "capabilities": {
                        "video_capture": True,
                        "streaming": True,
                        "mjpeg": "MJPG" in formats
                    }
                }
            except subprocess.CalledProcessError as e:
                logger.warning(f"v4l2-ctl error: {e}")
                return {
                    "success": True,  # Continue even if v4l2-ctl fails
                    "warning": "Could not verify camera capabilities",
                    "device": self.device_path
                }
                
        except Exception as e:
            logger.error(f"Error verifying camera device: {e}")
            return {
                "success": False,
                "error": str(e),
                "device": self.device_path
            }

    def check_stale_lock(self) -> bool:
        """Check and clean up stale lock file."""
        try:
            if os.path.exists(self.lock_path):
                try:
                    with open(self.lock_path, 'r') as f:
                        pid = int(f.read().strip())
                        try:
                            # Check if process is still running
                            os.kill(pid, 0)
                            # Process exists, lock is valid
                            logger.warning(f"Camera {self.device_id} is locked by process {pid}")
                            return False
                        except OSError:
                            # Process doesn't exist, lock is stale
                            os.remove(self.lock_path)
                            logger.info(f"Removed stale lock for camera {self.device_id}")
                            return True
                except (OSError, ValueError):
                    # Lock file is invalid
                    try:
                        os.remove(self.lock_path)
                        logger.info(f"Removed invalid lock for camera {self.device_id}")
                    except OSError:
                        pass
                    return True
            return True
        except Exception as e:
            logger.error(f"Error checking lock file: {e}")
            return False

    def acquire(self) -> bool:
        """Acquire lock on camera device."""
        try:
            # Verify device first
            result = self.verify_device()
            if not result["success"]:
                logger.error(result["error"])
                return False

            # Check and clean up stale lock
            if not self.check_stale_lock():
                return False

            # Add delay before acquiring lock
            time.sleep(0.5)

            # Create lock file
            self.lock_file = open(self.lock_path, 'w')
            
            try:
                # Try to acquire exclusive lock
                fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except IOError:
                # Lock acquisition failed
                self.lock_file.close()
                self.lock_file = None
                logger.error(f"Camera {self.device_id} is in use by another process")
                return False

            # Write PID to lock file
            self.lock_file.write(str(os.getpid()))
            self.lock_file.flush()
            
            logger.info(f"Acquired camera lock for device {self.device_id}")
            return True
            
        except (IOError, OSError) as e:
            if self.lock_file:
                self.lock_file.close()
                self.lock_file = None
            logger.error(f"Failed to acquire camera lock: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error acquiring camera lock: {e}")
            return False

    def release(self):
        """Release lock on camera device."""
        try:
            if self.lock_file:
                try:
                    # Release the lock
                    fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_UN)
                except IOError as e:
                    logger.warning(f"Error releasing file lock: {e}")
                
                try:
                    # Close the file
                    self.lock_file.close()
                except IOError as e:
                    logger.warning(f"Error closing lock file: {e}")
                
                self.lock_file = None
                
                try:
                    # Remove the lock file
                    os.remove(self.lock_path)
                except OSError as e:
                    logger.warning(f"Error removing lock file: {e}")
                
                # Add delay after releasing lock
                time.sleep(0.5)
                logger.info(f"Released camera lock for device {self.device_id}")
        except Exception as e:
            logger.error(f"Error releasing camera lock: {e}")

    def __enter__(self):
        """Context manager entry."""
        if not self.acquire():
            raise RuntimeError(f"Failed to acquire lock for camera {self.device_id}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release()
        if exc_val:
            logger.error(f"Error during camera operation: {exc_val}")
