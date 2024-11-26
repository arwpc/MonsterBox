from gpiozero import PWMLED
import time
import sys
import json

def control_led(pin, brightness=100, duration=None):
    """
    Control an LED with PWM brightness
    
    Args:
        pin: GPIO pin number
        brightness: brightness level (0-100)
        duration: duration in milliseconds (optional)
    """
    try:
        # Convert brightness to 0-1 range
        brightness_value = max(0, min(100, brightness)) / 100.0
        
        # Initialize LED with PWM
        led = PWMLED(pin)
        
        # Set brightness
        led.value = brightness_value
        print(json.dumps({
            "status": "success",
            "message": f"LED on pin {pin} set to {brightness}% brightness"
        }))
        
        # If duration specified, wait then turn off
        if duration is not None:
            time.sleep(duration / 1000.0)  # Convert ms to seconds
            led.off()
            print(json.dumps({
                "status": "success",
                "message": f"LED on pin {pin} turned off after {duration}ms"
            }))
            
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 4:
        print(json.dumps({
            "status": "error",
            "message": "Usage: python led_control.py <pin> [brightness] [duration]"
        }))
        sys.exit(1)
        
    try:
        pin = int(sys.argv[1])
        brightness = float(sys.argv[2]) if len(sys.argv) > 2 else 100
        duration = float(sys.argv[3]) if len(sys.argv) > 3 else None
        
        if not (0 <= brightness <= 100):
            raise ValueError("Brightness must be between 0 and 100")
        if duration is not None and duration < 0:
            raise ValueError("Duration must be positive")
            
        control_led(pin, brightness, duration)
        
    except ValueError as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))
        sys.exit(1)