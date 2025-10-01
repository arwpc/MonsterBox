#!/usr/bin/env python3
"""Simple DRV8825/A4988 diagnostic script for Raspberry Pi GPIO.

Usage:
    python3 test_stepper_gpio.py [stepPin dirPin enPin steps delay_us]

Default pin order matches the current Groundbreaker wiring:
    STEP -> GPIO22
    DIR  -> GPIO27
    EN   -> GPIO17 (active-low enable)

The script will:
  * Enable the driver (drive EN low)
  * Pulse STEP the requested number of times at the given delay
  * Flip direction and pulse again (optional)
  * Disable the driver (drive EN high)

Move the motor to open air before running to avoid mechanical strain.
"""

import sys
import time
import argparse

try:
    import RPi.GPIO as GPIO  # type: ignore
except Exception as exc:  # pragma: no cover - only on non-Pi hosts
    print(f"RPi.GPIO import failed: {exc}")
    sys.exit(1)

# Defaults tuned to current wiring
DEFAULT_STEP_PIN = 22
DEFAULT_DIR_PIN = 27
DEFAULT_EN_PIN = 17
DEFAULT_STEPS = 200
DEFAULT_DELAY_US = 1000


def pulse_steps(step_pin: int, steps: int, delay_us: int) -> None:
    """Pulse the STEP pin for the requested number of steps."""
    delay_s = max(0.0002, delay_us / 1_000_000.0)
    half_delay = delay_s / 2
    for _ in range(max(0, steps)):
        GPIO.output(step_pin, GPIO.HIGH)
        time.sleep(half_delay)
        GPIO.output(step_pin, GPIO.LOW)
        time.sleep(half_delay)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="DRV8825 diagnostic stepper pulse script")
    parser.add_argument("step_pin", type=int, nargs="?", default=DEFAULT_STEP_PIN,
                        help="BCM GPIO pin for STEP (default: %(default)s)")
    parser.add_argument("dir_pin", type=int, nargs="?", default=DEFAULT_DIR_PIN,
                        help="BCM GPIO pin for DIR (default: %(default)s)")
    parser.add_argument("en_pin", type=int, nargs="?", default=DEFAULT_EN_PIN,
                        help="BCM GPIO pin for EN (active low) (default: %(default)s)")
    parser.add_argument("steps", type=int, nargs="?", default=DEFAULT_STEPS,
                        help="Number of steps to pulse (default: %(default)s)")
    parser.add_argument("delay_us", type=int, nargs="?", default=DEFAULT_DELAY_US,
                        help="Delay per step in microseconds (default: %(default)s)")
    parser.add_argument("--direction", choices=["cw", "ccw"], default="cw",
                        help="Initial direction (default: %(default)s)")
    parser.add_argument("--reverse", action="store_true",
                        help="After first pulse block, flip direction and pulse again")

    args = parser.parse_args(argv)

    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

    GPIO.setup(args.step_pin, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(args.dir_pin, GPIO.OUT, initial=GPIO.HIGH if args.direction == "cw" else GPIO.LOW)
    GPIO.setup(args.en_pin, GPIO.OUT, initial=GPIO.HIGH)  # start disabled

    print(f"Configured STEP={args.step_pin}, DIR={args.dir_pin}, EN={args.en_pin}, steps={args.steps}, delay={args.delay_us}us")

    try:
        # Enable driver
        GPIO.output(args.en_pin, GPIO.LOW)
        print("EN -> LOW (driver enabled)")
        time.sleep(0.005)

        # First pulse block
        GPIO.output(args.dir_pin, GPIO.HIGH if args.direction == "cw" else GPIO.LOW)
        print(f"DIR -> {'HIGH (cw)' if args.direction == 'cw' else 'LOW (ccw)'}")
        pulse_steps(args.step_pin, args.steps, args.delay_us)
        print("Finished first pulse block")

        if args.reverse:
            # Brief pause, reverse direction
            time.sleep(0.05)
            GPIO.output(args.dir_pin, GPIO.LOW if args.direction == "cw" else GPIO.HIGH)
            print("DIR -> Toggled (reverse)")
            pulse_steps(args.step_pin, args.steps, args.delay_us)
            print("Finished reverse pulse block")

        print("Pulsing complete")
    finally:
        GPIO.output(args.en_pin, GPIO.HIGH)
        print("EN -> HIGH (driver disabled)")
        GPIO.cleanup([args.step_pin, args.dir_pin, args.en_pin])
        print("GPIO cleanup complete")

    return 0


if __name__ == "__main__":
    sys.exit(main())
