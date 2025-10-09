#!/usr/bin/env python3
"""
Motion Detection CLI Wrapper for MonsterBox 4.0
Continuously monitors a PIR motion sensor and reports state changes.

Usage:
  motion_detect_cli.py detect <gpioPin> <duration_seconds>
"""
import sys
import json
import time

try:
    import lgpio
except Exception as e:
    print(json.dumps({"status": "error", "message": f"lgpio not available: {str(e)}"}))
    sys.exit(1)


def detect_motion(pin, duration):
    """
    Monitor motion sensor for specified duration and report state changes.
    
    Args:
        pin: GPIO pin number
        duration: How long to monitor in seconds (0 = indefinite)
    """
    h = None
    try:
        pin = int(pin)
        duration = float(duration)
        
        if pin < 0 or pin > 27:
            raise ValueError(f"Pin must be between 0 and 27. Got {pin}")
        
        # Open chip and configure pin as input with pull-down
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_DOWN)
        
        # Send start message
        print(json.dumps({
            "status": "started",
            "pin": pin,
            "duration": duration,
            "message": f"Monitoring motion on pin {pin}"
        }), flush=True)
        
        start_time = time.time()
        last_state = None
        detection_count = 0
        
        while True:
            # Check duration limit
            if duration > 0 and time.time() - start_time >= duration:
                print(json.dumps({
                    "status": "completed",
                    "pin": pin,
                    "duration": duration,
                    "detections": detection_count,
                    "message": "Motion detection completed"
                }), flush=True)
                break
            
            # Read current state
            current_state = lgpio.gpio_read(h, pin) == 1
            
            # Report state changes
            if current_state != last_state:
                if current_state:
                    detection_count += 1
                    print(json.dumps({
                        "status": "motion_detected",
                        "pin": pin,
                        "value": 1,
                        "timestamp": time.time(),
                        "detection_count": detection_count,
                        "message": "Motion detected!"
                    }), flush=True)
                else:
                    print(json.dumps({
                        "status": "motion_cleared",
                        "pin": pin,
                        "value": 0,
                        "timestamp": time.time(),
                        "message": "No motion"
                    }), flush=True)
                
                last_state = current_state
            
            # Small delay to reduce CPU usage
            time.sleep(0.1)
        
        sys.exit(0)
        
    except KeyboardInterrupt:
        print(json.dumps({
            "status": "stopped",
            "pin": pin,
            "message": "Motion detection stopped by user"
        }), flush=True)
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }), flush=True)
        sys.exit(1)
        
    finally:
        try:
            if h is not None:
                lgpio.gpio_free(h, pin)
                lgpio.gpiochip_close(h)
        except Exception:
            pass


def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "status": "error",
            "message": "Usage: motion_detect_cli.py detect <gpioPin> <duration_seconds>"
        }))
        sys.exit(1)
    
    cmd = sys.argv[1]
    if cmd != 'detect':
        print(json.dumps({
            "status": "error",
            "message": f"Unknown command: {cmd}. Use 'detect'"
        }))
        sys.exit(1)
    
    detect_motion(sys.argv[2], sys.argv[3])


if __name__ == '__main__':
    main()

