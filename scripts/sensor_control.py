from gpiozero import DigitalInputDevice
import json
import sys
import signal
import time

def control_sensor(gpio_pin):
    try:
        sensor = DigitalInputDevice(gpio_pin)
        print(json.dumps({"status": f"Monitoring sensor on GPIO pin {gpio_pin}"}))
        
        def signal_handler(signum, frame):
            raise KeyboardInterrupt
        
        signal.signal(signal.SIGINT, signal_handler)
        
        while True:
            current_status = sensor.value
            status_text = "HIGH" if current_status else "LOW"
            print(json.dumps({
                "pin": gpio_pin,
                "status": status_text,
                "timestamp": time.time()
            }))
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print(json.dumps({"status": "Monitoring stopped"}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        # gpiozero handles cleanup automatically

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python sensor_control.py <gpio_pin>"}))
        sys.exit(1)
        
    try:
        gpio_pin = int(sys.argv[1])
        control_sensor(gpio_pin)
    except ValueError:
        print(json.dumps({"error": "Invalid GPIO pin number"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)