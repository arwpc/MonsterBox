#!/usr/bin/env python3
"""Resident GPIO pin watcher for the lurk motion (PIR) sensor.

Replaces the per-poll `gpio_read.py` spawn (one fresh python3 interpreter per
second for the life of lurk mode) with ONE long-lived process that samples the
pin and prints only state TRANSITIONS, line-buffered, to stdout:

    READY          once, when the register mapping is open
    STATE <0|1>    on every level change (and once for the initial level)

Read-only by construction: the level register (GPLEV*) is mapped PROT_READ from
/dev/gpiomem — no pin is claimed, nothing is configured as an output, so it can
never fight the sensor or any other GPIO user. Any error exits non-zero so the
Node caller (services/lurkMotionWatcherService.js) can fall back to its old
polling path as a degraded mode.
"""

import mmap
import os
import struct
import sys
import time

GPLEV0_OFFSET = 0x34  # level registers: bank 0 at 0x34, bank 1 (pins 32+) at 0x38


def read_pin(reg_map, pin):
    reg_map.seek(GPLEV0_OFFSET + 4 * (pin // 32))
    return (struct.unpack('<I', reg_map.read(4))[0] >> (pin % 32)) & 1


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: gpio_pin_watcher.py <bcm_pin> [sample_interval_ms]\n")
        return 2

    try:
        pin = int(sys.argv[1])
        interval_s = int(sys.argv[2]) / 1000.0 if len(sys.argv) > 2 else 0.1
    except ValueError as e:
        sys.stderr.write("gpio_pin_watcher bad argument: %s\n" % e)
        return 2
    # Clamp so a bad caller can neither busy-spin the CPU nor stall detection.
    interval_s = min(max(interval_s, 0.02), 5.0)

    try:
        fd = os.open('/dev/gpiomem', os.O_RDONLY | os.O_SYNC)
    except OSError as e:
        sys.stderr.write("gpio_pin_watcher cannot open /dev/gpiomem: %s\n" % e)
        return 1

    try:
        reg_map = mmap.mmap(fd, 4096, mmap.MAP_SHARED, mmap.PROT_READ)
    except Exception as e:
        os.close(fd)
        sys.stderr.write("gpio_pin_watcher mmap failed: %s\n" % e)
        return 1

    try:
        print("READY", flush=True)
        last = None
        while True:
            val = read_pin(reg_map, pin)
            if val != last:
                # Transitions only — a quiet room writes nothing, so the Node
                # side reads a handful of lines a day instead of one a second.
                print("STATE %d" % val, flush=True)
                last = val
            time.sleep(interval_s)
    except BrokenPipeError:
        return 0  # Node closed our stdout (watcher stopped) — clean exit
    except KeyboardInterrupt:
        return 0
    except Exception as e:
        sys.stderr.write("gpio_pin_watcher error: %s\n" % e)
        return 1
    finally:
        reg_map.close()
        os.close(fd)


if __name__ == '__main__':
    sys.exit(main())
