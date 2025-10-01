#!/usr/bin/env python3
"""
Direct Stepper Diagnostic Script for MonsterBox

This utility bypasses the MonsterBox hardware service and talks straight to the
GPIO layer so you can confirm that STEP, DIR, and EN pins are actually toggling.

It shares the same pin defaults as the Groundbreaker character:
  * STEP  -> GPIO22 (physical pin 15)
  * DIR   -> GPIO27 (physical pin 13)
  * ENABLE-> GPIO17 (physical pin 11, active LOW)

Example usage:
    python3 stepper_direct_test.py --step 22 --dir 27 --enable 17 --steps 400 --delay-us 800

Optional flags:
    --direction ccw            Run counter-clockwise
    --disable-after            Drive EN high at the end (default true for safety)
    --hold-ms 2000             Keep EN asserted low for a number of milliseconds so
                               you can measure coil current / holding torque.
    --report-only              Do not toggle GPIO, just print detected backend info.

The script tries backends in this order: lgpio, pigpio, RPi.GPIO. If none are
available it reports the failure without changing any pins.
"""
import argparse
import sys
import time
from contextlib import contextmanager

BACKEND = None
LGPIO_HANDLE = None

try:
    import lgpio  # type: ignore
    BACKEND = 'lgpio'
except Exception:  # pragma: no cover - fallback chain
    try:
        import pigpio  # type: ignore
        _PIGPIO = pigpio.pi()
        if _PIGPIO and _PIGPIO.connected:
            BACKEND = 'pigpio'
    except Exception:
        try:
            import RPi.GPIO as GPIO  # type: ignore
            BACKEND = 'RPi.GPIO'
        except Exception:
            BACKEND = None


def fail(msg: str) -> None:
    print(f"ERROR: {msg}")
    sys.exit(1)


def info(msg: str) -> None:
    print(f"INFO: {msg}")


@contextmanager
def gpio_session(step_pin: int, dir_pin: int, enable_pin: int | None):
    global LGPIO_HANDLE
    if BACKEND == 'lgpio':
        try:
            LGPIO_HANDLE = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(LGPIO_HANDLE, step_pin)
            lgpio.gpio_claim_output(LGPIO_HANDLE, dir_pin)
            if enable_pin is not None:
                lgpio.gpio_claim_output(LGPIO_HANDLE, enable_pin)
            yield
        finally:
            if LGPIO_HANDLE is not None:
                try:
                    if enable_pin is not None:
                        lgpio.gpio_write(LGPIO_HANDLE, enable_pin, 1)
                        lgpio.gpio_free(LGPIO_HANDLE, enable_pin)
                    lgpio.gpio_free(LGPIO_HANDLE, step_pin)
                    lgpio.gpio_free(LGPIO_HANDLE, dir_pin)
                    lgpio.gpiochip_close(LGPIO_HANDLE)
                except Exception:
                    pass
    elif BACKEND == 'pigpio':
        try:
            _PIGPIO.set_mode(step_pin, pigpio.OUTPUT)
            _PIGPIO.set_mode(dir_pin, pigpio.OUTPUT)
            if enable_pin is not None:
                _PIGPIO.set_mode(enable_pin, pigpio.OUTPUT)
            yield
        finally:
            if enable_pin is not None:
                try:
                    _PIGPIO.write(enable_pin, 1)
                except Exception:
                    pass
    elif BACKEND == 'RPi.GPIO':
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(step_pin, GPIO.OUT)
        GPIO.setup(dir_pin, GPIO.OUT)
        if enable_pin is not None:
            GPIO.setup(enable_pin, GPIO.OUT)
        try:
            yield
        finally:
            if enable_pin is not None:
                try:
                    GPIO.output(enable_pin, GPIO.HIGH)
                except Exception:
                    pass
            GPIO.cleanup([p for p in (step_pin, dir_pin, enable_pin) if p is not None])
    else:
        fail("No GPIO backend available (lgpio/pigpio/RPi.GPIO)")


def set_dir(direction: str, dir_pin: int) -> None:
    level = 1 if direction == 'cw' else 0
    if BACKEND == 'lgpio':
        lgpio.gpio_write(LGPIO_HANDLE, dir_pin, level)
    elif BACKEND == 'pigpio':
        _PIGPIO.write(dir_pin, level)
    elif BACKEND == 'RPi.GPIO':
        GPIO.output(dir_pin, GPIO.HIGH if level else GPIO.LOW)


def drive_enable(enable_pin: int | None, asserted: bool) -> None:
    if enable_pin is None:
        return
    level = 0 if asserted else 1  # active low
    if BACKEND == 'lgpio':
        lgpio.gpio_write(LGPIO_HANDLE, enable_pin, level)
    elif BACKEND == 'pigpio':
        _PIGPIO.write(enable_pin, level)
    elif BACKEND == 'RPi.GPIO':
        GPIO.output(enable_pin, GPIO.LOW if asserted else GPIO.HIGH)


def pulse_steps(step_pin: int, steps: int, delay_us: int) -> None:
    delay_s = max(0.0001, delay_us / 1_000_000)
    for _ in range(steps):
        if BACKEND == 'lgpio':
            lgpio.gpio_write(LGPIO_HANDLE, step_pin, 1)
            time.sleep(delay_s / 2)
            lgpio.gpio_write(LGPIO_HANDLE, step_pin, 0)
            time.sleep(delay_s / 2)
        elif BACKEND == 'pigpio':
            _PIGPIO.write(step_pin, 1)
            time.sleep(delay_s / 2)
            _PIGPIO.write(step_pin, 0)
            time.sleep(delay_s / 2)
        elif BACKEND == 'RPi.GPIO':
            GPIO.output(step_pin, GPIO.HIGH)
            time.sleep(delay_s / 2)
            GPIO.output(step_pin, GPIO.LOW)
            time.sleep(delay_s / 2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone stepper diagnostic harness")
    parser.add_argument('--step', type=int, default=22, help='GPIO for STEP (BCM numbering)')
    parser.add_argument('--dir', type=int, default=27, help='GPIO for DIR (BCM numbering)')
    parser.add_argument('--enable', type=int, default=17, help='GPIO for ENABLE (active low)')
    parser.add_argument('--steps', type=int, default=200, help='Number of steps to execute')
    parser.add_argument('--delay-us', type=int, default=800, help='Delay per step (µs)')
    parser.add_argument('--direction', choices=['cw', 'ccw'], default='cw')
    parser.add_argument('--hold-ms', type=int, default=0, help='Hold EN low for this many ms after stepping')
    parser.add_argument('--report-only', action='store_true', help="Print backend and exit")
    parser.add_argument('--no-disable', action='store_true', help="Leave EN asserted on exit (dangerous)")
    args = parser.parse_args()

    info(f"Detected GPIO backend: {BACKEND or 'none'}")
    if args.report_only:
        return

    if BACKEND is None:
        fail('No GPIO backend available to toggle pins')

    info(f"STEP pin {args.step}, DIR pin {args.dir}, ENABLE pin {args.enable}")
    info(f"Command: {args.direction} {args.steps} steps @ {args.delay_us} µs")

    with gpio_session(args.step, args.dir, args.enable):
        time.sleep(0.01)
        set_dir(args.direction, args.dir)
        drive_enable(args.enable, True)
        time.sleep(0.002)
        pulse_steps(args.step, args.steps, args.delay_us)
        if args.hold_ms > 0:
            info(f"Holding enable low for {args.hold_ms} ms")
            time.sleep(args.hold_ms / 1000.0)
        if not args.no_disable:
            drive_enable(args.enable, False)

    info("Sequence complete")


if __name__ == '__main__':
    main()
