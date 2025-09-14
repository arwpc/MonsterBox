#!/usr/bin/env python3

"""
LED CLI Wrapper for MonsterBox 4.0
Thin wrapper that calls scripts/led_control.py with simple args
"""

import sys
import os
import json

# Add the scripts directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../scripts'))

try:
    from led_control import control_led
except ImportError as e:
    print(json.dumps({"status": "error", "message": f"Import error: {e}"}))
    sys.exit(1)


def main():
    if len(sys.argv) < 2 or len(sys.argv) > 4:
        print(json.dumps({
            "status": "error",
            "message": "Usage: led_cli.py <pin> [brightness] [duration_ms]"
        }))
        sys.exit(1)

    try:
        pin = int(sys.argv[1])
        brightness = float(sys.argv[2]) if len(sys.argv) > 2 else 100
        duration = float(sys.argv[3]) if len(sys.argv) > 3 else None

        control_led(pin, brightness, duration)
        # control_led prints JSON and exits 0 on success
        sys.exit(0)
    except SystemExit as e:
        sys.exit(e.code)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

