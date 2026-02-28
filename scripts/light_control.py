#!/usr/bin/env python3

import subprocess
import time
import sys
import json

def control_light(pin, state, duration=0):
    """
    Control an LED or relay using pinctrl for persistent GPIO state.

    Uses 'pinctrl' to write directly to GPIO registers so the output
    state survives after the Python process exits.  lgpio releases
    pins on handle close, which causes relays to snap back to their
    pull-up/pull-down default — pinctrl does not have this problem.

    Args:
        pin: GPIO pin number (0-27)
        state: 'on' or 'off'
        duration: Optional duration in milliseconds (0 means indefinite)
    """
    try:
        # Validate pin
        try:
            pin_num = int(pin)
            if not 0 <= pin_num <= 27:
                raise ValueError(f"Pin must be between 0 and 27. Got {pin_num}")
        except ValueError as e:
            raise ValueError(f"Invalid pin number: {str(e)}")

        # Validate state
        if state.lower() not in ['on', 'off']:
            raise ValueError("State must be 'on' or 'off'")

        if state.lower() == 'on':
            # Set pin as output, drive high
            subprocess.run(['pinctrl', 'set', str(pin_num), 'op', 'dh'],
                           check=True, capture_output=True, text=True)
            print(json.dumps({"status": "success", "message": f"Light on pin {pin_num} turned on"}), flush=True)

            # If duration specified, wait and then turn off
            if duration and int(duration) > 0:
                time.sleep(int(duration) / 1000.0)
                subprocess.run(['pinctrl', 'set', str(pin_num), 'op', 'dl'],
                               check=True, capture_output=True, text=True)
                print(json.dumps({"status": "success", "message": f"Light on pin {pin_num} turned off after {duration}ms"}), flush=True)

        elif state.lower() == 'off':
            # Set pin as output, drive low
            subprocess.run(['pinctrl', 'set', str(pin_num), 'op', 'dl'],
                           check=True, capture_output=True, text=True)
            print(json.dumps({"status": "success", "message": f"Light on pin {pin_num} turned off"}), flush=True)

    except subprocess.CalledProcessError as e:
        print(json.dumps({"status": "error", "message": f"pinctrl failed: {e.stderr or e.stdout or str(e)}"}), flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "status": "error",
            "message": "Usage: python light_control.py <pin> <state> [duration_ms]"}),
            flush=True)
        sys.exit(1)

    try:
        pin = sys.argv[1]
        state = sys.argv[2]
        duration = 0

        # Parse optional duration
        if len(sys.argv) >= 4:
            duration = int(sys.argv[3])

        control_light(pin, state, duration)
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }), flush=True)
        sys.exit(1)
