#!/usr/bin/env python3

"""
Linear Actuator CLI Wrapper for MonsterBox 5.5
Calls scripts/linear_actuator_control.py with a simple, stable interface.
No simulation fallback: errors propagate with descriptive JSON.

Usage:
  actuator_cli.py control <directionPin> <pwmPin> <extend|retract> <speed> <duration_ms> [maxExtensionMs] [maxRetractionMs]
  actuator_cli.py stop <directionPin> <pwmPin>
"""

import sys
import os
import json

# Import the local linear actuator control module
try:
    from linear_actuator_control import control_actuator as _control_actuator
    CONTROL_AVAILABLE = True
except Exception as e:
    CONTROL_AVAILABLE = False
    _IMPORT_ERROR = str(e)


def _print_json(payload, exit_code=0):
    try:
        print(json.dumps(payload))
    except Exception:
        # Fallback minimal string if JSON serialization somehow fails
        print('{"status":"error","message":"Unserializable response"}')
        exit_code = 1
    sys.exit(exit_code)


def _map_direction(direction):
    d = str(direction).strip().lower()
    if d in ('extend', 'forward', 'fwd'):
        return 'forward'
    if d in ('retract', 'backward', 'back', 'rev', 'reverse'):
        return 'backward'
    raise ValueError("Invalid direction: {} (expected extend|retract)".format(direction))


def _derive_limits(args):
    # Optional limits (ms) for max extension/retraction window
    # Choose safe, generous defaults; callers can override
    max_extension = int(args[0]) if len(args) > 0 else 15000
    max_retraction = int(args[1]) if len(args) > 1 else 15000
    return max_extension, max_retraction


def main():
    if len(sys.argv) < 2:
        _print_json({
            "status": "error",
            "message": "Usage: actuator_cli.py <control|stop> ..."
        }, exit_code=1)

    cmd = sys.argv[1].strip().lower()

    if not CONTROL_AVAILABLE:
        _print_json({
            "status": "error",
            "message": "linear_actuator_control not available ({}). Ensure Python deps and lgpio are installed.".format(_IMPORT_ERROR)
        }, exit_code=1)

    try:
        if cmd == 'control':
            # Expect: control <dirPin> <pwmPin> <extend|retract> <speed> <duration_ms> [maxExtMs] [maxRetMs]
            if len(sys.argv) < 7:
                _print_json({
                    "status": "error",
                    "message": "Usage: actuator_cli.py control <directionPin> <pwmPin> <extend|retract> <speed> <duration_ms> [maxExtensionMs] [maxRetractionMs]"
                }, exit_code=1)
                return

            direction_pin = sys.argv[2]
            pwm_pin = sys.argv[3]
            human_dir = sys.argv[4]
            speed = sys.argv[5]
            duration = sys.argv[6]
            limits = sys.argv[7:9]
            max_ext, max_ret = _derive_limits(limits)

            # Map to underlying controller directions
            low_level_dir = _map_direction(human_dir)

            ok = _control_actuator(low_level_dir, speed, duration, direction_pin, pwm_pin, max_ext, max_ret)
            if ok:
                _print_json({
                    "status": "success",
                    "message": "Actuator {} for {}ms (dirPin={}, pwmPin={}, speed={})".format(human_dir, int(duration), int(direction_pin), int(pwm_pin), speed)
                }, exit_code=0)
            else:
                _print_json({"status": "error", "message": "Actuator command returned failure"}, exit_code=1)

        elif cmd == 'stop':
            # Best-effort stop: command 0% duty cycle briefly
            if len(sys.argv) < 4:
                _print_json({
                    "status": "error",
                    "message": "Usage: actuator_cli.py stop <directionPin> <pwmPin>"
                }, exit_code=1)
                return

            direction_pin = sys.argv[2]
            pwm_pin = sys.argv[3]
            # Send a 0% duty cycle for 100ms to ensure line is LOW
            ok = _control_actuator('forward', 0, 100, direction_pin, pwm_pin, 100, 100)
            if ok:
                _print_json({
                    "status": "success",
                    "message": "Actuator stopped (dirPin={}, pwmPin={})".format(int(direction_pin), int(pwm_pin))
                }, exit_code=0)
            else:
                _print_json({"status": "error", "message": "Actuator stop failed"}, exit_code=1)

        else:
            _print_json({"status": "error", "message": "Unknown command: {}".format(cmd)}, exit_code=1)

    except SystemExit as e:
        # Propagate underlying script exits if any
        raise
    except Exception as e:
        _print_json({"status": "error", "message": str(e)}, exit_code=1)


if __name__ == "__main__":
    main()

