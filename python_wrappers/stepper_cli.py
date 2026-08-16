#!/usr/bin/env python3
"""
Stepper CLI

Supported commands:
- move_steps <stepPin> <dirPin> <direction:cw|ccw> <steps:int> <stepDelayUs:int> [enablePin]
- rotate <stepPin> <dirPin> <direction:cw|ccw> <revolutions:float> <microstepping:int> <rpm:int> [enablePin]
- stop [enablePin]

Outputs exactly one JSON envelope on stdout; everything else goes to stderr.

SIMULATION IS OPT-IN. This script used to report success when no GPIO backend
was present, which made it green in CI and dead in the garage — the operator was
told the stepper moved and it never had a driver to move it with. Simulation now
requires MB_SIMULATE_HARDWARE=1 or an explicit --simulate flag, and the envelope
says `"simulated": true` when it is used.
"""
import os
import sys
import time

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

# Try backends in priority order: lgpio -> pigpio -> RPi.GPIO
try:
    import lgpio  # type: ignore
    HAVE_LGPIO = True
except Exception:
    HAVE_LGPIO = False

try:
    import pigpio  # type: ignore
    _PIGPIO = pigpio.pi() if 'pigpio' in globals() else None
    HAVE_PIGPIO = _PIGPIO is not None and _PIGPIO.connected
except Exception:
    _PIGPIO = None
    HAVE_PIGPIO = False

try:
    import RPi.GPIO as GPIO  # type: ignore
    HAVE_RPI = True
except Exception:
    HAVE_RPI = False

SIMULATE = (os.environ.get('MB_SIMULATE_HARDWARE', '') == '1'
            or '--simulate' in sys.argv)

# The verb currently executing, so fail() can label the envelope correctly.
_OP = 'stepper'

# Clamps applied by the safety backstop for the command in flight.
_CLAMPS = []


def ok(payload=None, message=None):
    payload = dict(payload) if isinstance(payload, dict) else {}
    op = payload.pop('command', _OP)
    part = payload.pop('partId', None)
    emit(True, op, part=part, data=payload, clamps=_CLAMPS, message=message)


def fail(message="error", code=E_BUS_IO, hint=None):
    emit(False, _OP, error=WrapperError(code, message, hint), clamps=_CLAMPS)


def parse_int(v, name):
    try:
        return int(v)
    except Exception:
        fail(f"invalid integer for {name}: {v}", E_ARGS)


def parse_float(v, name):
    try:
        return float(v)
    except Exception:
        fail(f"invalid float for {name}: {v}", E_ARGS)


def guard_pins(step_pin, dir_pin, direction=None, duration_ms=None):
    """Apply config/hardware-safety.json to a stepper identified by its pins."""
    global _CLAMPS
    character_id = mb_safety.resolve_character_id()
    part = mb_safety.find_part_by_pins(character_id, {'stepPin': step_pin,
                                                     'dirPin': dir_pin})
    values, clamps, safety = mb_safety.guard(
        character_id, part, _OP, direction=direction, duration_ms=duration_ms)
    _CLAMPS = clamps
    return part, values, safety


def main(argv):
    if len(argv) < 2:
        fail("usage: stepper_cli.py <command> ...", E_ARGS)
    cmd = argv[1]

    if cmd == 'move_steps':
        if len(argv) < 7:
            fail("usage: move_steps <stepPin> <dirPin> <direction> <steps> <stepDelayUs> [enablePin]", E_ARGS)
        step_pin = argv[2]
        dir_pin = argv[3]
        direction = argv[4].lower()
        if direction not in ('cw', 'ccw'):
            fail(f"invalid direction: {direction}", E_ARGS)
        steps = parse_int(argv[5], 'steps')
        delay_us = parse_int(argv[6], 'stepDelayUs')
        enable_pin = argv[7] if len(argv) > 7 else None
        # Normalize
        step_pin_i = int(step_pin)
        dir_pin_i = int(dir_pin)
        steps_i = int(steps)
        delay_s = max(0.0002, int(delay_us) / 1_000_000.0)
        en_pin_i = int(enable_pin) if enable_pin is not None else None

        # Safety backstop: refuse a quarantined part and clamp how long the
        # driver may stay energized, before any pin is claimed.
        try:
            _part, values, _safety = guard_pins(
                step_pin_i, dir_pin_i, direction=direction,
                duration_ms=int(steps_i * delay_us / 1000.0))
        except WrapperError as exc:
            emit_error(_OP, exc)
            return
        allowed_ms = values.get('duration_ms')
        if allowed_ms is not None and steps_i * delay_us / 1000.0 > allowed_ms:
            steps_i = max(1, int((allowed_ms * 1000.0) / max(1, delay_us)))

        if HAVE_LGPIO:
            try:
                h = lgpio.gpiochip_open(0)
                try:
                    lgpio.gpio_claim_output(h, step_pin_i)
                    lgpio.gpio_claim_output(h, dir_pin_i)
                    if en_pin_i is not None:
                        lgpio.gpio_claim_output(h, en_pin_i)
                        lgpio.gpio_write(h, en_pin_i, 0)  # active low enable
                    lgpio.gpio_write(h, dir_pin_i, 1 if direction == 'cw' else 0)
                    time.sleep(0.002)
                    for _ in range(steps_i):
                        lgpio.gpio_write(h, step_pin_i, 1)
                        time.sleep(delay_s / 2)
                        lgpio.gpio_write(h, step_pin_i, 0)
                        time.sleep(delay_s / 2)
                    ok({
                        "command": "move_steps",
                        "backend": "lgpio",
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
                            lgpio.gpio_write(h, en_pin_i, 1)  # disable
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

        if HAVE_PIGPIO:
            try:
                pi = _PIGPIO
                pi.set_mode(step_pin_i, pigpio.OUTPUT)
                pi.set_mode(dir_pin_i, pigpio.OUTPUT)
                if en_pin_i is not None:
                    pi.set_mode(en_pin_i, pigpio.OUTPUT)
                    pi.write(en_pin_i, 0)  # active low enable
                pi.write(dir_pin_i, 1 if direction == 'cw' else 0)
                time.sleep(0.002)
                for _ in range(steps_i):
                    pi.write(step_pin_i, 1)
                    time.sleep(delay_s / 2)
                    pi.write(step_pin_i, 0)
                    time.sleep(delay_s / 2)
                ok({
                    "command": "move_steps",
                    "backend": "pigpio",
                    "stepPin": step_pin,
                    "dirPin": dir_pin,
                    "direction": direction,
                    "steps": steps_i,
                    "stepDelayUs": delay_us,
                    "enablePin": enable_pin
                })
            except Exception as e:
                fail(str(e))
            finally:
                try:
                    if en_pin_i is not None:
                        pi.write(en_pin_i, 1)
                except Exception:
                    pass
            return

        if HAVE_RPI:
            try:
                GPIO.setmode(GPIO.BCM)
                GPIO.setwarnings(False)
                GPIO.setup(step_pin_i, GPIO.OUT)
                GPIO.setup(dir_pin_i, GPIO.OUT)
                if en_pin_i is not None:
                    GPIO.setup(en_pin_i, GPIO.OUT)
                    GPIO.output(en_pin_i, GPIO.LOW)  # active low enable
                GPIO.output(dir_pin_i, GPIO.HIGH if direction == 'cw' else GPIO.LOW)
                time.sleep(0.002)
                for _ in range(steps_i):
                    GPIO.output(step_pin_i, GPIO.HIGH)
                    time.sleep(delay_s / 2)
                    GPIO.output(step_pin_i, GPIO.LOW)
                    time.sleep(delay_s / 2)
                ok({
                    "command": "move_steps",
                    "backend": "RPi.GPIO",
                    "stepPin": step_pin,
                    "dirPin": dir_pin,
                    "direction": direction,
                    "steps": steps_i,
                    "stepDelayUs": delay_us,
                    "enablePin": enable_pin
                })
            except Exception as e:
                fail(str(e))
            finally:
                try:
                    if en_pin_i is not None:
                        GPIO.output(en_pin_i, GPIO.HIGH)
                except Exception:
                    pass
                try:
                    GPIO.cleanup([p for p in [step_pin_i, dir_pin_i, en_pin_i] if p is not None])
                except Exception:
                    pass
            return

        # No GPIO backend. Reporting success here is how a dead stepper looked
        # healthy for a whole release — say so instead, unless simulation was
        # explicitly asked for.
        if not SIMULATE:
            fail("no GPIO backend available (lgpio, pigpio and RPi.GPIO all absent)",
                 E_UNSUPPORTED,
                 hint="Install lgpio on this node, or pass --simulate / set "
                      "MB_SIMULATE_HARDWARE=1 if you deliberately want a dry run.")
        ok({
            "command": "move_steps",
            "backend": "simulated",
            "simulated": True,
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
            fail("usage: rotate <stepPin> <dirPin> <direction> <revolutions> <microstepping> <rpm> [enablePin]", E_ARGS)
        step_pin = argv[2]
        dir_pin = argv[3]
        direction = argv[4].lower()
        if direction not in ('cw', 'ccw'):
            fail(f"invalid direction: {direction}", E_ARGS)
        revolutions = parse_float(argv[5], 'revolutions')
        micro = parse_int(argv[6], 'microstepping')
        rpm = parse_int(argv[7], 'rpm')
        enable_pin = argv[8] if len(argv) > 8 else None
        # Convert to steps and compute delay per step from RPM
        steps_per_rev = 200  # 1.8°/step typical
        total_steps = int(abs(revolutions) * steps_per_rev * micro)
        if total_steps <= 0:
            fail("computed zero steps for rotate", E_ARGS)
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
        if enable_pin is None:
            ok({"command": "stop", "enablePin": enable_pin})
            return
        try:
            en_pin_i = int(enable_pin)
        except Exception:
            en_pin_i = None
        # Try all backends to disable driver
        if en_pin_i is not None and HAVE_LGPIO:
            try:
                h = lgpio.gpiochip_open(0)
                try:
                    lgpio.gpio_claim_output(h, en_pin_i)
                    lgpio.gpio_write(h, en_pin_i, 1)
                finally:
                    try:
                        lgpio.gpio_free(h, en_pin_i)
                        lgpio.gpiochip_close(h)
                    except Exception:
                        pass
                ok({"command": "stop", "enablePin": enable_pin})
                return
            except Exception:
                pass
        if en_pin_i is not None and HAVE_PIGPIO:
            try:
                pi = _PIGPIO
                pi.set_mode(en_pin_i, pigpio.OUTPUT)
                pi.write(en_pin_i, 1)
                ok({"command": "stop", "enablePin": enable_pin})
                return
            except Exception:
                pass
        if en_pin_i is not None and HAVE_RPI:
            try:
                GPIO.setmode(GPIO.BCM)
                GPIO.setwarnings(False)
                GPIO.setup(en_pin_i, GPIO.OUT)
                GPIO.output(en_pin_i, GPIO.HIGH)
                ok({"command": "stop", "enablePin": enable_pin})
                return
            except Exception:
                pass
        # An enable pin was named but no backend could drive it. A stop that
        # silently did nothing is exactly the failure this file is being fixed
        # for, so it reports rather than pretends.
        if not SIMULATE:
            fail(f"could not disable the driver on pin {enable_pin} — no usable GPIO backend",
                 E_UNSUPPORTED,
                 hint="Install lgpio on this node, or pass --simulate / set "
                      "MB_SIMULATE_HARDWARE=1 for a dry run.")
        ok({"command": "stop", "enablePin": enable_pin, "simulated": True})
        return

    fail(f"unknown command: {cmd}", E_UNSUPPORTED)


def _entry():
    global _OP
    argv = [a for a in sys.argv if a != '--simulate']
    _OP = argv[1] if len(argv) > 1 else 'stepper'
    try:
        main(argv)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - classified, never swallowed
        emit_error(_OP, classify(exc))


if __name__ == '__main__':
    _entry()

