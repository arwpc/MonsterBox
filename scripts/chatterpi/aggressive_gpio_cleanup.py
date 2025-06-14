#!/usr/bin/env python3
"""
Aggressive GPIO Cleanup for ChatterPi
Comprehensive cleanup including system-level GPIO state reset
"""

import os
import sys
import subprocess
import signal
import time
import glob

def kill_all_gpio_processes():
    """Kill all GPIO-related processes"""
    try:
        print("🔥 Killing all GPIO-related processes...")
        
        # Kill by process name patterns
        patterns = [
            'gpio',
            'pigpio',
            'lgpio', 
            'jaw',
            'servo',
            'websocket.*8765',
            'python.*gpio',
            'python.*jaw'
        ]
        
        for pattern in patterns:
            try:
                result = subprocess.run(['pgrep', '-f', pattern], capture_output=True, text=True)
                if result.returncode == 0 and result.stdout.strip():
                    pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
                    for pid in pids:
                        try:
                            print(f"Killing process {pid} (pattern: {pattern})")
                            os.kill(int(pid), signal.SIGKILL)  # Use SIGKILL for immediate termination
                        except:
                            pass
            except:
                pass
        
        # Kill processes using port 8765
        try:
            result = subprocess.run(['lsof', '-ti:8765'], capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip():
                pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
                for pid in pids:
                    try:
                        print(f"Force killing process {pid} using port 8765")
                        os.kill(int(pid), signal.SIGKILL)
                    except:
                        pass
        except:
            pass
            
        time.sleep(2)
        print("✅ Process cleanup completed")
        
    except Exception as e:
        print(f"Process cleanup error: {e}")

def reset_gpio_system():
    """Reset GPIO system state"""
    try:
        print("🔄 Resetting GPIO system state...")
        
        # Method 1: Reset via sysfs
        try:
            gpio_paths = [
                '/sys/class/gpio/gpio18',
                '/sys/class/gpio/export',
                '/sys/class/gpio/unexport'
            ]
            
            # Unexport GPIO 18 if it exists
            if os.path.exists('/sys/class/gpio/gpio18'):
                print("Unexporting GPIO 18 via sysfs")
                with open('/sys/class/gpio/unexport', 'w') as f:
                    f.write('18')
                time.sleep(0.5)
                    
        except Exception as e:
            print(f"sysfs reset failed: {e}")
        
        # Method 2: Reset via gpiochip device
        try:
            print("Resetting gpiochip devices...")
            chip_paths = glob.glob('/dev/gpiochip*')
            for chip_path in chip_paths:
                print(f"Found GPIO chip: {chip_path}")
        except Exception as e:
            print(f"gpiochip reset failed: {e}")
            
        # Method 3: Kernel module reload (if possible)
        try:
            print("Attempting GPIO kernel module refresh...")
            # This might require sudo, so we'll try but not fail if it doesn't work
            subprocess.run(['sudo', 'modprobe', '-r', 'gpio_bcm2835'], 
                         capture_output=True, timeout=5)
            subprocess.run(['sudo', 'modprobe', 'gpio_bcm2835'], 
                         capture_output=True, timeout=5)
        except:
            pass  # This is optional and might not work without sudo
            
        print("✅ GPIO system reset completed")
        
    except Exception as e:
        print(f"GPIO system reset error: {e}")

def cleanup_gpio_libraries():
    """Cleanup GPIO library states"""
    try:
        print("📚 Cleaning up GPIO library states...")
        
        # Cleanup lgpio
        try:
            import lgpio
            print("Attempting lgpio cleanup...")
            
            # Try to open and close all possible chip handles
            for chip in range(5):  # Usually 0-4
                try:
                    h = lgpio.gpiochip_open(chip)
                    # Free GPIO 18 on this chip
                    try:
                        lgpio.gpio_free(h, 18)
                        print(f"Freed GPIO 18 on chip {chip}")
                    except:
                        pass
                    lgpio.gpiochip_close(h)
                except:
                    pass
                    
        except ImportError:
            print("lgpio not available")
        except Exception as e:
            print(f"lgpio cleanup failed: {e}")
        
        # Cleanup pigpio
        try:
            import pigpio
            print("Attempting pigpio cleanup...")
            pi = pigpio.pi()
            if pi.connected:
                pi.set_servo_pulsewidth(18, 0)  # Stop PWM
                pi.set_mode(18, pigpio.INPUT)   # Set as input
                pi.stop()
                print("pigpio cleanup completed")
        except ImportError:
            print("pigpio not available")
        except Exception as e:
            print(f"pigpio cleanup failed: {e}")
            
        # Cleanup RPi.GPIO if present
        try:
            import RPi.GPIO as GPIO
            print("Attempting RPi.GPIO cleanup...")
            GPIO.cleanup()
            print("RPi.GPIO cleanup completed")
        except ImportError:
            print("RPi.GPIO not available")
        except Exception as e:
            print(f"RPi.GPIO cleanup failed: {e}")
            
        print("✅ GPIO library cleanup completed")
        
    except Exception as e:
        print(f"GPIO library cleanup error: {e}")

def verify_cleanup():
    """Verify that cleanup was successful"""
    try:
        print("🔍 Verifying cleanup...")
        
        # Check for remaining processes
        result = subprocess.run(['pgrep', '-f', 'gpio.*jaw|jaw.*gpio'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            print(f"⚠️ Warning: Some processes still running: {result.stdout.strip()}")
        else:
            print("✅ No GPIO/jaw processes found")
        
        # Check port 8765
        result = subprocess.run(['lsof', '-ti:8765'], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            print(f"⚠️ Warning: Port 8765 still in use: {result.stdout.strip()}")
        else:
            print("✅ Port 8765 is free")
            
        # Test GPIO access
        try:
            import lgpio
            h = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(h, 18)
            lgpio.gpio_free(h, 18)
            lgpio.gpiochip_close(h)
            print("✅ GPIO 18 is accessible")
        except Exception as e:
            print(f"⚠️ GPIO 18 test failed: {e}")
            
    except Exception as e:
        print(f"Verification error: {e}")

def main():
    """Main aggressive cleanup function"""
    print("🔥 Starting aggressive GPIO cleanup...")
    print("This will forcefully terminate all GPIO-related processes")
    
    # Step 1: Kill all GPIO processes
    kill_all_gpio_processes()
    
    # Step 2: Reset GPIO system
    reset_gpio_system()
    
    # Step 3: Cleanup GPIO libraries
    cleanup_gpio_libraries()
    
    # Step 4: Wait for system to settle
    print("⏳ Waiting for system to settle...")
    time.sleep(3)
    
    # Step 5: Verify cleanup
    verify_cleanup()
    
    print("✅ Aggressive GPIO cleanup completed")
    print("You can now try starting the ChatterPi system")
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⏹️ Cleanup interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Aggressive cleanup failed: {e}")
        sys.exit(1)
