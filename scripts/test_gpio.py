#!/usr/bin/env python3
from gpiozero import LED, Button, PWMOutputDevice, AngularServo
import json
import sys
import time

def test_gpio_output(pin):
    """Test basic digital output"""
    try:
        led = LED(pin)
        led.on()
        time.sleep(0.5)
        led.off()
        print(json.dumps({"status": "success", "test": "digital_output", "pin": pin}))
        return True
    except Exception as e:
        print(json.dumps({"error": str(e), "test": "digital_output", "pin": pin}), file=sys.stderr)
        return False

def test_gpio_input(pin):
    """Test digital input with pull-up"""
    try:
        button = Button(pin, pull_up=True)
        state = button.is_pressed
        print(json.dumps({"status": "success", "test": "digital_input", "pin": pin, "state": state}))
        return True
    except Exception as e:
        print(json.dumps({"error": str(e), "test": "digital_input", "pin": pin}), file=sys.stderr)
        return False

def test_pwm_output(pin):
    """Test PWM output"""
    try:
        pwm = PWMOutputDevice(pin)
        # Test different duty cycles
        for duty in [0, 0.5, 1.0, 0]:
            pwm.value = duty
            time.sleep(0.5)
        pwm.off()
        print(json.dumps({"status": "success", "test": "pwm_output", "pin": pin}))
        return True
    except Exception as e:
        print(json.dumps({"error": str(e), "test": "pwm_output", "pin": pin}), file=sys.stderr)
        return False

def test_servo(pin):
    """Test servo control"""
    try:
        servo = AngularServo(pin, min_angle=-90, max_angle=90)
        # Test different angles
        for angle in [0, 45, -45, 0]:
            servo.angle = angle
            time.sleep(0.5)
        servo.detach()
        print(json.dumps({"status": "success", "test": "servo", "pin": pin}))
        return True
    except Exception as e:
        print(json.dumps({"error": str(e), "test": "servo", "pin": pin}), file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: python test_gpio.py <test_type> <pin>"}), file=sys.stderr)
        print(json.dumps({"info": "test_type can be: digital_out, digital_in, pwm, servo"}), file=sys.stderr)
        sys.exit(1)

    test_type = sys.argv[1].lower()
    try:
        pin = int(sys.argv[2])
    except ValueError:
        print(json.dumps({"error": "Invalid pin number"}), file=sys.stderr)
        sys.exit(1)

    test_map = {
        "digital_out": test_gpio_output,
        "digital_in": test_gpio_input,
        "pwm": test_pwm_output,
        "servo": test_servo
    }

    if test_type not in test_map:
        print(json.dumps({"error": f"Unknown test type: {test_type}"}), file=sys.stderr)
        sys.exit(1)

    success = test_map[test_type](pin)
    sys.exit(0 if success else 1)
