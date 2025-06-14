#!/usr/bin/env python3
"""
Simple GPIO Cleanup for ChatterPi
Quick and direct GPIO resource cleanup
"""

import os
import sys
import subprocess
import signal
import time

def kill_port_8765():
    """Kill processes using port 8765"""
    try:
        print("🔌 Cleaning up port 8765...")
        result = subprocess.run(['lsof', '-ti:8765'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
            for pid in pids:
                try:
                    print(f"Killing process {pid} using port 8765")
                    os.kill(int(pid), signal.SIGTERM)
                except:
                    pass
            time.sleep(1)
        print("✅ Port 8765 cleanup completed")
    except Exception as e:
        print(f"Port cleanup error: {e}")

def cleanup_gpio():
    """Simple GPIO cleanup"""
    try:
        print("🧹 Cleaning up GPIO...")
        
        # Try lgpio cleanup
        try:
            import lgpio
            h = lgpio.gpiochip_open(0)
            try:
                lgpio.gpio_free(h, 18)
                print("✅ GPIO 18 freed via lgpio")
            except:
                pass
            lgpio.gpiochip_close(h)
        except ImportError:
            print("lgpio not available")
        except Exception as e:
            print(f"lgpio cleanup failed: {e}")
        
        # Try pigpio cleanup
        try:
            import pigpio
            pi = pigpio.pi()
            if pi.connected:
                pi.set_servo_pulsewidth(18, 0)
                pi.stop()
                print("✅ GPIO 18 cleaned up via pigpio")
        except ImportError:
            print("pigpio not available")
        except Exception as e:
            print(f"pigpio cleanup failed: {e}")
            
        print("✅ GPIO cleanup completed")
        
    except Exception as e:
        print(f"GPIO cleanup error: {e}")

def kill_jaw_processes():
    """Kill jaw-related processes"""
    try:
        print("🦴 Cleaning up jaw processes...")
        
        # Kill processes with 'jaw' in the name
        result = subprocess.run(['pgrep', '-f', 'jaw'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
            for pid in pids:
                try:
                    print(f"Killing jaw process {pid}")
                    os.kill(int(pid), signal.SIGTERM)
                except:
                    pass
            time.sleep(1)
        
        # Kill processes using gpio_jaw_server.py
        result = subprocess.run(['pgrep', '-f', 'gpio_jaw_server'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
            for pid in pids:
                try:
                    print(f"Killing GPIO jaw server {pid}")
                    os.kill(int(pid), signal.SIGTERM)
                except:
                    pass
            time.sleep(1)
            
        print("✅ Jaw process cleanup completed")
        
    except Exception as e:
        print(f"Process cleanup error: {e}")

def main():
    """Main cleanup function"""
    print("🧹 Starting simple GPIO cleanup...")
    
    # Step 1: Kill processes using port 8765
    kill_port_8765()
    
    # Step 2: Kill jaw-related processes
    kill_jaw_processes()
    
    # Step 3: Cleanup GPIO hardware
    cleanup_gpio()
    
    # Step 4: Wait a moment
    time.sleep(1)
    
    print("✅ Simple GPIO cleanup completed")
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⏹️ Cleanup interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        sys.exit(1)
