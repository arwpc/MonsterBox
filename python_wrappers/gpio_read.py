#!/usr/bin/env python3
"""Read a GPIO pin directly from /dev/gpiomem register. No GPIO claim, no contention.

Raspberry Pi 5 has no /dev/gpiomem (GPIO is on RP1, /dev/gpiomem0..4, different
register map), so the read below always failed there and printed -1 — with the
resident watcher failing the same way, lurk motion could never trigger on a Pi 5
(Renfield, 2026-09-26). On a Pi 5 the pin is read through lgpio instead: claim as
input with pull-down, read, free, so nothing stays claimed after this exits.
"""
import mmap, struct, os, sys
if len(sys.argv) < 2:
    print("-1")
    sys.exit(1)
try:
    pin = int(sys.argv[1])
    if os.path.exists('/dev/gpiomem'):
        fd = os.open('/dev/gpiomem', os.O_RDONLY | os.O_SYNC)
        try:
            m = mmap.mmap(fd, 4096, mmap.MAP_SHARED, mmap.PROT_READ)
            try:
                # GPLEV0 at 0x34 (pins 0-31), GPLEV1 at 0x38 (pins 32+)
                m.seek(0x34 + 4 * (pin // 32))
                val = (struct.unpack('<I', m.read(4))[0] >> (pin % 32)) & 1
            finally:
                m.close()
        finally:
            os.close(fd)
    else:
        import lgpio
        h = lgpio.gpiochip_open(0)
        try:
            lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_DOWN)
            try:
                val = 1 if lgpio.gpio_read(h, pin) == 1 else 0
            finally:
                lgpio.gpio_free(h, pin)
        finally:
            lgpio.gpiochip_close(h)
    print(val)
except Exception as e:
    # Print a sentinel the Node caller can parse (motion "not detected") instead
    # of crashing/leaking the mmap+fd and silently killing motion detection.
    print("-1")
    sys.stderr.write("gpio_read error: %s\n" % e)
    sys.exit(1)
