#!/usr/bin/env python3

import os
import time
import fcntl
import logging
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CameraLock:
    """Handle camera device locking to prevent concurrent access."""
    
    def __init__(self, device_id: int = 0):
        self.device_id = device_id
        self.device_path = f"/dev/video{device_id}"
        self.lock_path = f"/tmp/camera_{device_id}.lock"
        self.lock_file: Optional[object] = None

    def acquire(self) -> bool:
        """Acquire lock on camera device."""
        try:
            # Clean up stale lock file
            if os.path.exists(self.lock_path):
                try:
                    with open(self.lock_path, 'r') as f:
                        pid = int(f.read().strip())
                        try:
                            os.kill(pid, 0)
                        except OSError:
                            os.remove(self.lock_path)
                except (OSError, ValueError):
                    try:
                        os.remove(self.lock_path)
                    except OSError:
                        pass

            # Add delay before acquiring lock
            time.sleep(0.5)

            self.lock_file = open(self.lock_path, 'w')
            fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
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

    def release(self):
        """Release lock on camera device."""
        try:
            if self.lock_file:
                fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_UN)
                self.lock_file.close()
                self.lock_file = None
                try:
                    os.remove(self.lock_path)
                except OSError:
                    pass
                # Add delay after releasing lock
                time.sleep(0.5)
                logger.info(f"Released camera lock for device {self.device_id}")
        except Exception as e:
            logger.error(f"Error releasing camera lock: {e}")
