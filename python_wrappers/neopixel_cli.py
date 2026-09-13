#!/usr/bin/env python3

"""
Addressable LED (WS2812 / SK6812 / "NeoPixel") wrapper for MonsterBox.

WHY THIS EXISTS, AND WHY GPIO 18
--------------------------------
Every NeoPixel guide reaches for rpi_ws281x on GPIO 18, which synthesises the
800 kHz waveform out of the BCM2835/2711 PWM peripheral. That is exactly how
PumpkinHead (a Pi 4) drives his rings — `pinctrl get 18` there reads `a5`, the
PWM0_0 alt function.

The Pi 5's RP1 removed that peripheral access, so rpi_ws281x cannot work on a
Pi 5 at all. Its replacement is RP1's PIO block, and Adafruit ships a Pi 5
backend for it (Adafruit_Blinka_Raspberry_Pi5_Neopixel, pulled in by
adafruit-blinka). That backend drives the SAME GPIO 18, so the wiring matches
PumpkinHead's exactly — no rewiring between node generations.

Proven on Renfield 2026-09-13: red, then blue, on a pair of chained rings.

NOT SPI. An earlier version of this file encoded the waveform onto SPI MOSI
(GPIO 10). It is a real technique and the encoding was correct, but it was the
wrong road here: it needed different wiring from the working Pi 4 node for no
benefit. If you find notes pointing at GPIO 10 or /dev/spidev0.0 for these
rings, they are stale.

REQUIRES ROOT. PIO needs privileged access to RP1. monsterbox.service runs as
root (install.sh), so the Node hardwareService path is fine; a hand test from a
shell needs sudo.

DEPENDENCIES (already on Renfield):
    sudo pip3 install --break-system-packages adafruit-circuitpython-neopixel

USAGE
-----
    neopixel_cli.py <pin> <count> on  [r] [g] [b] [brightness_pct]
    neopixel_cli.py <pin> <count> off

    neopixel_cli.py 18 16 on                  # white, full
    neopixel_cli.py 18 16 on 255 0 0          # red
    neopixel_cli.py 18 16 on 255 120 0 40     # amber at 40%
    neopixel_cli.py 18 16 off

Emits one JSON object on stdout, like every other wrapper.
"""

import json
import sys


def _emit(**kw):
    print(json.dumps(kw), flush=True)


def _fail(message, hint=None):
    out = {"status": "error", "message": message}
    if hint:
        out["hint"] = hint
    print(json.dumps(out), flush=True)
    sys.exit(1)


def main():
    args = sys.argv[1:]
    if len(args) < 3:
        _fail("Usage: neopixel_cli.py <pin> <count> on [r] [g] [b] [brightness_pct] | <pin> <count> off")

    try:
        pin = int(args[0])
        count = int(args[1])
    except ValueError:
        _fail(f"pin and count must be integers, got {args[0]!r} and {args[1]!r}")

    if not 0 <= pin <= 27:
        _fail(f"pin must be 0-27, got {pin}")
    if not 1 <= count <= 1000:
        _fail(f"count must be 1-1000, got {count}")

    state = args[2].lower()
    if state not in ("on", "off"):
        _fail(f"state must be 'on' or 'off', got {args[2]!r}")

    if state == "off":
        rgb = (0, 0, 0)
        brightness = 0.0
    else:
        try:
            r = int(args[3]) if len(args) > 3 else 255
            g = int(args[4]) if len(args) > 4 else 255
            b = int(args[5]) if len(args) > 5 else 255
            pct = float(args[6]) if len(args) > 6 else 100.0
        except ValueError:
            _fail("r, g, b must be integers 0-255 and brightness a number 0-100")
        for name, value in (("r", r), ("g", g), ("b", b)):
            if not 0 <= value <= 255:
                _fail(f"{name} must be 0-255, got {value}")
        if not 0 <= pct <= 100:
            _fail(f"brightness must be 0-100, got {pct}")
        rgb = (r, g, b)
        brightness = pct / 100.0

    try:
        import board
        import neopixel
    except ImportError as exc:
        _fail(
            f"adafruit-circuitpython-neopixel is not available ({exc})",
            hint="sudo pip3 install --break-system-packages adafruit-circuitpython-neopixel",
        )

    try:
        board_pin = getattr(board, f"D{pin}")
    except AttributeError:
        _fail(f"board has no D{pin} — that GPIO is not exposed by Blinka on this platform")

    try:
        # brightness must be > 0 at construction or some backends latch black and
        # ignore later writes; scale it on the pixel values for 'off' instead.
        strip = neopixel.NeoPixel(
            board_pin, count,
            brightness=(brightness if brightness > 0 else 1.0),
            auto_write=False,
        )
        strip.fill(rgb)
        strip.show()
    except PermissionError:
        _fail(
            "permission denied driving the PIO block",
            hint="PIO needs root. monsterbox.service runs as root; from a shell use sudo.",
        )
    except Exception as exc:  # noqa: BLE001 — report whatever the backend throws
        _fail(f"NeoPixel write failed: {exc}")

    _emit(
        status="success",
        message=(f"{count} pixels on pin {pin} off" if state == "off"
                 else f"{count} pixels on pin {pin} set to rgb{rgb} at {brightness * 100:g}%"),
        details={
            "pin": pin, "count": count, "state": state,
            "rgb": list(rgb), "brightness": brightness * 100,
            "backend": "adafruit neopixel (RP1 PIO on Pi 5)",
        },
    )


if __name__ == "__main__":
    main()
