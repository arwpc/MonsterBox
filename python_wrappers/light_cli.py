#!/usr/bin/env python3

"""
Light CLI Wrapper for MonsterBox 4.0
Thin wrapper that calls scripts/light_control.py with simple args
"""

import sys
import os
import json

# Add the scripts directory to Python path (repo root)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

try:
    from light_control import control_light
except ImportError as e:
    print(json.dumps({"status": "error", "message": f"Import error: {e}"}))
    sys.exit(1)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "status": "error",
            "message": "Usage: light_cli.py <pin> <on|off> [duration_ms]"
        }))
        sys.exit(1)

    pin = sys.argv[1]
    state = sys.argv[2]
    duration = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    try:
        control_light(pin, state, duration)
        # control_light prints its own JSON; success path exits 0 here
        sys.exit(0)
    except SystemExit as e:
        # If underlying script exited, propagate its code
        sys.exit(e.code)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

