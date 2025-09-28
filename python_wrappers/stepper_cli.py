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
import time
try:
    import lgpio  # type: ignore
    HAVE_LGPIO = True
except Exception:
    HAVE_LGPIO = False


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
        if HAVE_LGPIO:
            try:
                # Real hardware control using lgpio
                step_pin_i = int(step_pin)
                dir_pin_i = int(dir_pin)
                steps_i = int(steps)
                delay_s = max(0.0002, int(delay_us) / 1_000_000.0)
                en_pin_i = int(enable_pin) if enable_pin is not None else None

                h = lgpio.gpiochip_open(0)
                try:
                    lgpio.gpio_claim_output(h, step_pin_i)
                    lgpio.gpio_claim_output(h, dir_pin_i)
                    if en_pin_i is not None:
                        lgpio.gpio_claim_output(h, en_pin_i)
                        # A4988/DRV8825: ENABLE is active-low; 0 enables driver
                        lgpio.gpio_write(h, en_pin_i, 0)

                    # Set direction: cw -> 1, ccw -> 0 (invert in wiring if needed)
                    lgpio.gpio_write(h, dir_pin_i, 1 if direction == 'cw' else 0)
                    time.sleep(0.002)  # settle

                    # Pulse STEP pin for each step
                    for _ in range(steps_i):
                        lgpio.gpio_write(h, step_pin_i, 1)
                        time.sleep(delay_s / 2)
                        lgpio.gpio_write(h, step_pin_i, 0)
                        time.sleep(delay_s / 2)

                    ok({
                        "command": "move_steps",
                        "stepPin": step_pin,
                        "dirPin": dir_pin,
                        "direction": direction,
                        "steps": steps_i,
                        "stepDelayUs": delay_us,
                        "enablePin": enable_pin
                    })
                finally:
                    try:
                        if en_pin_i is not None:
                            # Disable driver for safety
                            lgpio.gpio_write(h, en_pin_i, 1)
                    except Exception:
                        pass
                    try:
                        lgpio.gpio_free(h, step_pin_i)
                        lgpio.gpio_free(h, dir_pin_i)
                        if en_pin_i is not None:
                            lgpio.gpio_free(h, en_pin_i)
                        lgpio.gpiochip_close(h)
                    except Exception:
                        pass
            except Exception as e:
                fail(str(e))
            return
        else:
            # Fallback simulation (CI)
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
        # Convert to steps and compute delay per step from RPM
        steps_per_rev = 200  # 1.8°/step typical
        total_steps = int(abs(revolutions) * steps_per_rev * micro)
        if total_steps <= 0:
            fail("computed zero steps for rotate")
        steps_per_sec = max(1.0, (rpm * steps_per_rev * micro) / 60.0)
        delay_us = int(max(200, 1_000_000.0 / steps_per_sec))
        # Direction may be inverted by negative revolutions
        if revolutions < 0:
            direction = 'ccw' if direction == 'cw' else 'cw'
        # Reuse move_steps implementation
        sys.argv = [sys.argv[0], 'move_steps', step_pin, dir_pin, direction, str(total_steps), str(delay_us)] + ([enable_pin] if enable_pin is not None else [])
        return main(sys.argv)

    if cmd == 'stop':
        enable_pin = argv[2] if len(argv) > 2 else None
        if HAVE_LGPIO and enable_pin is not None:
            try:
                en_pin_i = int(enable_pin)
                h = lgpio.gpiochip_open(0)
                try:
                    lgpio.gpio_claim_output(h, en_pin_i)
                    # Disable driver (active-low)
                    lgpio.gpio_write(h, en_pin_i, 1)
                finally:
                    try:
                        lgpio.gpio_free(h, en_pin_i)
                        lgpio.gpiochip_close(h)
                    except Exception:
                        pass
            except Exception as e:
                fail(str(e))
            ok({"command": "stop", "enablePin": enable_pin})
            return
        else:
            ok({"command": "stop", "enablePin": enable_pin})
            return

    fail(f"unknown command: {cmd}")


if __name__ == '__main__':
    main(sys.argv)

