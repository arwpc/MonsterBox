#!/usr/bin/env python3
"""
Stepper CLI (simulation-friendly)

Supported commands:
- move_steps <stepPin> <dirPin> <direction:cw|ccw> <steps:int> <stepDelayUs:int> [enablePin]
- rotate <stepPin> <dirPin> <direction:cw|ccw> <revolutions:float> <microstepping:int> <rpm:int> [enablePin]
- stop [enablePin]

Outputs a single JSON line on completion for easy parsing.
This script is designed to run without GPIO dependencies in CI; it simulates success.
"""
import json
import sys


def ok(payload=None, message="success"):
    out = {"status": "success", "message": message}
    if isinstance(payload, dict):
        out.update(payload)
    print(json.dumps(out))


def fail(message="error"):
    print(json.dumps({"status": "error", "message": message}))
    sys.exit(1)


def parse_int(v, name):
    try:
        return int(v)
    except Exception:
        fail(f"invalid integer for {name}: {v}")


def parse_float(v, name):
    try:
        return float(v)
    except Exception:
        fail(f"invalid float for {name}: {v}")


def main(argv):
    if len(argv) < 2:
        fail("usage: stepper_cli.py <command> ...")
    cmd = argv[1]

    if cmd == 'move_steps':
        if len(argv) < 7:
            fail("usage: move_steps <stepPin> <dirPin> <direction> <steps> <stepDelayUs> [enablePin]")
        step_pin = argv[2]
        dir_pin = argv[3]
        direction = argv[4].lower()
        if direction not in ('cw', 'ccw'):
            fail(f"invalid direction: {direction}")
        steps = parse_int(argv[5], 'steps')
        delay_us = parse_int(argv[6], 'stepDelayUs')
        enable_pin = argv[7] if len(argv) > 7 else None
        ok({
            "command": "move_steps",
            "stepPin": step_pin,
            "dirPin": dir_pin,
            "direction": direction,
            "steps": steps,
            "stepDelayUs": delay_us,
            "enablePin": enable_pin
        })
        return

    if cmd == 'rotate':
        if len(argv) < 8:
            fail("usage: rotate <stepPin> <dirPin> <direction> <revolutions> <microstepping> <rpm> [enablePin]")
        step_pin = argv[2]
        dir_pin = argv[3]
        direction = argv[4].lower()
        if direction not in ('cw', 'ccw'):
            fail(f"invalid direction: {direction}")
        revolutions = parse_float(argv[5], 'revolutions')
        micro = parse_int(argv[6], 'microstepping')
        rpm = parse_int(argv[7], 'rpm')
        enable_pin = argv[8] if len(argv) > 8 else None
        ok({
            "command": "rotate",
            "stepPin": step_pin,
            "dirPin": dir_pin,
            "direction": direction,
            "revolutions": revolutions,
            "microstepping": micro,
            "rpm": rpm,
            "enablePin": enable_pin
        })
        return

    if cmd == 'stop':
        enable_pin = argv[2] if len(argv) > 2 else None
        ok({"command": "stop", "enablePin": enable_pin})
        return

    fail(f"unknown command: {cmd}")


if __name__ == '__main__':
    main(sys.argv)

