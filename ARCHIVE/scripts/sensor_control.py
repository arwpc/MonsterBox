sudo apt-get update
sudo apt-get install -y python3-gpiozero python3-pigpio pigpiofrom gpiozero import DigitalInputDevice
import json
import sys
import signal
import time

def control_sensor(gpio_pin):
    sensor = None
    try:
        # Initialize sensor with pull_up=True for better reliability
        sensor = DigitalInputDevice(gpio_pin, pull_up=True)
        print(json.dumps({"status": f"Monitoring sensor on GPIO pin {gpio_pin}"}))
        
        def signal_handler(signum, frame):
            raise KeyboardInterrupt
        
        signal.signal(signal.SIGINT, signal_handler)
        
        last_status = None
        while True:
            current_status = sensor.value
            # Only print when status changes to reduce noise
            if current_status != last_status:
                status_text = "Motion Detected" if current_status else "No Motion"
                print(json.dumps({
                    "pin": gpio_pin,
                    "status": status_text,
                    "timestamp": time.time()
                }))
                last_status = current_status
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print(json.dumps({"status": "Monitoring stopped"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        if sensor:
            sensor.close()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python sensor_control.py <gpio_pin>"}))
        sys.exit(1)
    
    try:
        gpio_pin = int(sys.argv[1])
        if gpio_pin < 0 or gpio_pin > 40:
            raise ValueError("GPIO pin must be between 0 and 40")
        control_sensor(gpio_pin)
    except ValueError as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)