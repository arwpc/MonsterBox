#!/usr/bin/env python3

"""
Addressable LED (WS2812 / SK6812 / "NeoPixel") wrapper for MonsterBox — over SPI.

WHY SPI AND NOT rpi_ws281x
--------------------------
Every NeoPixel tutorial reaches for rpi_ws281x, which generates the 800 kHz line
out of the BCM2835/2711 PWM + DMA peripherals and therefore wants GPIO 18. The
Pi 5's RP1 removed that register access entirely, so that library does not work
on a Pi 5 at all — not "badly", not "with a workaround": the peripheral it drives
is not reachable. Renfield is a Pi 5.

SPI MOSI can carry the same waveform. Each WS2812 bit becomes three SPI bits
clocked at 2.4 MHz (one SPI bit = 417 ns):

    WS2812 '1'  ->  0b110   ~833 ns high, ~417 ns low
    WS2812 '0'  ->  0b100   ~417 ns high, ~833 ns low

Both sit inside the WS2812's T0H/T1H tolerance. MOSI idles low, which is exactly
the reset condition the chip wants between frames.

CONSEQUENCE: the data line is GPIO 10 (header pin 19, SPI0 MOSI). NOT GPIO 18.

THE 3.3 V PROBLEM — read this before blaming the code
-----------------------------------------------------
The Pi drives MOSI at 3.3 V. A WS2812 running on 5 V wants VIH >= 0.7 x VDD =
3.5 V. 3.3 V is BELOW spec. Plenty of rings work anyway; plenty do not, and some
work at room temperature and fail in a cold yard. If the first pixel lights and
the rest are wrong colours, or nothing lights while everything here reports
success, that margin is the first suspect — not this script. Two fixes:
  * power the ring from ~4.5 V instead of 5 V, which drops the threshold to 3.15 V
    (a single silicon diode in the ring's +5 V leg does this); or
  * put a 74AHCT125 level shifter on the data line, which is the proper fix.

POWER
-----
A WS2812 pixel pulls ~60 mA at full white. A 16-pixel ring is ~1 A; two rings
approach 2 A. That must NOT come from the Pi's 5 V header pins. Feed the rings
from the buck converter directly and bond grounds.

USAGE
-----
    neopixel_cli.py <count> <r> <g> <b> [brightness_pct]
    neopixel_cli.py <count> off

    neopixel_cli.py 16 255 0 0          # 16 pixels, full red
    neopixel_cli.py 16 255 120 0 40     # amber at 40% brightness
    neopixel_cli.py 16 off

Emits one JSON object on stdout, like every other wrapper.
"""

import json
import sys

SPI_BUS = 0
SPI_DEVICE = 0
SPI_HZ = 2_400_000

# Idle low long enough for the chip to latch the frame. At 2.4 MHz one byte is
# 3.33 us, so 30 bytes is ~100 us — comfortably past the >50 us reset the
# WS2812 family needs, and cheap enough not to matter.
RESET_BYTES = 30


def _fail(message, hint=None):
    out = {"status": "error", "message": message}
    if hint:
        out["hint"] = hint
    print(json.dumps(out), flush=True)
    sys.exit(1)


def encode(pixels):
    """Encode [(r, g, b), ...] into the SPI byte stream the WS2812 expects.

    Wire order is GRB, not RGB — getting this wrong is the classic "my reds are
    green" bug, so it is done here once and never at the call site.
    """
    bits = []
    for (r, g, b) in pixels:
        for byte in (g, r, b):
            for shift in range(7, -1, -1):
                if (byte >> shift) & 1:
                    bits.extend((1, 1, 0))
                else:
                    bits.extend((1, 0, 0))

    out = bytearray()
    for i in range(0, len(bits), 8):
        chunk = bits[i:i + 8]
        chunk += [0] * (8 - len(chunk))
        value = 0
        for bit in chunk:
            value = (value << 1) | bit
        out.append(value)
    return bytes(out) + bytes(RESET_BYTES)


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        _fail("Usage: neopixel_cli.py <count> <r> <g> <b> [brightness_pct] | <count> off")

    try:
        count = int(args[0])
    except ValueError:
        _fail(f"count must be an integer, got {args[0]!r}")
    if not 1 <= count <= 1000:
        _fail(f"count must be 1-1000, got {count}")

    if args[1].lower() == "off":
        r = g = b = 0
        brightness = 0
    else:
        if len(args) < 4:
            _fail("Need <count> <r> <g> <b>, or <count> off")
        try:
            r, g, b = (int(args[1]), int(args[2]), int(args[3]))
        except ValueError:
            _fail("r, g and b must be integers 0-255")
        for name, value in (("r", r), ("g", g), ("b", b)):
            if not 0 <= value <= 255:
                _fail(f"{name} must be 0-255, got {value}")
        brightness = float(args[4]) if len(args) > 4 else 100.0
        if not 0 <= brightness <= 100:
            _fail(f"brightness must be 0-100, got {brightness}")

    scale = brightness / 100.0
    pixel = (int(r * scale), int(g * scale), int(b * scale))

    try:
        import spidev
    except ImportError:
        _fail(
            "python3-spidev is not installed",
            hint="sudo apt install -y python3-spidev",
        )

    spi = spidev.SpiDev()
    try:
        spi.open(SPI_BUS, SPI_DEVICE)
    except FileNotFoundError:
        _fail(
            f"/dev/spidev{SPI_BUS}.{SPI_DEVICE} does not exist — SPI is not enabled",
            hint="Add dtparam=spi=on to /boot/firmware/config.txt and reboot, "
                 "or run: sudo raspi-config nonint do_spi 0",
        )
    except PermissionError:
        _fail(
            f"no permission on /dev/spidev{SPI_BUS}.{SPI_DEVICE}",
            hint="Add this user to the spi group: sudo usermod -aG spi $USER, then log out and in.",
        )

    try:
        spi.max_speed_hz = SPI_HZ
        spi.mode = 0
        spi.writebytes2(encode([pixel] * count))
    except Exception as exc:  # noqa: BLE001 - report anything the bus throws
        _fail(f"SPI write failed: {exc}")
    finally:
        spi.close()

    print(json.dumps({
        "status": "success",
        "message": (f"{count} pixels off" if brightness == 0
                    else f"{count} pixels set to rgb({r},{g},{b}) at {brightness:g}%"),
        "details": {
            "count": count, "rgb": [r, g, b], "brightness": brightness,
            "applied": list(pixel), "spi": f"{SPI_BUS}.{SPI_DEVICE}", "hz": SPI_HZ,
            "dataPin": "GPIO 10 (header pin 19, SPI0 MOSI)",
        },
    }), flush=True)


if __name__ == "__main__":
    main()
