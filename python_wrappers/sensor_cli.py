#!/usr/bin/env python3
"""
Sensor CLI Wrapper for MonsterBox 5.5
- Performs a single digital read using lgpio (preferred) and returns JSON.
- No simulation fallback: on error, prints JSON error and exits non‑zero.

Usage:
  sensor_cli.py read <gpioPin>
"""
import sys
import json

try:
    import lgpio  # Requires lgpio to be installed on the system
except Exception as e:
    print(json.dumps({"status": "error", "message": f"lgpio not available: {str(e)}"}))
    sys.exit(1)


def read_pin(pin):
    h = None
    try:
        pin = int(pin)
        if pin < 0 or pin > 27:
            raise ValueError(f"Pin must be between 0 and 27. Got {pin}")
        # Open chip 0 and read the pin as input with pull-down (typical for PIR)
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_DOWN)
        value = 1 if lgpio.gpio_read(h, pin) == 1 else 0
        print(json.dumps({"status": "success", "pin": pin, "value": value}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
    finally:
        try:
            if h is not None:
                lgpio.gpio_free(h, pin)
                lgpio.gpiochip_close(h)
        except Exception:
            pass


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"status": "error", "message": "Usage: sensor_cli.py read <gpioPin>"}))
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd != 'read':
        print(json.dumps({"status": "error", "message": f"Unknown command: {cmd}"}))
        sys.exit(1)
    read_pin(sys.argv[2])


if __name__ == '__main__':
    main()

