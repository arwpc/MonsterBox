#!/usr/bin/env python3
"""
Standalone stepper motor exerciser for DRV8825/A4988 style drivers.

Usage examples:

    # 400 microsteps clockwise using MonsterBox Groundbreaker wiring
    python3 standalone_stepper_test.py --step-pin 22 --dir-pin 27 --enable-pin 17 \
        --steps 400 --step-delay-us 800 --direction cw

    # 3 full turns at 16x microstepping, 100 RPM
    python3 standalone_stepper_test.py --step-pin 22 --dir-pin 27 --enable-pin 17 \
        --revolutions 3 --rpm 100 --microstepping 16

The script attempts to drive the motor using lgpio, pigpio, or RPi.GPIO
(in that order). If no backend is available it exits with an error so that
hardware issues are surfaced immediately.

Recommended wiring (matching STEPPERONLINE NEMA17 + DRV8825 on MonsterBox):
    STEP  -> GPIO22 (physical pin 15)
    DIR   -> GPIO27 (physical pin 13)
    EN    -> GPIO17 (physical pin 11, active LOW)
    VCC   -> Pi 3.3V (physical pin 1)
    GND   -> Pi ground (physical pin 6)
    VMOT  -> External 12-24V supply (+)
    GND   -> External supply ground (shared with Pi)

Set the driver microstepping DIP switches to match the --microstepping value
(default 16 for DRV8825: MS1=LOW, MS2=LOW, MS3=HIGH). Adjust Vref on the
driver to ~0.70V for the 2A STEPPERONLINE motor.
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Callable, Optional


class StepperBackend:
    def __init__(self) -> None:
        self.name = ""
        self._cleanup_fn: Optional[Callable[[], None]] = None

    def setup(self, step_pin: int, dir_pin: int, enable_pin: Optional[int]) -> None:
        raise NotImplementedError

    def set_direction(self, dir_pin: int, cw: bool) -> None:
        raise NotImplementedError

    def pulse(self, step_pin: int, delay_s: float) -> None:
        raise NotImplementedError

    def enable(self, enable_pin: Optional[int], enabled: bool) -> None:
        raise NotImplementedError

    def cleanup(self) -> None:
        if self._cleanup_fn:
            try:
                self._cleanup_fn()
            except Exception:
                pass


class LGPIOBackend(StepperBackend):
    def __init__(self) -> None:
        super().__init__()
        import lgpio

        self.lgpio = lgpio
        self.handle: Optional[int] = None
        self.name = "lgpio"

    def setup(self, step_pin: int, dir_pin: int, enable_pin: Optional[int]) -> None:
        self.handle = self.lgpio.gpiochip_open(0)
        self.lgpio.gpio_claim_output(self.handle, step_pin)
        self.lgpio.gpio_claim_output(self.handle, dir_pin)
        if enable_pin is not None:
            self.lgpio.gpio_claim_output(self.handle, enable_pin)
            self.lgpio.gpio_write(self.handle, enable_pin, 1)  # disable at rest

        def cleanup() -> None:
            if self.handle is None:
                return
            for pin in (step_pin, dir_pin, enable_pin):
                if pin is None:
                    continue
                try:
                    self.lgpio.gpio_free(self.handle, pin)
                except Exception:
                    pass
            self.lgpio.gpiochip_close(self.handle)
            self.handle = None

        self._cleanup_fn = cleanup

    def set_direction(self, dir_pin: int, cw: bool) -> None:
        assert self.handle is not None
        self.lgpio.gpio_write(self.handle, dir_pin, 1 if cw else 0)

    def pulse(self, step_pin: int, delay_s: float) -> None:
        assert self.handle is not None
        self.lgpio.gpio_write(self.handle, step_pin, 1)
        time.sleep(delay_s)
        self.lgpio.gpio_write(self.handle, step_pin, 0)
        time.sleep(delay_s)

    def enable(self, enable_pin: Optional[int], enabled: bool) -> None:
        if enable_pin is None or self.handle is None:
            return
        # DRV8825 enable is active-low
        self.lgpio.gpio_write(self.handle, enable_pin, 0 if enabled else 1)


class PigpioBackend(StepperBackend):
    def __init__(self) -> None:
        super().__init__()
        import pigpio

        self.pi = pigpio.pi()
        if not self.pi.connected:
            raise RuntimeError("pigpio daemon not running")
        self.name = "pigpio"

    def setup(self, step_pin: int, dir_pin: int, enable_pin: Optional[int]) -> None:
        self.pi.set_mode(step_pin, self.pi.OUTPUT)
        self.pi.set_mode(dir_pin, self.pi.OUTPUT)
        if enable_pin is not None:
            self.pi.set_mode(enable_pin, self.pi.OUTPUT)
            self.pi.write(enable_pin, 1)

        def cleanup() -> None:
            for pin in (step_pin, dir_pin, enable_pin):
                if pin is None:
                    continue
                try:
                    self.pi.write(pin, 0)
                except Exception:
                    pass

        self._cleanup_fn = cleanup

    def set_direction(self, dir_pin: int, cw: bool) -> None:
        self.pi.write(dir_pin, 1 if cw else 0)

    def pulse(self, step_pin: int, delay_s: float) -> None:
        self.pi.write(step_pin, 1)
        time.sleep(delay_s)
        self.pi.write(step_pin, 0)
        time.sleep(delay_s)

    def enable(self, enable_pin: Optional[int], enabled: bool) -> None:
        if enable_pin is None:
            return
        self.pi.write(enable_pin, 0 if enabled else 1)


class RPiGPIOBackend(StepperBackend):
    def __init__(self) -> None:
        super().__init__()
        import RPi.GPIO as GPIO

        self.GPIO = GPIO
        self.GPIO.setmode(self.GPIO.BCM)
        self.GPIO.setwarnings(False)
        self.name = "RPi.GPIO"

    def setup(self, step_pin: int, dir_pin: int, enable_pin: Optional[int]) -> None:
        self.GPIO.setup(step_pin, self.GPIO.OUT, initial=self.GPIO.LOW)
        self.GPIO.setup(dir_pin, self.GPIO.OUT, initial=self.GPIO.LOW)
        if enable_pin is not None:
            self.GPIO.setup(enable_pin, self.GPIO.OUT, initial=self.GPIO.HIGH)

        def cleanup() -> None:
            try:
                self.GPIO.cleanup()
            except Exception:
                pass

        self._cleanup_fn = cleanup

    def set_direction(self, dir_pin: int, cw: bool) -> None:
        self.GPIO.output(dir_pin, self.GPIO.HIGH if cw else self.GPIO.LOW)

    def pulse(self, step_pin: int, delay_s: float) -> None:
        self.GPIO.output(step_pin, self.GPIO.HIGH)
        time.sleep(delay_s)
        self.GPIO.output(step_pin, self.GPIO.LOW)
        time.sleep(delay_s)

    def enable(self, enable_pin: Optional[int], enabled: bool) -> None:
        if enable_pin is None:
            return
        self.GPIO.output(enable_pin, self.GPIO.LOW if enabled else self.GPIO.HIGH)


def acquire_backend() -> StepperBackend:
    backends = [
        ("lgpio", LGPIOBackend),
        ("pigpio", PigpioBackend),
        ("RPi.GPIO", RPiGPIOBackend),
    ]
    errors = []
    for name, cls in backends:
        try:
            backend = cls()
            return backend
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    raise RuntimeError(
        "Failed to initialize any GPIO backend. Ensure lgpio, pigpio (daemon), or RPi.GPIO is installed.\n"
        + "\n".join(errors)
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="DRV8825/A4988 stepper driver exerciser")
    parser.add_argument("--step-pin", type=int, required=True, help="GPIO pin connected to STEP")
    parser.add_argument("--dir-pin", type=int, required=True, help="GPIO pin connected to DIR")
    parser.add_argument("--enable-pin", type=int, help="GPIO pin connected to EN (active low)")
    parser.add_argument("--steps", type=int, help="Number of microsteps to move")
    parser.add_argument("--revolutions", type=float, help="Full shaft revolutions to move")
    parser.add_argument("--rpm", type=float, default=60.0, help="Speed in RPM when using revolutions")
    parser.add_argument("--microstepping", type=int, default=16, help="Driver microstepping factor (1,2,4,8,16,32)")
    parser.add_argument("--direction", choices=["cw", "ccw"], default="cw", help="Rotation direction")
    parser.add_argument("--step-delay-us", type=int, help="Delay between step edges in microseconds")
    parser.add_argument("--hold", action="store_true", help="Keep motor energized after movement (EN low)")
    parser.add_argument("--cycles", type=int, default=1, help="Repeat movement multiple times with a pause")
    parser.add_argument("--cycle-delay", type=float, default=0.5, help="Seconds to pause between cycles")
    parser.add_argument("--quiet", action="store_true", help="Suppress verbose output")
    args = parser.parse_args()

    if args.steps is None and args.revolutions is None:
        parser.error("Specify --steps or --revolutions")
    if args.steps is not None and args.steps <= 0:
        parser.error("--steps must be positive")
    if args.revolutions is not None and args.revolutions == 0:
        parser.error("--revolutions cannot be zero")
    return args


def compute_motion(args: argparse.Namespace) -> tuple[int, float, bool]:
    direction_cw = args.direction == "cw"
    if args.revolutions is not None:
        steps_per_rev = 200 * max(1, args.microstepping)
        steps = int(round(abs(args.revolutions) * steps_per_rev))
        if steps == 0:
            raise ValueError("Computed zero steps from revolutions; check microstepping")
        # Adjust direction if revolutions negative
        if args.revolutions < 0:
            direction_cw = not direction_cw
        if args.step_delay_us:
            delay_us = max(200, args.step_delay_us)
        else:
            steps_per_sec = max(1.0, (args.rpm * steps_per_rev) / 60.0)
            delay_us = int(max(200, 1_000_000.0 / steps_per_sec / 2))
    else:
        steps = args.steps
        delay_us = max(200, args.step_delay_us or 800)
    return steps, delay_us / 1_000_000.0, direction_cw


def main() -> int:
    args = parse_args()
    steps, delay_s, direction_cw = compute_motion(args)

    backend = acquire_backend()
    if not args.quiet:
        print(f"Using backend: {backend.name}")
        print(
            f"Step pin {args.step_pin}, Dir pin {args.dir_pin}, Enable pin {args.enable_pin}, "
            f"steps {steps}, delay {delay_s * 1_000_000:.0f}µs, direction {'CW' if direction_cw else 'CCW'}"
        )

    backend.setup(args.step_pin, args.dir_pin, args.enable_pin)

    try:
        backend.enable(args.enable_pin, True)
        time.sleep(0.01)
        backend.set_direction(args.dir_pin, direction_cw)
        time.sleep(0.002)

        for cycle in range(args.cycles):
            if not args.quiet:
                print(f"Cycle {cycle + 1}/{args.cycles} - stepping {steps} microsteps")
            for _ in range(steps):
                backend.pulse(args.step_pin, delay_s / 2)
            if cycle < args.cycles - 1:
                time.sleep(args.cycle_delay)

        if not args.hold:
            backend.enable(args.enable_pin, False)
    finally:
        backend.cleanup()

    if not args.quiet:
        print("Done.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        raise SystemExit(130)
