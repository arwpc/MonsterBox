#!/usr/bin/env python3

"""
Linear Actuator CLI Wrapper for MonsterBox (MDD10A / Cytron path)
Calls linear_actuator_control.py with a simple, stable interface.
No simulation fallback: errors propagate with descriptive JSON.

Usage (unchanged — services/hardwareService/actuator.js depends on it):
  actuator_cli.py control <directionPin> <pwmPin> <extend|retract> <speed> <duration_ms> [maxExtensionMs] [maxRetractionMs]
  actuator_cli.py stop <directionPin> <pwmPin>

Like the other motion wrappers, this now re-applies config/hardware-safety.json
itself rather than trusting the caller to have done it: a limit enforced only in
Node is a convention, and this script is reachable directly.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mb_response import (  # noqa: E402
    E_ARGS,
    E_BUS_IO,
    E_UNSUPPORTED,
    WrapperError,
    classify,
    emit,
    emit_error,
)
import mb_safety  # noqa: E402

# Import the local linear actuator control module
try:
    from linear_actuator_control import control_actuator as _control_actuator
    CONTROL_AVAILABLE = True
except Exception as e:
    CONTROL_AVAILABLE = False
    _IMPORT_ERROR = str(e)

# The verb in flight, the part it resolved to, and any clamps the backstop
# applied — all reported in the envelope.
_OP = 'control'
_PART = None
_CLAMPS = []


def _print_json(payload, exit_code=0):
    """Emit the single result envelope.

    Kept under the old name and called from the old places so the control flow
    is unchanged; `status` and `message` are still present, which is what
    services/hardwareService reads.
    """
    ok = str(payload.get('status', 'error')) == 'success'
    if ok:
        emit(True, _OP, part=_PART, data={k: v for k, v in payload.items()
                                          if k not in ('status', 'message')},
             clamps=_CLAMPS, message=payload.get('message'), exit_code=exit_code)
    else:
        emit(False, _OP, part=_PART,
             error=WrapperError(payload.get('code', E_BUS_IO),
                                payload.get('message', 'error'),
                                payload.get('hint')),
             clamps=_CLAMPS, exit_code=exit_code or 1)


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
            "code": E_ARGS,
            "message": "Usage: actuator_cli.py <control|stop> ..."
        }, exit_code=1)

    global _OP, _PART, _CLAMPS
    cmd = sys.argv[1].strip().lower()
    _OP = cmd

    if not CONTROL_AVAILABLE:
        _print_json({
            "status": "error",
            "code": E_UNSUPPORTED,
            "message": "linear_actuator_control not available ({}). Ensure Python deps and lgpio are installed.".format(_IMPORT_ERROR),
            "hint": "Install lgpio on this node."
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

            # Safety backstop: refuse a quarantined part, refuse a retraction of
            # a part already at its mechanical minimum, and cap speed/duration —
            # all before a pin is claimed.
            character_id = mb_safety.resolve_character_id()
            part = mb_safety.find_part_by_pins(character_id, {
                'directionPin': direction_pin, 'pwmPin': pwm_pin})
            _PART = part.get('id') if part else None
            values, _CLAMPS, safety = mb_safety.guard(
                character_id, part, 'control',
                speed=float(speed), duration_ms=int(duration),
                direction=human_dir)
            speed = values['speed']
            duration = int(values['duration_ms'])

            with mb_safety.power_group(character_id, safety):
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

    except SystemExit:
        # Propagate underlying script exits (emit() uses one) unchanged
        raise
    except WrapperError as e:
        emit_error(_OP, e, part=_PART)
    except Exception as e:
        emit_error(_OP, classify(e), part=_PART)


if __name__ == "__main__":
    main()

