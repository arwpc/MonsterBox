#!/usr/bin/env python3
"""
GPIO Cleanup Utility for ChatterPi
Cleans up GPIO resources and kills conflicting processes
"""

import os
import sys
import subprocess
import signal
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def find_gpio_processes():
    """Find processes using GPIO"""
    try:
        # Look for processes using lgpio, pigpio, or GPIO-related libraries
        result = subprocess.run(['pgrep', '-f', 'gpio'], capture_output=True, text=True)
        pids = []
        if result.returncode == 0:
            pids.extend([int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()])
        
        # Also look for Python processes that might be using GPIO
        result = subprocess.run(['pgrep', '-f', 'jaw.*server'], capture_output=True, text=True)
        if result.returncode == 0:
            pids.extend([int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()])
        
        # Look for websocket servers on port 8765
        result = subprocess.run(['lsof', '-ti:8765'], capture_output=True, text=True)
        if result.returncode == 0:
            pids.extend([int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()])
        
        return list(set(pids))  # Remove duplicates
        
    except Exception as e:
        logger.error(f"Error finding GPIO processes: {e}")
        return []

def cleanup_gpio_hardware():
    """Cleanup GPIO hardware state"""
    try:
        logger.info("🧹 Cleaning up GPIO hardware state...")
        
        # Try to cleanup using lgpio if available
        cleanup_script = """
import sys
try:
    import lgpio
    # Try to cleanup GPIO 18
    try:
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_free(h, 18)
        lgpio.gpiochip_close(h)
        print("✅ GPIO 18 cleaned up via lgpio")
    except:
        pass
except ImportError:
    pass

# Try pigpio cleanup
try:
    import pigpio
    pi = pigpio.pi()
    if pi.connected:
        pi.set_servo_pulsewidth(18, 0)  # Stop PWM
        pi.stop()
        print("✅ GPIO 18 cleaned up via pigpio")
except ImportError:
    pass
except Exception as e:
    print(f"pigpio cleanup failed: {e}")
"""
        
        result = subprocess.run([sys.executable, '-c', cleanup_script], 
                              capture_output=True, text=True, timeout=5)
        
        if result.stdout:
            logger.info(result.stdout.strip())
        
        logger.info("✅ GPIO hardware cleanup completed")
        
    except Exception as e:
        logger.error(f"GPIO hardware cleanup failed: {e}")

def kill_conflicting_processes():
    """Kill processes that might be using GPIO"""
    pids = find_gpio_processes()
    
    if not pids:
        logger.info("No conflicting GPIO processes found")
        return True
    
    logger.info(f"Found {len(pids)} potentially conflicting processes: {pids}")
    
    # Try graceful shutdown first
    for pid in pids:
        try:
            logger.info(f"Sending SIGTERM to process {pid}")
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            logger.info(f"Process {pid} already terminated")
        except PermissionError:
            logger.warning(f"Permission denied killing process {pid}")
        except Exception as e:
            logger.error(f"Error terminating process {pid}: {e}")
    
    # Wait for graceful shutdown
    time.sleep(2)
    
    # Check what's still running
    remaining_pids = find_gpio_processes()
    
    if remaining_pids:
        logger.warning(f"Processes still running after SIGTERM: {remaining_pids}")
        
        # Force kill remaining processes
        for pid in remaining_pids:
            try:
                logger.info(f"Force killing process {pid}")
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except PermissionError:
                logger.warning(f"Permission denied force killing process {pid}")
            except Exception as e:
                logger.error(f"Error force killing process {pid}: {e}")
        
        time.sleep(1)
    
    # Final check
    final_pids = find_gpio_processes()
    if final_pids:
        logger.error(f"Failed to kill processes: {final_pids}")
        return False
    
    logger.info("✅ All conflicting processes terminated")
    return True

def cleanup_port_8765():
    """Cleanup processes using port 8765"""
    try:
        logger.info("🔌 Cleaning up port 8765...")
        
        # Kill processes using port 8765
        result = subprocess.run(['fuser', '-k', '8765/tcp'], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            logger.info("✅ Port 8765 cleaned up")
        else:
            logger.info("Port 8765 was not in use")
            
    except Exception as e:
        logger.error(f"Port cleanup failed: {e}")

def main():
    """Main cleanup function"""
    logger.info("🧹 Starting GPIO and process cleanup...")
    
    try:
        # Step 1: Kill conflicting processes
        logger.info("Step 1: Terminating conflicting processes...")
        kill_conflicting_processes()
        
        # Step 2: Cleanup port 8765
        logger.info("Step 2: Cleaning up port 8765...")
        cleanup_port_8765()
        
        # Step 3: Cleanup GPIO hardware
        logger.info("Step 3: Cleaning up GPIO hardware...")
        cleanup_gpio_hardware()
        
        # Step 4: Wait a moment for cleanup to complete
        logger.info("Step 4: Waiting for cleanup to complete...")
        time.sleep(1)
        
        logger.info("✅ GPIO cleanup completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"❌ GPIO cleanup failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
