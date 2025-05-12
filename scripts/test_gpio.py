#!/usr/bin/env python3
import lgpio
import json
import sys
import time
import os

# Default test pins
TEST_PINS = {
    'digitalOut': 27,
    'digitalIn': 22,
    'pwm': 19,
    'servo': 10,
    'motion': 25
}

# Function to check if pins are already in use
def get_used_pins():
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'parts.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                parts = json.load(f)
                used_pins = set()
                for part in parts:
                    if 'pin' in part:
                        used_pins.add(int(part['pin']))
                    if 'gpioPin' in part:
                        used_pins.add(int(part['gpioPin']))
                    if 'directionPin' in part:
                        used_pins.add(int(part['directionPin']))
                    if 'pwmPin' in part:
                        used_pins.add(int(part['pwmPin']))
                return used_pins
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Error reading pin configuration: {str(e)}"}), flush=True)
    return set()  # Return empty set if file doesn't exist or other error

def check_pin_available(pin):
    """Check if a pin is available for use"""
    try:
        pin = int(pin)
        used_pins = get_used_pins()
        
        if pin in used_pins:
            return False, "Pin already assigned in configuration"
            
        # Try to open the GPIO chip and claim the pin
        try:
            h = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(h, pin)
            lgpio.gpio_free(h, pin)
            lgpio.gpiochip_close(h)
            return True, "Pin is available"
        except Exception as e:
            return False, f"Pin hardware error: {str(e)}"
    except Exception as e:
        return False, f"Error checking pin: {str(e)}"

def test_gpio_output(pin):
    """Test basic digital output"""
    try:
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(h, pin)
        
        # Turn on
        lgpio.gpio_write(h, pin, 1)
        time.sleep(0.5)
        
        # Turn off
        lgpio.gpio_write(h, pin, 0)
        
        # Clean up
        lgpio.gpio_free(h, pin)
        lgpio.gpiochip_close(h)
        
        print(json.dumps({"status": "success", "test": "digital_output", "pin": pin}), flush=True)
        return True
    except Exception as e:
        print(json.dumps({"status": "error", "test": "digital_output", "pin": pin, "error": str(e)}), flush=True)
        return False

def test_gpio_input(pin):
    """Test digital input with pull-up"""
    try:
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_UP)
        
        # Read state
        state = lgpio.gpio_read(h, pin)
        
        # Clean up
        lgpio.gpio_free(h, pin)
        lgpio.gpiochip_close(h)
        
        print(json.dumps({"status": "success", "test": "digital_input", "pin": pin, "state": state == 0}), flush=True)
        return True
    except Exception as e:
        print(json.dumps({"status": "error", "test": "digital_input", "pin": pin, "error": str(e)}), flush=True)
        return False

def test_pwm_output(pin):
    """Test PWM output"""
    try:
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(h, pin)
        
        # Test different duty cycles (0-255 range)
        for duty in [0, 128, 255, 0]:
            lgpio.tx_pwm(h, pin, 800, duty)  # 800Hz frequency
            time.sleep(0.5)
        
        # Clean up
        lgpio.tx_pwm(h, pin, 800, 0)
        lgpio.gpio_free(h, pin)
        lgpio.gpiochip_close(h)
        
        print(json.dumps({"status": "success", "test": "pwm_output", "pin": pin}), flush=True)
        return True
    except Exception as e:
        print(json.dumps({"status": "error", "test": "pwm_output", "pin": pin, "error": str(e)}), flush=True)
        return False

def test_servo(pin):
    """Test servo control"""
    try:
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(h, pin)
        
        # Standard servo pulses are 1000-2000µs = 1-2ms
        # We'll map angles -90 to 90 to pulse widths 1000 to 2000
        # Mid-point (0 degrees) = 1500µs
        
        # Test different angles
        angles = [0, 45, -45, 0]
        for angle in angles:
            # Map -90 to 90 angle range to 1000 to 2000 pulse width (in μs)
            pulse_width = 1500 + (angle * 500 // 90)
            
            # Send pulse 50 times (simulates 50Hz servo control)
            for _ in range(50):
                lgpio.gpio_write(h, pin, 1)
                time.sleep(pulse_width / 1000000.0)  # Convert μs to seconds
                lgpio.gpio_write(h, pin, 0)
                time.sleep(0.02 - (pulse_width / 1000000.0))  # Rest of 20ms frame
        
        # Clean up
        lgpio.gpio_free(h, pin)
        lgpio.gpiochip_close(h)
        
        print(json.dumps({"status": "success", "test": "servo", "pin": pin}), flush=True)
        return True
    except Exception as e:
        print(json.dumps({"status": "error", "test": "servo", "pin": pin, "error": str(e)}), flush=True)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "status": "error", 
            "message": "Usage: python test_gpio.py <command> [pin]\n  Commands: check, digital_out, digital_in, pwm, servo"
        }), flush=True)
        sys.exit(1)

    command = sys.argv[1].lower()
    
    # Check pin command doesn't need a specific test
    if command == "check":
        if len(sys.argv) != 3:
            print(json.dumps({"status": "error", "message": "Usage: python test_gpio.py check <pin>"}), flush=True)
            sys.exit(1)
            
        try:
            pin = int(sys.argv[2])
            available, message = check_pin_available(pin)
            print(json.dumps({
                "status": "success" if available else "error",
                "available": available,
                "message": message,
                "pin": pin
            }), flush=True)
            sys.exit(0 if available else 1)
        except ValueError:
            print(json.dumps({"status": "error", "message": "Invalid pin number"}), flush=True)
            sys.exit(1)
    
    # Other test commands
    if len(sys.argv) != 3:
        print(json.dumps({
            "status": "error", 
            "message": "Usage: python test_gpio.py <test_type> <pin>\n  test_type can be: digital_out, digital_in, pwm, servo"
        }), flush=True)
        sys.exit(1)
        
    try:
        pin = int(sys.argv[2])
    except ValueError:
        print(json.dumps({"status": "error", "message": "Invalid pin number"}), flush=True)
        sys.exit(1)

    test_map = {
        "digital_out": test_gpio_output,
        "digital_in": test_gpio_input,
        "pwm": test_pwm_output,
        "servo": test_servo
    }

    if command not in test_map:
        print(json.dumps({"status": "error", "message": f"Unknown test type: {command}"}), flush=True)
        sys.exit(1)

    success = test_map[command](pin)
    sys.exit(0 if success else 1)
