#!/usr/bin/env python3
"""Read a GPIO pin directly from /dev/gpiomem register. No GPIO claim, no contention."""
import mmap, struct, os, sys
if len(sys.argv) < 2:
    print("-1")
    sys.exit(1)
try:
    pin = int(sys.argv[1])
    fd = os.open('/dev/gpiomem', os.O_RDONLY | os.O_SYNC)
    try:
        m = mmap.mmap(fd, 4096, mmap.MAP_SHARED, mmap.PROT_READ)
        try:
            m.seek(0x34)
            val = (struct.unpack('<I', m.read(4))[0] >> pin) & 1
        finally:
            m.close()
    finally:
        os.close(fd)
    print(val)
except Exception as e:
    # Print a sentinel the Node caller can parse (motion "not detected") instead
    # of crashing/leaking the mmap+fd and silently killing motion detection.
    print("-1")
    sys.stderr.write("gpio_read error: %s\n" % e)
    sys.exit(1)
