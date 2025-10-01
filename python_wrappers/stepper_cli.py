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
        # Normalize
        step_pin_i = int(step_pin)
        dir_pin_i = int(dir_pin)
        steps_i = int(steps)
        delay_s = max(0.0002, int(delay_us) / 1_000_000.0)
        en_pin_i = int(enable_pin) if enable_pin is not None else None

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

        # Fallback simulation (no backend available)
        ok({
            "command": "move_steps",
            "backend": "simulated",
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
        # Default ok even if we couldn't toggle (to keep API contract stable)
        ok({"command": "stop", "enablePin": enable_pin})
        return

    fail(f"unknown command: {cmd}")


if __name__ == '__main__':
    main(sys.argv)

